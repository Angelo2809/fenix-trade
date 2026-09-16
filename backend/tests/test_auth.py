from datetime import timedelta
from sqlalchemy import select
from fastapi.testclient import TestClient
from app.main import app
from app.models import User, Session, AuditLog, now
from app.security import digest
from conftest import login, PASSWORD, ADMIN_EMAIL


def create_partner(admin):
    response = admin.post("/api/admin/users", json={"name": "Test Partner", "email": "partner@example.com", "role": "PARTNER"})
    assert response.status_code == 201
    return response.json()


def test_login_valid_cookie_hash_and_no_secrets(client, db):
    result = login(client)
    assert result.status_code == 200
    assert "HttpOnly" in result.headers["set-cookie"]
    session = db.scalar(select(Session))
    assert session.token_hash == digest(client.cookies.get("fenix_session"))
    assert "password_hash" not in result.text
    assert client.get("/api/dashboard").status_code == 200


def test_login_invalid_generic(client):
    assert login(client, password="wrong").json()["detail"] == login(client, email="absent@example.com", password="wrong").json()["detail"]


def test_disabled_user(client, db):
    user = db.scalar(select(User))
    user.is_active = False
    db.commit()
    assert login(client).status_code == 401


def test_temporary_password_required_and_rotated(admin, db):
    created = create_partner(admin)
    temp = created["temporary_password"]
    assert login(admin, "partner@example.com", temp).json()["state"] == "PASSWORD_CHANGE_REQUIRED"
    old = admin.cookies.get("fenix_session")
    assert admin.get("/api/dashboard").status_code == 403
    assert admin.get("/api/accounts").status_code == 403
    changed = admin.post("/api/auth/change-password", json={"current_password": temp, "new_password": "permanent-partner-password"})
    assert changed.status_code == 200
    assert admin.cookies.get("fenix_session") != old
    assert db.scalar(select(Session).where(Session.token_hash == digest(old))).revoked_at
    assert admin.get("/api/dashboard").status_code == 200
    assert admin.get("/api/admin/users").status_code == 403
    assert login(admin, "partner@example.com", temp).status_code == 401


def test_expired_temporary_password(admin, db):
    created = create_partner(admin)
    user = db.get(User, created["user"]["id"])
    user.temporary_password_expires_at = now() - timedelta(hours=1)
    db.commit()
    assert login(admin, "partner@example.com", created["temporary_password"]).status_code == 401


def test_reset_revokes_sessions_and_old_password(admin, db):
    created = create_partner(admin)
    with TestClient(app, headers={"origin": "http://localhost:3000"}) as partner:
        login(partner, "partner@example.com", created["temporary_password"])
        partner.post(
            "/api/auth/change-password", json={"current_password": created["temporary_password"], "new_password": "partner-permanent-pass"}
        )
        reset = admin.post(f"/api/admin/users/{created['user']['id']}/reset-access")
        assert reset.status_code == 200
        assert partner.get("/api/auth/me").status_code == 401
        assert login(partner, "partner@example.com", "partner-permanent-pass").status_code == 401
        assert login(partner, "partner@example.com", reset.json()["temporary_password"]).status_code == 200


def test_csrf_and_origin(admin):
    assert admin.post("/api/auth/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert admin.post("/api/auth/logout", headers={"origin": "https://evil.example"}).status_code == 403
    assert admin.post("/api/auth/logout").status_code == 200
    assert admin.get("/api/auth/me").status_code == 401


def test_idle_and_absolute_expiration(admin, db):
    session = db.scalar(select(Session))
    session.last_activity_at = now() - timedelta(hours=2)
    db.commit()
    assert admin.get("/api/auth/me").status_code == 401
    login(admin)
    session = db.scalar(select(Session).order_by(Session.created_at.desc()))
    session.expires_at = now() - timedelta(seconds=1)
    db.commit()
    assert admin.get("/api/auth/me").status_code == 401


def test_login_lockout(client, db):
    for _ in range(5):
        assert login(client, password="invalid").status_code == 401
    assert login(client).status_code == 401
    assert db.scalar(select(User)).locked_until > now()


def test_ip_rate_limit(client, monkeypatch):
    from app.main import cfg

    monkeypatch.setattr(cfg, "login_limit", 2)
    login(client, email="missing@example.com")
    login(client, email="missing@example.com")
    assert login(client).status_code == 429


def test_self_demote_blocked_and_public_signup_missing(admin):
    user = admin.get("/api/auth/me").json()
    assert admin.patch(f"/api/admin/users/{user['id']}", json={"name": "Admin", "email": ADMIN_EMAIL, "role": "PARTNER"}).status_code == 400
    assert admin.post("/api/auth/register", json={}).status_code == 404


def test_change_password_revokes_all_devices(admin):
    with TestClient(app, headers={"origin": "http://localhost:3000"}) as other:
        login(other)
        assert (
            admin.post(
                "/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "a-new-private-password"}
            ).status_code
            == 200
        )
        assert other.get("/api/auth/me").status_code == 401
        assert admin.get("/api/auth/me").status_code == 200


def test_permanent_password_minimum_is_eight_characters(admin):
    created = create_partner(admin)
    temporary = created["temporary_password"]
    assert login(admin, "partner@example.com", temporary).status_code == 200
    too_short = admin.post("/api/auth/change-password", json={"current_password": temporary, "new_password": "1234567"})
    assert too_short.status_code == 422
    accepted = admin.post("/api/auth/change-password", json={"current_password": temporary, "new_password": "12345678"})
    assert accepted.status_code == 200


def test_audit_has_no_credentials(admin, db):
    created = create_partner(admin)
    logs = list(db.scalars(select(AuditLog)))
    assert any(log.action == "USER_CREATED" for log in logs)
    serialized = str([(log.action, log.details) for log in logs])
    assert PASSWORD not in serialized
    assert created["temporary_password"] not in serialized
    assert admin.cookies.get("fenix_session") not in serialized
