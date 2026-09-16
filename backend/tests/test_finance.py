from decimal import Decimal
from conftest import upload, report, configure


def close(client, account, month, result, note=""):
    return client.post(f"/api/accounts/{account}/closes", json={"month": month, "confirmed_result": result, "note": note})


def test_consolidated_and_individual_percentages(admin, account):
    second = upload(admin, report("000002", results=["200,00", "100,00"])).json()["new_accounts"][0]["id"]
    configure(admin, account, capital="1000.00")
    configure(admin, second, capital="2000.00")
    summary = admin.get("/api/dashboard/summary").json()
    assert Decimal(summary["capital"]) == Decimal("3000")
    assert Decimal(summary["result"]) == Decimal("375")
    assert Decimal(summary["return_pct"]) == Decimal("12.50")
    individual = admin.get(f"/api/dashboard?account_id={account}").json()
    assert individual["summary"]["result"] == "75.00"
    assert len(individual["accounts"]) == 1
    assert admin.get("/api/dashboard?account_id=not-a-valid-id").status_code == 404


def test_positive_close_and_manual_adjustment(admin, account):
    preview = admin.get(f"/api/accounts/{account}/close-preview?month=2025-01-01").json()
    assert preview["calculated_result"] == "75.00"
    assert preview["payout"] == "67.50"
    assert close(admin, account, "2025-01-01", "100.00").status_code == 422
    result = close(admin, account, "2025-01-01", "100.00", "Ajuste confirmado pela mesa")
    assert result.status_code == 201, result.text
    assert Decimal(result.json()["payout"]) == Decimal("90")
    assert result.json()["calculated_result"] == "75.00"
    state = admin.get(f"/api/accounts/{account}").json()
    assert state["balance"] == "0.00"
    assert state["result"] == "100.00"
    assert state["paid"] == "90.00"
    assert close(admin, account, "2025-01-01", "100.00").status_code == 409


def test_losses_carry_then_recover(admin):
    account = upload(admin, report(results=["-200,00"])).json()["new_accounts"][0]["id"]
    configure(admin, account, capital="1000.00")
    assert close(admin, account, "2025-01-01", "-200.00").json()["payout"] == "0.00"
    upload(admin, report(month="2025-02", results=["300,00"]))
    result = close(admin, account, "2025-02-01", "300.00").json()
    assert result["opening_balance"] == "-200.00"
    assert result["payout"] == "90.00"
    assert result["closing_balance"] == "0.00"


def test_breach_is_latched_even_if_later_profit(admin):
    account = upload(admin, report(results=["-15000,00", "20000,00"])).json()["new_accounts"][0]["id"]
    configure(admin, account)
    detail = admin.get(f"/api/accounts/{account}").json()
    assert detail["status"] == "LOST"
    assert detail["risk_remaining"] == "0.00"
    assert close(admin, account, "2025-01-01", "5000.00").json()["payout"] == "0.00"


def test_closed_month_rejects_new_trades_allows_identical_upload(admin, account):
    close(admin, account, "2025-01-01", "75.00")
    assert upload(admin).status_code == 200
    assert upload(admin, report(results=["100,00", "-25,00", "10,00"])).status_code == 422
    assert configure(admin, account, capital="20000.00").status_code == 409
    assert configure(admin, account, nickname="Novo apelido").status_code == 200


def test_closing_order_and_future_blocked(admin, account):
    assert close(admin, account, "2025-02-01", "0").status_code == 409
    assert close(admin, account, "2099-01-01", "0").status_code == 409


def test_unconfigured_is_not_zero_capital(admin):
    account = upload(admin).json()["new_accounts"][0]
    assert account["initial_capital"] is None
    assert account["balance"] is None
    assert account["status"] == "UNCONFIGURED"
    assert admin.get("/api/dashboard").json()["summary"]["return_pct"] is None


def test_start_date_excludes_earlier_trades(admin, account):
    assert configure(admin, account, start="2025-01-03").status_code == 200
    summary = admin.get(f"/api/accounts/{account}").json()
    assert summary["result"] == "-25.00"
    assert summary["trade_count"] == 1


def test_no_invented_robot_metrics(admin):
    assert admin.get("/api/dashboard/robots").json()["available"] is False
    assert admin.get("/api/dashboard/strategies").json()["items"] == []


def test_daily_consolidation_carries_forward_balances(admin, account):
    other = upload(admin, report("000002", month="2025-02", results=["100,00"])).json()["new_accounts"][0]["id"]
    configure(admin, other, start="2025-02-01")
    evolution = admin.get("/api/dashboard/evolution").json()
    assert evolution[-1]["result"] == "175.00"
    assert evolution[-1]["balance"] == "175.00"


def test_intraday_drawdown_preserved(admin):
    raw = report(results=["100,00", "-200,00", "150,00"]).decode("cp1252")
    raw = raw.replace("03/01/2025 09:", "02/01/2025 10:").replace("04/01/2025 09:", "02/01/2025 11:")
    account = upload(admin, raw.encode("cp1252")).json()["new_accounts"][0]["id"]
    configure(admin, account, capital="1000.00")
    summary = admin.get("/api/dashboard/summary").json()
    assert summary["drawdown"] == "200.00"
    assert summary["drawdown_pct"] == "-20.00"
