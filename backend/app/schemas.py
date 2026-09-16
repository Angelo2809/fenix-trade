from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    role: Literal["ADMIN", "PARTNER"] = "PARTNER"

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Informe o nome.")
        return value.strip()


class UserEdit(UserCreate):
    is_active: bool = True


class AccountEdit(BaseModel):
    nickname: str | None = Field(default=None, max_length=120)
    initial_capital: Decimal | None = Field(default=None, gt=0, le=Decimal("999999999999.99"), decimal_places=2)
    start_date: date | None = None
    is_active: bool = True


class CloseIn(BaseModel):
    month: date
    confirmed_result: Decimal = Field(ge=Decimal("-999999999999.99"), le=Decimal("999999999999.99"), decimal_places=2)
    note: str = Field(default="", max_length=1000)
