"""add account contract fees

Revision ID: 8f1b2c3d4e5f
Revises: 06ecddec748d
"""

from alembic import op
import sqlalchemy as sa


revision = "8f1b2c3d4e5f"
down_revision = "06ecddec748d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("investment_accounts", sa.Column("construction_win_fee", sa.Numeric(10, 2), nullable=True))
    op.add_column("investment_accounts", sa.Column("construction_wdo_fee", sa.Numeric(10, 2), nullable=True))
    op.add_column("investment_accounts", sa.Column("real_win_fee", sa.Numeric(10, 2), nullable=True))
    op.add_column("investment_accounts", sa.Column("real_wdo_fee", sa.Numeric(10, 2), nullable=True))
    # Rates supplied for accounts that were configured before this feature.
    op.execute(
        sa.text(
            """
            UPDATE investment_accounts
            SET construction_win_fee = 0.50,
                construction_wdo_fee = 1.50,
                real_win_fee = 0.66,
                real_wdo_fee = 1.73
            """
        )
    )


def downgrade():
    op.drop_column("investment_accounts", "real_wdo_fee")
    op.drop_column("investment_accounts", "real_win_fee")
    op.drop_column("investment_accounts", "construction_wdo_fee")
    op.drop_column("investment_accounts", "construction_win_fee")
