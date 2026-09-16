import json
import logging
import secrets
import time
import uuid
from dataclasses import asdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, delete, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .limits import BodyLimitMiddleware
from .db import get_db
from .models import User, Session, LoginAttempt, AuditLog, InvestmentAccount, ImportBatch, Trade, MonthlyClose, now
from .schemas import LoginIn, PasswordIn, UserCreate, UserEdit, AccountEdit, CloseIn
from .security import authenticated, current_user, require_admin, audit, hasher, verify, DUMMY_HASH, issue_session, clear_cookies, revoke
from .importer import parse_csv, normalize_account, ImportError
from .finance import account_summary, dashboard, account_rows, pending_months, close_preview, month_start, today

cfg = settings()
app = FastAPI(
    title="Fenix API",
    docs_url="/docs" if cfg.enable_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if cfg.enable_docs else None,
)
app.add_middleware(BodyLimitMiddleware, settings=cfg)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
logger = logging.getLogger("fenix.requests")
logging.basicConfig(level=logging.INFO)


@app.middleware("http")
async def secure_request(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    try:
        content_length = int(request.headers.get("content-length", "0") or "0")
    except ValueError:
        content_length = cfg.max_upload_size_mb * 1024 * 1024 + 65537
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("origin") not in cfg.origins:
        response = JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
    elif content_length > (cfg.max_upload_size_mb * 1024 * 1024 + 65536):
        response = JSONResponse({"detail": "Arquivo excede o tamanho permitido."}, status_code=413)
    else:
        response = await call_next(request)
    response.headers.update(
        {
            "X-Request-ID": request_id,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "same-origin",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        }
    )
    if cfg.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if cfg.enable_docs and request.url.path == "/docs":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' https://fastapi.tiangolo.com; frame-ancestors 'none'"
        )
    route = request.scope.get("route")
    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "endpoint": getattr(route, "path", "unmatched"),
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - start) * 1000),
            }
        )
    )
    return response


def public_user(user):
    return {
        k: getattr(user, k) for k in ("id", "name", "email", "role", "is_active", "must_change_password", "last_login_at", "created_at")
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready(db: DBSession = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: DBSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    cutoff = now() - timedelta(minutes=cfg.lockout_minutes)
    db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff))
    attempts = db.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.ip_address == ip))
    if attempts >= cfg.login_limit:
        db.commit()
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.", headers={"Retry-After": str(cfg.lockout_minutes * 60)})
    db.add(LoginAttempt(ip_address=ip))
    user = db.scalar(select(User).where(User.email == str(body.email).lower()).with_for_update())
    valid = verify(user.password_hash if user else DUMMY_HASH, body.password)
    if (
        not user
        or not valid
        or not user.is_active
        or user.mfa_enabled
        or (user.locked_until and user.locked_until > now())
        or (user.must_change_password and (not user.temporary_password_expires_at or user.temporary_password_expires_at <= now()))
    ):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5 and (not user.locked_until or user.locked_until <= now()):
                user.locked_until = now() + timedelta(minutes=cfg.lockout_minutes)
        audit(db, request, "LOGIN_FAILED", user.id if user else None)
        db.commit()
        raise HTTPException(401, "Credenciais inválidas.")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now()
    issue_session(db, user, request, response, body.remember)
    audit(db, request, "LOGIN_SUCCESS", user.id)
    db.commit()
    return {"user": public_user(user), "state": "PASSWORD_CHANGE_REQUIRED" if user.must_change_password else "AUTHENTICATED"}


@app.get("/api/auth/me")
def me(user: User = Depends(authenticated)):
    return public_user(user)


@app.post("/api/auth/change-password")
def change_password(
    body: PasswordIn, request: Request, response: Response, user: User = Depends(authenticated), db: DBSession = Depends(get_db)
):
    db.refresh(user, with_for_update=True)
    if not verify(user.password_hash, body.current_password):
        raise HTTPException(400, "Senha atual inválida.")
    if body.current_password == body.new_password:
        raise HTTPException(400, "Escolha uma senha diferente da atual.")
    if user.must_change_password and user.temporary_password_expires_at <= now():
        raise HTTPException(401, "A senha temporária expirou. Solicite um novo acesso.")
    user.password_hash = hasher.hash(body.new_password)
    user.must_change_password = False
    user.temporary_password_expires_at = None
    user.password_changed_at = now()
    revoke(db, user.id)
    issue_session(db, user, request, response)
    audit(db, request, "PASSWORD_CHANGED", user.id)
    db.commit()
    return {"user": public_user(user)}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user: User = Depends(authenticated), db: DBSession = Depends(get_db)):
    db.get(Session, request.state.session_id).revoked_at = now()
    audit(db, request, "LOGOUT", user.id)
    db.commit()
    clear_cookies(response)
    return {"ok": True}


