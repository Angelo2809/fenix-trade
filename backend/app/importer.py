"""Profit performance CSV. Values are never inferred from the (%) columns."""

import csv
import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation


class ImportError(ValueError):
    pass


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.strip().lower()) if not unicodedata.combining(c))


def money(value, row):
    value = value.strip().replace("R$", "").replace("\xa0", "").replace(" ", "")
    if not re.fullmatch(r"-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4})?", value):
        raise ImportError(f"Linha {row}: valor numérico inválido.")
    try:
        result = Decimal(value.replace(".", "").replace(",", "."))
    except InvalidOperation:
        raise ImportError(f"Linha {row}: valor numérico inválido.") from None
    if not result.is_finite() or abs(result) > Decimal("999999999999.99"):
        raise ImportError(f"Linha {row}: valor fora do limite.")
    return result


@dataclass
class ParsedTrade:
    account_number: str
    original_name: str
    asset: str
    opened_at: datetime
    closed_at: datetime
    side: str
    quantity_buy: Decimal
    quantity_sell: Decimal
    buy_price: Decimal
    sell_price: Decimal
    result: Decimal
    fingerprint: str


def parse_csv(content: bytes) -> list[ParsedTrade]:
    if not content or b"\x00" in content or content.startswith(b"PK"):
        raise ImportError("Arquivo inválido. Envie o relatório CSV de operações.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252")
    try:
        rows = csv.reader(io.StringIO(text), delimiter=";", strict=True)
        trades, account, name, header = [], None, None, None
        identities = set()
        for line, row in enumerate(rows, 1):
            if line > 100_000:
                raise ImportError("O relatório excede 100 mil linhas.")
            if not row or not any(c.strip() for c in row):
                continue
            first = row[0].strip()
            label = normalized(first.split(":", 1)[0])
            if label == "conta":
                account = first.split(":", 1)[1].strip() if ":" in first else (row[1].strip() if len(row) > 1 else "")
                if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}", account):
                    raise ImportError(f"Linha {line}: identificação de conta inválida.")
                name, header = None, None
                continue
            if label == "titular":
                name = first.split(":", 1)[1].strip() if ":" in first else (row[1].strip() if len(row) > 1 else "")
                if not name or len(name) > 160:
                    raise ImportError(f"Linha {line}: titular inválido.")
                continue
            if label == "data" and header is None:
                continue
            labels = [normalized(c) for c in row]
            if "ativo" in labels and "abertura" in labels:
                required = [
                    "ativo",
                    "abertura",
                    "fechamento",
                    "qtd compra",
                    "qtd venda",
                    "lado",
                    "preco compra",
                    "preco venda",
                    "res. operacao",
                ]
                if any(c not in labels or labels.count(c) != 1 for c in required):
                    raise ImportError(f"Linha {line}: cabeçalho obrigatório ausente ou duplicado.")
                header = {c: labels.index(c) for c in required}
                continue
            if header is None or not account or not name:
                raise ImportError(f"Linha {line}: conta, titular ou cabeçalho não encontrado.")
            if first.lower() in ("total", "totais"):
                continue
            if max(header.values()) >= len(row):
                raise ImportError(f"Linha {line}: quantidade de colunas inválida.")
            get = lambda key: row[header[key]].strip()  # noqa: E731
            try:
                opened = datetime.strptime(get("abertura"), "%d/%m/%Y %H:%M:%S")
                closed = datetime.strptime(get("fechamento"), "%d/%m/%Y %H:%M:%S")
            except ValueError:
                raise ImportError(f"Linha {line}: datas inválidas ou operação ainda aberta.") from None
            if closed < opened or get("lado") not in ("C", "V") or not get("ativo") or len(get("ativo")) > 80:
                raise ImportError(f"Linha {line}: operação inválida.")
            nums = [money(get(k), line) for k in ("qtd compra", "qtd venda", "preco compra", "preco venda", "res. operacao")]
            if any(x < 0 for x in nums[:4]) or nums[4] != nums[4].quantize(Decimal("0.01")):
                raise ImportError(f"Linha {line}: quantidade, preço ou precisão monetária inválida.")
            # Stable identity excludes P&L and mutable prices, so corrections are conflicts, not new trades.
            fingerprint = hashlib.sha256(f"{get('ativo')}|{opened.isoformat()}|{closed.isoformat()}|{get('lado')}".encode()).hexdigest()
            key = (normalize_account(account), fingerprint)
            if key in identities:
                raise ImportError(f"Linha {line}: operação repetida ou ambígua no mesmo arquivo.")
            identities.add(key)
            trades.append(ParsedTrade(account, name, get("ativo"), opened, closed, get("lado"), *nums, fingerprint))
    except (csv.Error, UnicodeError):
        raise ImportError("CSV corrompido ou codificação inválida.") from None
    if not trades:
        raise ImportError("Nenhuma operação encerrada encontrada.")
    return trades


def normalize_account(value):
    return re.sub(r"\s+", "", value).upper()
