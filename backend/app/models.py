import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def uid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default="PARTNER")
    is_active: Mapped[bool] = mapped_column(default=True)
    must_change_password: Mapped[bool] = mapped_column(default=True)
    temporary_password_expires_at: Mapped[datetime | None]
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None]
    last_login_at: Mapped[datetime | None]
    password_changed_at: Mapped[datetime | None]
    mfa_enabled: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=now)
    expires_at: Mapped[datetime]
    last_activity_at: Mapped[datetime] = mapped_column(default=now)
    ip_address: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(512))
    revoked_at: Mapped[datetime | None]


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    ip_address: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(default=now, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(default=now)
    ip_address: Mapped[str] = mapped_column(String(64), default="cli")
    user_agent: Mapped[str] = mapped_column(String(512), default="cli")
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class InvestmentAccount(Base):
    __tablename__ = "investment_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    account_number: Mapped[str] = mapped_column(String(100))
    account_number_normalized: Mapped[str] = mapped_column(String(100), unique=True)
    original_name: Mapped[str] = mapped_column(String(160))
    nickname: Mapped[str | None] = mapped_column(String(120))
    initial_capital: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    start_date: Mapped[date | None]
    is_new: Mapped[bool] = mapped_column(default=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    first_seen_at: Mapped[datetime] = mapped_column(default=now)
    last_seen_at: Mapped[datetime] = mapped_column(default=now)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str | None] = mapped_column(String(80))
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(default=now)
    status: Mapped[str] = mapped_column(String(16), default="PROCESSING")
    rows_total: Mapped[int] = mapped_column(default=0)
    rows_imported: Mapped[int] = mapped_column(default=0)
    rows_duplicate: Mapped[int] = mapped_column(default=0)
    rows_rejected: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(String(400))


class Trade(Base):
    __tablename__ = "trades"
    __table_args__ = (UniqueConstraint("account_id", "fingerprint"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    account_id: Mapped[str] = mapped_column(ForeignKey("investment_accounts.id"), index=True)
    import_id: Mapped[str] = mapped_column(ForeignKey("import_batches.id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    asset: Mapped[str] = mapped_column(String(80))
    opened_at: Mapped[datetime]
    closed_at: Mapped[datetime] = mapped_column(index=True)
    side: Mapped[str] = mapped_column(String(2))
    quantity_buy: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    quantity_sell: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    buy_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    sell_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    result: Mapped[Decimal] = mapped_column(Numeric(18, 2))


class MonthlyClose(Base):
    __tablename__ = "monthly_closes"
    __table_args__ = (UniqueConstraint("account_id", "month"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    account_id: Mapped[str] = mapped_column(ForeignKey("investment_accounts.id"), index=True)
    month: Mapped[date]
    calculated_result: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    confirmed_result: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    settled_profit: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    payout: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    desk_share: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    note: Mapped[str] = mapped_column(String(1000), default="")
    closed_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime] = mapped_column(default=now)
