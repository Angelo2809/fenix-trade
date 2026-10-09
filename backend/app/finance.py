"""All accounting uses Decimal; floats are a presentation concern only.

Each account is one independent desk contract. Losses carry over. A positive
month-end available balance is removed entirely: 90% payout, 10% desk share.
Initial capital is risk capacity, not an owned asset or cash contribution.
"""

import calendar
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .models import Trade, MonthlyClose

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
FEE_FIELDS = ("construction_win_fee", "construction_wdo_fee", "real_win_fee", "real_wdo_fee")


def today():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def month_start(day):
    return day.replace(day=1)


def next_month(day):
    return date(day.year + (day.month == 12), day.month % 12 + 1, 1)


def month_end(day):
    return date(day.year, day.month, calendar.monthrange(day.year, day.month)[1])


def dec(value):
    return str(value.quantize(CENT)) if value is not None else None


def account_configured(account):
    return account.is_proprietary is not None and (not account.is_proprietary or account.desk_id is not None) and account.initial_capital is not None and account.start_date is not None and all(
        getattr(account, field) is not None for field in FEE_FIELDS
    )


def trade_effects(account, trades):
    """Apply fees in trade order and permanently latch the real-account phase."""
    configured = account_configured(account)
    real_account = account.is_proprietary is False
    trading_net = ZERO
    effects = {}
    for trade in sorted(trades, key=lambda item: (item.closed_at, item.id)):
        asset = trade.asset.strip().upper()
        family = "win" if asset.startswith("WIN") else "wdo" if asset.startswith("WDO") else None
        rate = ZERO
        if configured and family:
            phase = "real" if real_account else "construction"
            rate = getattr(account, f"{phase}_{family}_fee")
        # Fees are charged on both executed sides (buy + sell).
        contracts = trade.quantity_buy + trade.quantity_sell
        fee = (contracts * rate).quantize(CENT)
        net = (trade.result - fee).quantize(CENT)
        trading_net += net
        passed = configured and not real_account and trading_net >= account.initial_capital
        effects[trade.id] = {
            "gross": trade.result,
            "fee": fee,
            "net": net,
            "phase": "REAL" if real_account else "CONSTRUCTION",
            "passed": passed,
        }
        if passed:
            real_account = True
    return effects


def account_rows(db, account):
    trades = list(db.scalars(select(Trade).where(Trade.account_id == account.id).order_by(Trade.closed_at, Trade.id)))
    closes = list(db.scalars(select(MonthlyClose).where(MonthlyClose.account_id == account.id).order_by(MonthlyClose.month)))
    if account.start_date:
        trades = [t for t in trades if t.closed_at.date() >= account.start_date]
    return trades, closes


def ledger(account, trades, closes, through=None):
    end = through or today()
    configured = account_configured(account)
    balance, result, gross_result, fees, paid, peak, drawdown = ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO
    lost_at, passed_at = None, None
    points = []
    effects = trade_effects(account, trades)
    events = [(t.closed_at, 0, t) for t in trades if t.closed_at.date() <= end]
    events += [(datetime.combine(month_end(c.month), datetime.max.time()), 1, c) for c in closes if month_end(c.month) <= end]
    for timestamp, kind, obj in sorted(events, key=lambda x: (x[0], x[1])):
        if kind == 0:
            effect = effects[obj.id]
            gross_result += effect["gross"]
            fees += effect["fee"]
            change = effect["net"]
            if effect["passed"] and passed_at is None:
                passed_at = timestamp.date()
            balance += change
        else:
            change = obj.confirmed_result - obj.calculated_result
            balance += change
        result += change
        peak = max(peak, result)
        drawdown = max(drawdown, peak - result)
        if configured and balance <= -account.initial_capital and lost_at is None:
            lost_at = timestamp.date()
        if kind == 1:
            balance -= obj.settled_profit
            paid += obj.payout
        points.append({"date": timestamp.date().isoformat(), "balance": balance, "result": result, "paid": paid})
    return {
        "balance": balance,
        "gross_result": gross_result,
        "fees": fees,
        "result": result,
        "paid": paid,
        "drawdown": drawdown,
        "lost_at": lost_at,
        "fee_stage": "REAL" if passed_at or account.is_proprietary is False else "CONSTRUCTION" if configured else None,
        "passed_at": passed_at,
        "points": points,
    }


