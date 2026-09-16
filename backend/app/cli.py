import argparse
import getpass
import secrets
from datetime import timedelta
from sqlalchemy import select
from pydantic import EmailStr, TypeAdapter
from .db import SessionLocal
from .models import User, now
from .security import hasher, audit
from .config import settings


def main():
    parser = argparse.ArgumentParser(description="Administração Fenix")
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--name", help="Nome do administrador")
    parser.add_argument("--email", help="E-mail do administrador")
    parser.add_argument("--temporary", action="store_true", help="Gerar senha temporária com troca obrigatória")
    args = parser.parse_args()
    name = (args.name or input("Nome: ")).strip()
    email = str(TypeAdapter(EmailStr).validate_python((args.email or input("E-mail: ")).strip())).lower()
    password = secrets.token_urlsafe(16) if args.temporary else getpass.getpass("Senha (mínimo 8 caracteres): ")
    if len(name) < 2 or not 8 <= len(password) <= 128:
        raise SystemExit("Nome ou comprimento de senha inválido.")
    if not args.temporary and password != getpass.getpass("Confirme a senha: "):
        raise SystemExit("As senhas não coincidem.")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise SystemExit("E-mail já cadastrado.")
        user = User(
            name=name,
            email=email,
            password_hash=hasher.hash(password),
            role="ADMIN",
            must_change_password=args.temporary,
            password_changed_at=None if args.temporary else now(),
            temporary_password_expires_at=now() + timedelta(hours=settings().temp_password_expiration_hours) if args.temporary else None,
        )
        db.add(user)
        db.flush()
        audit(db, None, "USER_CREATED", user.id, source="cli")
        if args.temporary:
            audit(db, None, "TEMP_PASSWORD_CREATED", user.id, source="cli")
        db.commit()
    print("Administrador criado com sucesso.")
    if args.temporary:
        print(f"Senha temporária (exibida uma vez): {password}")


if __name__ == "__main__":
    main()
