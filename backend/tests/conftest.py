import os
from pathlib import Path
from datetime import datetime
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import Base, get_db
from app.main import app, cfg
from app.models import User
from app.security import hasher

PASSWORD = "test-only-password-strong"
ADMIN_EMAIL = "admin@example.com"


@pytest.fixture
def db(tmp_path, monkeypatch):
    url = os.getenv("TEST_DATABASE_URL", "sqlite://")
    if url != "sqlite://" and not url.split("?")[0].endswith("/fenix_test"):
        raise RuntimeError("Integration tests require a separate database named fenix_test.")
    options = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool} if url == "sqlite://" else {}
    engine = create_engine(url, **options)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db, tmp_path, monkeypatch):
    monkeypatch.setattr(cfg, "upload_dir", str(tmp_path / "uploads"))
    app.dependency_overrides[get_db] = lambda: db
    admin = User(name="Test Admin", email=ADMIN_EMAIL, password_hash=hasher.hash(PASSWORD), role="ADMIN", must_change_password=False)
    db.add(admin)
    db.commit()
    with TestClient(app, headers={"origin": "http://localhost:3000"}) as client:
        yield client
    app.dependency_overrides.clear()


def login(client, email=ADMIN_EMAIL, password=PASSWORD):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    if response.status_code == 200:
        client.headers["X-CSRF-Token"] = client.cookies.get("fenix_csrf")
    return response


@pytest.fixture
def admin(client):
    assert login(client).status_code == 200
    return client


def report(number="001234", name="Test Owner", results=None, month="2025-01"):
    results = results or ["100,00", "-25,00"]
    header = "Ativo;Abertura;Fechamento;Tempo Operação;Qtd Compra;Qtd Venda;Lado;Preço Compra;Preço Venda;Preço de Mercado;Médio;Res. Intervalo Bruto;Res. Intervalo (%);Res. Operação;Res. Operação (%);TET;Total"
    content = [f"Conta: {number}", f"Titular: {name}", "Data: 01/01/2025", "", header]
    total = Decimal(0)
    for i, result in enumerate(results):
        total += Decimal(result.replace(".", "").replace(",", "."))
        day = datetime.strptime(f"{month}-{i + 2:02d}", "%Y-%m-%d").strftime("%d/%m/%Y")
        content.append(
            f"WIN;{day} 09:00:00;{day} 09:05:00;5min;1;1;C;100,00;101,00;101,00;Não;{result};1,00;{result};1,00;-;{str(total).replace('.', ',')}"
        )
    return "\r\n".join(content).encode("cp1252")


def upload(client, raw=None, filename="report.csv", mime="text/csv"):
    return client.post("/api/imports/csv", files={"file": (filename, raw or report(), mime)})


def configure(client, account_id, capital="15000.00", start="2025-01-01", nickname="Principal"):
    return client.patch(f"/api/accounts/{account_id}", json={"initial_capital": capital, "start_date": start, "nickname": nickname})


@pytest.fixture
def account(admin):
    response = upload(admin)
    assert response.status_code == 200, response.text
    account_id = response.json()["new_accounts"][0]["id"]
    assert configure(admin, account_id).status_code == 200
    return account_id


@pytest.fixture
def real_csv():
    return next((Path(__file__).resolve().parents[2] / "Example").glob("*.csv")).read_bytes()