def account_summary(db, account):
    trades, closes = account_rows(db, account)
    state = ledger(account, trades, closes)
    capital = account.initial_capital
    configured = account_configured(account)
    pending = pending_months(account, closes) if configured else []
    return {
        "id": account.id,
        "account_number": account.account_number,
        "is_proprietary": account.is_proprietary,
        "desk_id": account.desk_id,
        "desk_name": account.desk.name if account.desk else None,
        "original_name": account.original_name,
        "nickname": account.nickname,
        "is_new": account.is_new,
        "is_active": account.is_active,
        "initial_capital": dec(capital),
        "start_date": account.start_date,
        **{field: dec(getattr(account, field)) for field in FEE_FIELDS},
        "first_seen_at": account.first_seen_at,
        "last_seen_at": account.last_seen_at,
        "status": "UNCONFIGURED" if not configured else "LOST" if state["lost_at"] else "ACTIVE" if account.is_active else "INACTIVE",
        "balance": dec(state["balance"]) if configured else None,
        "risk_remaining": dec(max(ZERO, capital + state["balance"]))
        if configured and not state["lost_at"]
        else "0.00"
        if configured
        else None,
        "gross_result": dec(state["gross_result"]),
        "fees": dec(state["fees"]) if configured else None,
        "result": dec(state["result"]),
        "paid": dec(state["paid"]),
        "return_pct": dec(state["result"] / capital * 100) if configured else None,
        "drawdown": dec(state["drawdown"]),
        "drawdown_pct": dec(-state["drawdown"] / capital * 100) if configured else None,
        "lost_at": state["lost_at"],
        "fee_stage": state["fee_stage"],
        "passed_at": state["passed_at"],
        "trade_count": len(trades),
        "pending_months": [m.isoformat() for m in pending],
        "first_trade_date": trades[0].closed_at.date() if trades else None,
    }


def pending_months(account, closes):
    if not account.start_date:
        return []
    closed = {c.month for c in closes}
    result, month = [], month_start(account.start_date)
    while month < month_start(today()):
        if month not in closed:
            result.append(month)
        month = next_month(month)
    return result


def close_preview(db, account, month, confirmed=None):
    trades, closes = account_rows(db, account)
    effects = trade_effects(account, trades)
    month_effects = [effects[t.id] for t in trades if month_start(t.closed_at.date()) == month]
    gross = sum((effect["gross"] for effect in month_effects), ZERO)
    fees = sum((effect["fee"] for effect in month_effects), ZERO)
    calculated = sum((effect["net"] for effect in month_effects), ZERO)
    opening = ledger(account, trades, closes, date.fromordinal(month.toordinal() - 1))["balance"]
    historical = ledger(account, trades, closes, month_end(month))
    value = calculated if confirmed is None else confirmed
    available = opening + value
    lost = historical["lost_at"] is not None or available <= -account.initial_capital
    settled = max(ZERO, available) if not lost else ZERO
    payout = (settled * Decimal("0.90")).quantize(CENT)
    return {
        "month": month,
        "gross_result": dec(gross),
        "fees": dec(fees),
        "calculated_result": dec(calculated),
        "confirmed_result": dec(value),
        "opening_balance": dec(opening),
        "settled_profit": dec(settled),
        "payout": dec(payout),
        "desk_share": dec(settled - payout),
        "closing_balance": dec(available - settled),
        "lost": lost,
    }


