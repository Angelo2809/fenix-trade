from decimal import Decimal
from sqlalchemy import select, func
from app.importer import parse_csv, ImportError
from app.models import InvestmentAccount, Trade, ImportBatch
from conftest import upload, report, configure, login
import pytest


def test_real_csv_structure_decimal_and_identity(real_csv):
    trades = parse_csv(real_csv)
    assert len(trades) == 24
    assert len({t.account_number for t in trades}) == 1
    assert all(isinstance(t.result, Decimal) for t in trades)
    assert all(t.closed_at >= t.opened_at for t in trades)
    assert len({t.fingerprint for t in trades}) == len(trades)


def test_real_csv_roundtrip(admin, real_csv, db):
    expected = parse_csv(real_csv)
    result = upload(admin, real_csv)
    assert result.status_code == 200
    assert result.json()["batch"]["rows_imported"] == len(expected)
    assert db.scalar(select(func.sum(Trade.result))) == sum(t.result for t in expected)


def test_duplicate_nickname_and_name_change(admin, account, db):
    response = upload(admin, report(name="Renamed Owner"))
    assert response.status_code == 200
    assert response.json()["batch"]["rows_duplicate"] == 2
    assert response.json()["new_accounts"] == []
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 1
    saved = db.get(InvestmentAccount, account)
    assert saved.nickname == "Principal"
    assert saved.account_number == "001234"
    assert saved.original_name == "Renamed Owner"


def test_multiple_accounts_and_absent_retained(admin, account, db):
    raw = report("000002") + b"\r\n" + report("000003")
    result = upload(admin, raw)
    assert result.status_code == 200
    assert len(result.json()["new_accounts"]) == 2
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 3
    assert db.get(InvestmentAccount, account)
    assert len(admin.get("/api/dashboard/accounts-summary").json()) == 3


def test_changed_operation_rejected_atomically(admin, account, db):
    raw = report("NEW999") + b"\r\n" + report(results=["101,00", "-25,00"])
    result = upload(admin, raw)
    assert result.status_code == 422
    assert db.scalar(select(func.count()).select_from(Trade)) == 2
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 1
    assert db.scalar(select(ImportBatch).order_by(ImportBatch.uploaded_at.desc())).status == "FAILED"


@pytest.mark.parametrize("raw", [b"not a report", b"PK\x03\x04", b"a\x00b", b"Conta: test", report() + b"\nmalformed"])
def test_invalid_reports_rejected(raw):
    with pytest.raises(ImportError):
        parse_csv(raw)


def test_extension_mime_and_size(admin, monkeypatch):
    from app.main import cfg

    assert upload(admin, filename="report.xlsx").status_code == 422
    assert upload(admin, mime="image/png").status_code == 422
    monkeypatch.setattr(cfg, "max_upload_size_mb", 1)
    assert upload(admin, raw=b"a" * (1024 * 1024 + 1)).status_code == 413


def test_header_not_row_one_and_column_order():
    raw = report().decode("cp1252")
    rows = raw.splitlines()
    rows = rows[:4] + [";".join(reversed(r.split(";"))) for r in rows[4:]]
    assert len(parse_csv("\n".join(rows).encode())) == 2


def test_partner_cannot_import_or_configure(admin, account, db):
    from app.models import User
    from app.security import hasher

    partner = User(
        name="Partner",
        email="partner@example.com",
        password_hash=hasher.hash("a-partner-test-password"),
        role="PARTNER",
        must_change_password=False,
    )
    db.add(partner)
    db.commit()
    assert login(admin, partner.email, "a-partner-test-password").status_code == 200
    assert upload(admin).status_code == 403
    assert configure(admin, account).status_code == 403


def test_private_upload_filename(admin, tmp_path):
    result = upload(admin, filename="../../private.csv")
    assert result.status_code == 200
    assert result.json()["batch"]["filename"] == "private.csv"
    files = list((tmp_path / "uploads").glob("*.csv"))
    assert len(files) == 1 and files[0].stem != "private"
