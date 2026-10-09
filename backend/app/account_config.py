"""Validated account/desk identity shared by setup and CSV imports."""
from datetime import date
from sqlalchemy import select
from .finance import FEE_FIELDS, today
from .importer import ImportError, normalized
from .models import ProprietaryDesk, InvestmentAccount


def configure_account(db, account, body):
    if body.initial_capital is None or body.start_date is None or any(getattr(body, f) is None for f in FEE_FIELDS):
        raise ImportError("Informe o capital, a data de início e as quatro taxas.")
    if not date(2000, 1, 1) <= body.start_date <= today():
        raise ImportError("A data de início deve estar entre 01/01/2000 e hoje.")
    desk = None
    if body.is_proprietary:
        if bool(body.desk_id) == bool(body.new_desk_name):
            raise ImportError("Selecione uma mesa existente ou informe o nome da nova mesa.")
        if body.desk_id:
            desk = db.get(ProprietaryDesk, body.desk_id)
            if not desk:
                raise ImportError("Mesa proprietária não encontrada.")
        else:
            name = " ".join(body.new_desk_name.split())
            if not name:
                raise ImportError("Informe o nome da mesa proprietária.")
            key = normalized(name)
            if db.scalar(select(ProprietaryDesk.id).where(ProprietaryDesk.normalized_name == key)):
                raise ImportError("Já existe uma mesa com esse nome. Selecione-a na lista.")
            desk = ProprietaryDesk(name=name, normalized_name=key)
            db.add(desk)
            db.flush()
    elif body.desk_id or body.new_desk_name:
        raise ImportError("Uma conta própria não pode estar vinculada a uma mesa proprietária.")
    scope = desk.id if desk else "PERSONAL"
    if account.is_proprietary is not None and account.identity_scope != scope:
        raise ImportError("O destino deste histórico não pode mudar. Importe o novo relatório em outra mesa.")
    duplicate = db.scalar(select(InvestmentAccount.id).where(
        InvestmentAccount.account_number_normalized == account.account_number_normalized,
        InvestmentAccount.identity_scope == scope,
        InvestmentAccount.id != account.id,
    ))
    if duplicate:
        raise ImportError("Esta conta já existe nesse destino. Selecione o cadastro existente.")
    for key, value in body.model_dump(exclude={"desk_id", "new_desk_name"}).items():
        setattr(account, key, value.strip() or None if key == "nickname" and value else value)
    account.desk = desk
    account.desk_id = desk.id if desk else None
    account.identity_scope = scope
    account.is_new = False