def dashboard(db, accounts, period="ALL"):
    summaries = [account_summary(db, a) for a in accounts]
    configured = [a for a in accounts if account_configured(a)]
    capital = sum((a.initial_capital for a in configured), ZERO)
    histories, monthly = [], defaultdict(
        lambda: {"gross": ZERO, "fees": ZERO, "calculated": ZERO, "confirmed": ZERO, "paid": ZERO}
    )
    days = set()
    for a in accounts:
        trades, closes = account_rows(db, a)
        state = ledger(a, trades, closes)
        effects = trade_effects(a, trades)
        histories.append((a, state))
        if a.start_date:
            days.add(a.start_date.isoformat())
        for point in state["points"]:
            days.add(point["date"])
        for t in trades:
            if t.closed_at.date() > today():
                continue
            key = t.closed_at.strftime("%Y-%m")
            effect = effects[t.id]
            monthly[key]["gross"] += effect["gross"]
            monthly[key]["fees"] += effect["fee"]
            monthly[key]["calculated"] += effect["net"]
            monthly[key]["confirmed"] += effect["net"]
        for c in closes:
            key = c.month.strftime("%Y-%m")
            monthly[key]["confirmed"] += c.confirmed_result - c.calculated_result
            monthly[key]["paid"] += c.payout
    evolution = []
    peak, max_dd, cumulative_result = ZERO, ZERO, ZERO
    # Preserve intraday peaks/troughs; daily chart sampling must not understate risk.
    changes = []
    for a in accounts:
        trades, closes = account_rows(db, a)
        effects = trade_effects(a, trades)
        changes.extend((t.closed_at, effects[t.id]["net"]) for t in trades if t.closed_at.date() <= today())
        changes.extend(
            (datetime.combine(month_end(c.month), datetime.max.time()), c.confirmed_result - c.calculated_result) for c in closes
        )
    for _, change in sorted(changes, key=lambda x: x[0]):
        cumulative_result += change
        peak = max(peak, cumulative_result)
        max_dd = max(max_dd, peak - cumulative_result)
    current = [(a, ZERO, ZERO, ZERO) for a, _ in histories]
    # Daily aggregation carries balances forward across differing account trading calendars.
    points_by_day = defaultdict(list)
    for i, (_, state) in enumerate(histories):
        for p in state["points"]:
            points_by_day[p["date"]].append((i, p))
    for day in sorted(days):
        for i, p in points_by_day[day]:
            current[i] = (current[i][0], p["balance"], p["result"], p["paid"])
        cumulative = sum((x[2] for x in current), ZERO)
        evolution.append(
            {
                "date": day,
                "result": dec(cumulative),
                "balance": dec(sum((x[1] for x in current if account_configured(x[0])), ZERO)),
                "paid": dec(sum((x[3] for x in current), ZERO)),
            }
        )
    months = {"1M": 1, "3M": 3, "6M": 6, "1A": 12, "2A": 24}
    if period in months:
        ordinal = today().year * 12 + today().month - 1 - months[period]
        cutoff = date(ordinal // 12, ordinal % 12 + 1, 1).isoformat()
        evolution = [p for p in evolution if p["date"] >= cutoff]
    result = sum((s["result"] for _, s in histories), ZERO)
    configured_result = sum((s["result"] for a, s in histories if a in configured), ZERO)
    return {
        "summary": {
            "capital": dec(capital),
            "balance": dec(sum((s["balance"] for a, s in histories if a in configured), ZERO)),
            "gross_result": dec(sum((s["gross_result"] for _, s in histories), ZERO)),
            "fees": dec(sum((s["fees"] for _, s in histories), ZERO)),
            "result": dec(result),
            "paid": dec(sum((s["paid"] for _, s in histories), ZERO)),
            "return_pct": dec(configured_result / capital * 100) if capital else None,
            "drawdown": dec(max_dd),
            "drawdown_pct": dec(-max_dd / capital * 100) if capital and len(configured) == len(accounts) else None,
            "account_count": len(accounts),
            "unconfigured_count": len(accounts) - len(configured),
            "last_update": max((a.last_seen_at for a in accounts), default=None),
        },
        "accounts": summaries,
        "evolution": evolution,
        "monthly": [{"month": month, **{k: dec(v) for k, v in values.items()}} for month, values in sorted(monthly.items())],
    }
