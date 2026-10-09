from sqlalchemy import select, func
from app.models import InvestmentAccount, Trade, ProprietaryDesk, ImportBatch
from conftest import report, upload


def configuration(**changes):
    return {"is_proprietary": True, "new_desk_name": "Mesa A", "initial_capital": "10000.00",
            "start_date": "2025-01-01", "construction_win_fee": "0.50", "construction_wdo_fee": "1.50",
            "real_win_fee": "0.66", "real_wdo_fee": "1.73", **changes}


def create(admin, **changes):
    return upload(admin, destinations={"001234": {"configuration": configuration(**changes)}})


def test_preview_does_not_register_and_import_needs_explicit_choice(admin, db):
    preview = admin.post("/api/imports/preview", files={"file": ("report.csv", report(), "text/csv")})
    assert preview.status_code == 200
    assert preview.json()["accounts"][0]["accounts"] == []
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 0
    assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0
    missing = admin.post("/api/imports/csv", files={"file": ("report.csv", report(), "text/csv")})
    assert missing.status_code == 422
    cfg = configuration()
    del cfg["is_proprietary"]
    assert upload(admin, destinations={"001234": {"configuration": cfg}}).status_code == 422
    assert db.scalar(select(func.count()).select_from(Trade)) == 0


def test_same_account_same_dates_isolated_by_desk_and_filters(admin, db):
    first = create(admin)
    second = create(admin, new_desk_name="Mesa B")
    assert first.status_code == second.status_code == 200
    a, b = first.json()["new_accounts"][0], second.json()["new_accounts"][0]
    assert a["id"] != b["id"] and a["account_number"] == b["account_number"]
    assert db.scalar(select(func.count()).select_from(Trade)) == 4
    again = upload(admin, destinations={"001234": {"account_id": a["id"]}})
    assert again.json()["batch"]["rows_duplicate"] == 2
    assert again.json()["batch"]["rows_imported"] == 0
    assert admin.get(f'/api/dashboard?desk_id={a["desk_id"]}').json()["summary"]["account_count"] == 1
    assert admin.get('/api/dashboard?account_number=001234').json()["summary"]["account_count"] == 2
    assert create(admin, new_desk_name=None, desk_id=a["desk_id"]).status_code == 422
    assert create(admin, new_desk_name="  MESA   A ").status_code == 422
    assert db.scalar(select(func.count()).select_from(ProprietaryDesk)) == 2


def test_personal_explicit_no_and_existing_desk_other_account(admin):
    personal = create(admin, is_proprietary=False, new_desk_name=None)
    assert personal.status_code == 200
    own = personal.json()["new_accounts"][0]
    assert own["desk_id"] is None and own["fee_stage"] == "REAL"
    assert own["fees"] == "2.64"
    a = create(admin).json()["new_accounts"][0]
    cfg = configuration(new_desk_name=None, desk_id=a["desk_id"])
    other = upload(admin, report("002222"), destinations={"002222": {"configuration": cfg}})
    assert other.status_code == 200
    assert len(admin.get(f'/api/dashboard?desk_id={a["desk_id"]}').json()["accounts"]) == 2
    assert upload(admin, report("002222"), destinations={"002222": {"account_id": a["id"]}}).status_code == 422


def test_configuration_and_desk_creation_are_atomic(admin, db):
    cfg = configuration()
    cfg["real_win_fee"] = None
    assert upload(admin, destinations={"001234": {"configuration": cfg}}).status_code == 422
    assert db.scalar(select(func.count()).select_from(ProprietaryDesk)) == 0
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 0
    assert create(admin, is_proprietary=False).status_code == 422
    assert create(admin, new_desk_name="   ").status_code == 422
    assert create(admin, new_desk_name=None, desk_id="missing").status_code == 422


def test_failed_import_cannot_leave_new_desk_or_account(admin, db):
    response = upload(admin, report(month="2099-01"), destinations={"001234": {"configuration": configuration()}})
    assert response.status_code == 422
    assert db.scalar(select(func.count()).select_from(ProprietaryDesk)) == 0
    assert db.scalar(select(func.count()).select_from(InvestmentAccount)) == 0


def test_month_close_and_conflicts_stay_in_selected_desk(admin):
    a = create(admin).json()["new_accounts"][0]
    b = create(admin, new_desk_name="Mesa B").json()["new_accounts"][0]
    closed = admin.post(f'/api/accounts/{a["id"]}/closes', json={"month": "2025-01-01", "confirmed_result": "73.00"})
    assert closed.status_code == 201
    more = report(results=["100,00", "-25,00", "10,00"])
    assert upload(admin, more, destinations={"001234": {"account_id": a["id"]}}).status_code == 422
    assert upload(admin, more, destinations={"001234": {"account_id": b["id"]}}).status_code == 200
    changed = report(results=["101,00", "-25,00"])
    assert upload(admin, changed, destinations={"001234": {"account_id": b["id"]}}).status_code == 422
    assert admin.get(f'/api/accounts/{a["id"]}').json()["trade_count"] == 2
    assert admin.get(f'/api/accounts/{b["id"]}').json()["trade_count"] == 3
