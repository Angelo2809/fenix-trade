import hashlib
import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .db import get_db
from .models import User, Session, AuditLog, now

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(24))
COOKIE = "fenix_session"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def verify(password_hash: str, password: str) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def audit(db, request, action, user_id=None, **details):
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            details=details,
            ip_address=request.client.host if request and request.client else "cli",
            user_agent=request.headers.get("user-agent", "")[:512] if request else "cli",
        )
    )


def revoke(db, user_id):
    db.execute(update(Session).where(Session.user_id == user_id, Session.revoked_at.is_(None)).values(revoked_at=now()))


def issue_session(db, user, request, response, remember=False):
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    cfg = settings()
    duration = (
        timedelta(minutes=20)
        if user.must_change_password
        else (timedelta(days=cfg.remember_session_days) if remember else timedelta(hours=cfg.session_hours))
    )
    db.add(
        Session(
            user_id=user.id,
            token_hash=digest(token),
            csrf_hash=digest(csrf),
            expires_at=now() + duration,
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", "")[:512],
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=cfg.cookie_secure,
        samesite="lax",
        max_age=int(duration.total_seconds()) if remember else None,
        path="/",
    )
    response.set_cookie("fenix_csrf", csrf, httponly=False, secure=cfg.cookie_secure, samesite="lax", path="/")


def authenticated(request: Request, db: DBSession = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    session = db.scalar(select(Session).where(Session.token_hash == digest(token))) if token else None
    cfg = settings()
    if (
        not session
        or session.revoked_at
        or session.expires_at <= now()
        or (session.last_activity_at + timedelta(minutes=cfg.idle_timeout_minutes) <= now())
    ):
        raise HTTPException(401, "Sua sessão expirou. Entre novamente.")
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Sua sessão expirou. Entre novamente.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        csrf = request.headers.get("x-csrf-token", "")
        if not csrf or not secrets.compare_digest(digest(csrf), session.csrf_hash):
            raise HTTPException(403, "Verificação de segurança inválida. Atualize a página.")
    session.last_activity_at = now()
    db.commit()
    request.state.session_id = session.id
    return user


def current_user(user: User = Depends(authenticated)):
    if user.must_change_password:
        raise HTTPException(403, "PASSWORD_CHANGE_REQUIRED")
    return user


def require_admin(user: User = Depends(current_user)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Acesso restrito ao administrador.")
    return user


def clear_cookies(response: Response):
    response.delete_cookie(COOKIE, path="/")
    response.delete_cookie("fenix_csrf", path="/")
