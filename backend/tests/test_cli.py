import sys
from sqlalchemy import select
from app.models import User
from app import cli
from app.security import verify


def test_temporary_admin_cli(db, monkeypatch, capsys):
    from contextlib import contextmanager

    @contextmanager
    def session():
        yield db

    monkeypatch.setattr(cli, "SessionLocal", session)
    monkeypatch.setattr(sys, "argv", ["cli", "create-admin", "--name", "CLI Admin", "--email", "cli@example.com", "--temporary"])
    cli.main()
    output = capsys.readouterr().out
    password = output.split("(exibida uma vez): ")[1].strip()
    user = db.scalar(select(User).where(User.email == "cli@example.com"))
    assert user.role == "ADMIN"
    assert user.must_change_password
    assert user.temporary_password_expires_at
    assert verify(user.password_hash, password)
