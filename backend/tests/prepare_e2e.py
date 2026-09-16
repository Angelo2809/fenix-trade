"""Provision isolated browser fixtures; refuses any non-E2E database."""

import json
import secrets
from pathlib import Path
from sqlalchemy import select
from app.db import SessionLocal, engine
from app.models import User
from app.security import hasher
from tests.conftest import report

if engine.url.database != "fenix_e2e":
    raise SystemExit("Use DATABASE_URL pointing to the isolated fenix_e2e database.")
directory = Path(__file__).resolve().parents[2] / ".local"
directory.mkdir(exist_ok=True)
email, password = "browser-admin@example.com", secrets.token_urlsafe(24)
with SessionLocal() as db:
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(name="Administrador de Teste", email=email, role="ADMIN", must_change_password=False)
        db.add(user)
    user.password_hash = hasher.hash(password)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
(directory / "e2e.json").write_text(json.dumps({"email": email, "password": password}), encoding="utf-8")
parts = []
for index, number in enumerate(["DEMO001", "DEMO002", "DEMO003"]):
    for month in range(1, 7):
        results = [f"{350 + month * 80 + index * 50},00", f"-{40 + index * 20},00", f"{180 + month * 40},00"]
        if month == 3:
            results = ["-220,00", "-80,00", "100,00"]
        parts.append(report(number, "Titular de Teste", results, month=f"2026-{month:02d}"))
(directory / "browser-report.csv").write_bytes(b"\r\n".join(parts))
print("Isolated browser fixtures prepared; credentials stored in ignored .local directory.")
