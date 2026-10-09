"""Separate account numbers by proprietary desk; preserve existing ledger IDs."""
from alembic import op
import sqlalchemy as sa

revision = "b92c41d5f610"
down_revision = "8f1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "proprietary_desks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("normalized_name", sa.String(160), nullable=False, unique=True),
    )
    bind = op.get_bind()
    constraints = sa.inspect(bind).get_unique_constraints("investment_accounts")
    with op.batch_alter_table("investment_accounts", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}) as batch:
        for constraint in constraints:
            if constraint["column_names"] == ["account_number_normalized"]:
                batch.drop_constraint(constraint["name"] or "uq_investment_accounts_account_number_normalized", type_="unique")
        batch.add_column(sa.Column("identity_scope", sa.String(36), nullable=True))
        batch.add_column(sa.Column("is_proprietary", sa.Boolean(), nullable=True))
        batch.add_column(sa.Column("desk_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_account_desk", "proprietary_desks", ["desk_id"], ["id"])
    bind.execute(sa.text("UPDATE investment_accounts SET identity_scope = id"))
    # Explicitly requested classification of the existing Rogerio report.
    exists = bind.execute(sa.text("SELECT id FROM investment_accounts WHERE account_number_normalized = '103147815'")).first()
    if exists:
        desk_id = "b457254c-8191-4e11-a213-bb7063a0a100"
        bind.execute(sa.text("INSERT INTO proprietary_desks (id, name, normalized_name) VALUES (:id, :name, :normalized)"),
                     {"id": desk_id, "name": "Mesa 01 Rogerio 10k", "normalized": "mesa 01 rogerio 10k"})
        bind.execute(sa.text("UPDATE investment_accounts SET is_proprietary = :yes, desk_id = :id, identity_scope = :id, nickname = :name WHERE account_number_normalized = '103147815'"),
                     {"yes": True, "id": desk_id, "name": "Mesa 01 Rogerio 10k"})
    with op.batch_alter_table("investment_accounts") as batch:
        batch.alter_column("identity_scope", existing_type=sa.String(36), nullable=False)
        batch.create_unique_constraint("uq_account_scope", ["account_number_normalized", "identity_scope"])
        batch.create_index("ix_investment_accounts_account_number_normalized", ["account_number_normalized"])


def downgrade():
    bind = op.get_bind()
    duplicate = bind.execute(sa.text("SELECT account_number_normalized FROM investment_accounts GROUP BY account_number_normalized HAVING COUNT(*) > 1")).first()
    if duplicate:
        raise RuntimeError("Não é possível reverter: existem várias mesas com o mesmo número de conta.")
    with op.batch_alter_table("investment_accounts") as batch:
        batch.drop_constraint("uq_account_scope", type_="unique")
        batch.drop_index("ix_investment_accounts_account_number_normalized")
        batch.drop_constraint("fk_account_desk", type_="foreignkey")
        batch.drop_column("desk_id")
        batch.drop_column("is_proprietary")
        batch.drop_column("identity_scope")
        batch.create_unique_constraint("uq_investment_accounts_account_number_normalized", ["account_number_normalized"])
    op.drop_table("proprietary_desks")