@app.post("/api/auth/logout-all")
def logout_all(request: Request, response: Response, user: User = Depends(authenticated), db: DBSession = Depends(get_db)):
    revoke(db, user.id)
    audit(db, request, "SESSION_REVOKED", user.id, scope="all")
    db.commit()
    clear_cookies(response)
    return {"ok": True}


@app.get("/api/admin/users")
def users(user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    return [public_user(u) for u in db.scalars(select(User).order_by(User.created_at))]


def temporary(user):
    password = secrets.token_urlsafe(16)
    user.password_hash = hasher.hash(password)
    user.must_change_password = True
    user.temporary_password_expires_at = now() + timedelta(hours=cfg.temp_password_expiration_hours)
    user.failed_login_attempts = 0
    user.locked_until = None
    return password


@app.post("/api/admin/users", status_code=201)
def create_user(body: UserCreate, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    target = User(name=body.name, email=str(body.email).lower(), role=body.role)
    password = temporary(target)
    db.add(target)
    try:
        db.flush()
        audit(db, request, "USER_CREATED", user.id, target_id=target.id)
        audit(db, request, "TEMP_PASSWORD_CREATED", user.id, target_id=target.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Este e-mail já está cadastrado.") from None
    return {"user": public_user(target), "temporary_password": password, "expires_at": target.temporary_password_expires_at}


def get_target(db, target_id):
    target = db.get(User, target_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado.")
    return target


@app.patch("/api/admin/users/{target_id}")
def edit_user(target_id: str, body: UserEdit, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    target = get_target(db, target_id)
    if target.id == user.id and (body.role != "ADMIN" or not body.is_active):
        raise HTTPException(400, "Você não pode remover seu próprio acesso administrativo.")
    before = target.is_active
    for k, v in body.model_dump().items():
        setattr(target, k, str(v).lower() if k == "email" else v)
    revoke(db, target.id)
    audit(db, request, "USER_UPDATED", user.id, target_id=target.id)
    if before != body.is_active:
        audit(db, request, "USER_ENABLED" if body.is_active else "USER_DISABLED", user.id, target_id=target.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Este e-mail já está cadastrado.") from None
    return public_user(target)


@app.post("/api/admin/users/{target_id}/reset-access")
def reset_access(target_id: str, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    target = get_target(db, target_id)
    if target.id == user.id:
        raise HTTPException(400, "Use a troca de senha para alterar seu próprio acesso.")
    password = temporary(target)
    revoke(db, target.id)
    audit(db, request, "TEMP_PASSWORD_RESET", user.id, target_id=target.id)
    db.commit()
    return {"temporary_password": password, "expires_at": target.temporary_password_expires_at}


@app.post("/api/admin/users/{target_id}/revoke-sessions")
def revoke_sessions(target_id: str, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    get_target(db, target_id)
    revoke(db, target_id)
    audit(db, request, "SESSION_REVOKED", user.id, target_id=target_id)
    db.commit()
    return {"ok": True}


@app.get("/api/admin/audit")
def audit_history(user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    return list(db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(200)))


def get_account(db, account_id, lock=False):
    statement = select(InvestmentAccount).where(InvestmentAccount.id == account_id)
    account = db.scalar(statement.with_for_update() if lock else statement)
    if not account:
        raise HTTPException(404, "Conta não encontrada.")
    return account


@app.get("/api/accounts")
def accounts(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return [account_summary(db, a) for a in db.scalars(select(InvestmentAccount).order_by(InvestmentAccount.first_seen_at))]


@app.get("/api/accounts/{account_id}")
def account_detail(account_id: str, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return account_summary(db, get_account(db, account_id))


@app.patch("/api/accounts/{account_id}")
def edit_account(
    account_id: str, body: AccountEdit, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)
):
    account = get_account(db, account_id, lock=True)
    if body.initial_capital is None or body.start_date is None:
        raise HTTPException(400, "Informe o limite de perda e a data de início.")
    if not date(2000, 1, 1) <= body.start_date <= today():
        raise HTTPException(400, "A data de início deve estar entre 01/01/2000 e hoje.")
    has_closes = db.scalar(select(MonthlyClose.id).where(MonthlyClose.account_id == account_id).limit(1))
    if has_closes and (account.initial_capital != body.initial_capital or account.start_date != body.start_date):
        raise HTTPException(409, "Limite e início não podem mudar após o primeiro fechamento.")
    for k, v in body.model_dump().items():
        setattr(account, k, v.strip() or None if k == "nickname" and v else v)
    account.is_new = False
    audit(
        db,
        request,
        "ACCOUNT_CONFIGURED",
        user.id,
        account_id=account.id,
        initial_capital=str(body.initial_capital),
        start_date=body.start_date.isoformat(),
    )
    audit(db, request, "ACCOUNT_NICKNAME_UPDATED", user.id, account_id=account.id)
    db.commit()
    return account_summary(db, account)


def selected_accounts(db, account_id):
    return (
        [get_account(db, account_id)]
        if account_id
        else list(db.scalars(select(InvestmentAccount).order_by(InvestmentAccount.first_seen_at)))
    )


@app.get("/api/dashboard")
def full_dashboard(account_id: str | None = None, period: str = "ALL", user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    if period not in ("ALL", "1M", "3M", "6M", "1A", "2A"):
        raise HTTPException(422, "Período inválido.")
    return dashboard(db, selected_accounts(db, account_id), period)


@app.get("/api/dashboard/{section}")
def dashboard_section(
    section: str, account_id: str | None = None, period: str = "ALL", user: User = Depends(current_user), db: DBSession = Depends(get_db)
):
    selected = selected_accounts(db, account_id)
    if section in ("robots", "strategies"):
        return {"available": False, "items": [], "reason": "O CSV não identifica robôs ou estratégias de forma confiável."}
    key = {"summary": "summary", "evolution": "evolution", "monthly-results": "monthly", "accounts-summary": "accounts"}.get(section)
    if not key:
        raise HTTPException(404)
    return dashboard(db, selected, period)[key]


@app.get("/api/accounts/{account_id}/closes")
def closes(account_id: str, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    account = get_account(db, account_id)
    return [close_public(c) for c in account_rows(db, account)[1]]


def close_public(record):
    fields = (
        "id",
        "account_id",
        "month",
        "calculated_result",
        "confirmed_result",
        "opening_balance",
        "settled_profit",
        "payout",
        "desk_share",
        "closing_balance",
        "note",
        "closed_at",
    )
    return {k: str(getattr(record, k)) if isinstance(getattr(record, k), Decimal) else getattr(record, k) for k in fields}


@app.get("/api/accounts/{account_id}/close-preview")
def preview(account_id: str, month: date, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    account = get_account(db, account_id)
    if not account.initial_capital or not account.start_date:
        raise HTTPException(400, "Configure esta conta primeiro.")
    pending = pending_months(account, account_rows(db, account)[1])
    if not pending or month != pending[0]:
        raise HTTPException(409, "Feche os meses em ordem, após o fim de cada mês.")
    return close_preview(db, account, month)


@app.post("/api/accounts/{account_id}/closes", status_code=201)
def close_month(account_id: str, body: CloseIn, request: Request, user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    account = get_account(db, account_id, lock=True)
    if not account.initial_capital or not account.start_date:
        raise HTTPException(400, "Configure esta conta primeiro.")
    pending = pending_months(account, account_rows(db, account)[1])
    if not pending or body.month != pending[0]:
        raise HTTPException(409, "Feche os meses em ordem, após o fim de cada mês.")
    values = close_preview(db, account, body.month, body.confirmed_result)
    if Decimal(values["calculated_result"]) != body.confirmed_result and len(body.note.strip()) < 5:
        raise HTTPException(422, "Explique o ajuste manual (mínimo de 5 caracteres).")
    values.pop("lost")
    record = MonthlyClose(account_id=account_id, closed_by=user.id, note=body.note.strip(), **values)
    db.add(record)
    audit(
        db,
        request,
        "MONTH_CLOSED",
        user.id,
        account_id=account_id,
        month=body.month.isoformat(),
        calculated_result=values["calculated_result"],
        confirmed_result=values["confirmed_result"],
        payout=values["payout"],
    )
    db.commit()
    return close_public(record)


def batch_public(batch):
    return {
        k: getattr(batch, k)
        for k in (
            "id",
            "filename",
            "uploaded_at",
            "status",
            "rows_total",
            "rows_imported",
            "rows_duplicate",
            "rows_rejected",
            "error_message",
        )
    }


@app.get("/api/imports")
def imports(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return [batch_public(b) for b in db.scalars(select(ImportBatch).order_by(ImportBatch.uploaded_at.desc()).limit(100))]


@app.get("/api/imports/latest")
def latest_import(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    batch = db.scalar(select(ImportBatch).order_by(ImportBatch.uploaded_at.desc()).limit(1))
    return batch_public(batch) if batch else None


@app.post("/api/imports/csv")
async def import_csv(request: Request, file: UploadFile = File(...), user: User = Depends(require_admin), db: DBSession = Depends(get_db)):
    filename = (file.filename or "relatorio.csv").replace("\\", "/").split("/")[-1][:255]
    raw = await file.read(cfg.max_upload_size_mb * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > cfg.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, "Arquivo excede o tamanho permitido.")
    batch = ImportBatch(filename=filename, uploaded_by=user.id)
    # Exact SHA-256 of original bytes, not decoded data.
    import hashlib

    batch.checksum = hashlib.sha256(raw).hexdigest()
    db.add(batch)
    db.flush()
    batch_id = batch.id
    audit(db, request, "CSV_UPLOAD_STARTED", user.id, import_id=batch_id)
    db.commit()
    stored = None
    total = 0
    try:
        if not filename.lower().endswith(".csv") or file.content_type not in (
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "text/plain",
            "application/octet-stream",
        ):
            raise ImportError("Formato inválido. Envie um arquivo .csv.")
        parsed = parse_csv(raw)
        total = len(parsed)
        batch.rows_total = len(parsed)
        directory = Path(cfg.upload_dir)
        directory.mkdir(parents=True, exist_ok=True)
        batch.stored_filename = f"{uuid.uuid4().hex}.csv"
        stored = batch.stored_filename
        (directory / batch.stored_filename).write_bytes(raw)
        new_ids, account_cache = [], {}
        # Lock accounts in consistent order, serializing imports and monthly closes.
        for number in sorted({normalize_account(t.account_number) for t in parsed}):
            sample = next(t for t in parsed if normalize_account(t.account_number) == number)
            account = db.scalar(select(InvestmentAccount).where(InvestmentAccount.account_number_normalized == number).with_for_update())
            if not account:
                account = InvestmentAccount(
                    account_number=sample.account_number, account_number_normalized=number, original_name=sample.original_name
                )
                db.add(account)
                db.flush()
                new_ids.append(account.id)
            account.last_seen_at = now()
            account.original_name = sample.original_name
            account_cache[number] = account
        for item in parsed:
            account = account_cache[normalize_account(item.account_number)]
            data = asdict(item)
            data.pop("account_number")
            data.pop("original_name")
            existing = db.scalar(select(Trade).where(Trade.account_id == account.id, Trade.fingerprint == item.fingerprint))
            if existing:
                if any(getattr(existing, k) != v for k, v in data.items()):
                    raise ImportError("Há uma operação já importada com valores diferentes. Revise o relatório antes de reenviar.")
                batch.rows_duplicate += 1
                continue
            if item.closed_at.date() > today():
                raise ImportError("O relatório contém operações com fechamento no futuro.")
            closed = db.scalar(
                select(MonthlyClose.id).where(
                    MonthlyClose.account_id == account.id, MonthlyClose.month == month_start(item.closed_at.date())
                )
            )
            if closed:
                raise ImportError("O relatório altera um mês já fechado. Nenhuma operação foi importada.")
            db.add(Trade(account_id=account.id, import_id=batch_id, **data))
            batch.rows_imported += 1
        batch.status = "SUCCESS"
        audit(db, request, "CSV_UPLOAD_SUCCESS", user.id, import_id=batch_id, rows=batch.rows_imported)
        db.commit()
        return {"batch": batch_public(batch), "new_accounts": [account_summary(db, db.get(InvestmentAccount, i)) for i in new_ids]}
    except (ImportError, IntegrityError, OSError):
        import sys

        error = sys.exception()
        message = str(error) if isinstance(error, ImportError) else "Não foi possível concluir a importação. Tente novamente."
        db.rollback()
        if stored:
            (Path(cfg.upload_dir) / stored).unlink(missing_ok=True)
        batch = db.get(ImportBatch, batch_id)
        batch.status = "FAILED"
        batch.rows_total = total
        batch.error_message = message[:400]
        batch.rows_rejected = batch.rows_total
        batch.rows_imported = 0
        batch.rows_duplicate = 0
        batch.stored_filename = None
        audit(db, request, "CSV_UPLOAD_FAILED", user.id, import_id=batch_id)
        db.commit()
        raise HTTPException(422, message) from None
