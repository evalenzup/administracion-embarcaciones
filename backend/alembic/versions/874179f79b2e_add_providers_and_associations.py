"""add_providers_and_associations

Revision ID: 874179f79b2e
Revises: 74836363a5b4
Create Date: 2026-06-19 19:26:26.981991
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '874179f79b2e'
down_revision: Union[str, None] = '74836363a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Get database connection
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Create providers table if not exists
    if 'providers' not in tables:
        op.create_table(
            'providers',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('rfc', sa.String(length=50), nullable=False),
            sa.Column('legal_name', sa.String(length=250), nullable=True),
            sa.Column('commercial_name', sa.String(length=250), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
        )
        op.create_index(op.f('ix_providers_id'), 'providers', ['id'], unique=False)
        op.create_index(op.f('ix_providers_rfc'), 'providers', ['rfc'], unique=True)

    # 2. Create accounts table if not exists
    if 'accounts' not in tables:
        op.create_table(
            'accounts',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('account_number', sa.String(length=50), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
        )
        op.create_index(op.f('ix_accounts_id'), 'accounts', ['id'], unique=False)
        op.create_index(op.f('ix_accounts_name'), 'accounts', ['name'], unique=True)

    # 3. Create account_transactions table if not exists
    if 'account_transactions' not in tables:
        op.create_table(
            'account_transactions',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('account_id', sa.Integer(), nullable=False),
            sa.Column('type', sa.String(length=50), nullable=False),
            sa.Column('amount', sa.Float(), nullable=False),
            sa.Column('concept', sa.String(length=200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('reference', sa.String(length=100), nullable=True),
            sa.Column('origin_dest_account', sa.String(length=150), nullable=True),
            sa.Column('transaction_date', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('petty_cash_invoice_id', sa.Integer(), nullable=True),
            sa.Column('petty_cash_reimbursement_id', sa.Integer(), nullable=True),
            sa.Column('transfer_transaction_id', sa.Integer(), nullable=True),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('category_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['petty_cash_invoice_id'], ['petty_cash_invoices.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['petty_cash_reimbursement_id'], ['petty_cash_reimbursements.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['transfer_transaction_id'], ['account_transactions.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['category_id'], ['financial_categories.id'], ondelete='SET NULL')
        )
        op.create_index(op.f('ix_account_transactions_id'), 'account_transactions', ['id'], unique=False)
        op.create_index(op.f('ix_account_transactions_account_id'), 'account_transactions', ['account_id'], unique=False)
        op.create_index(op.f('ix_account_transactions_transaction_date'), 'account_transactions', ['transaction_date'], unique=False)

    # 4. Create service_requests table if not exists
    if 'service_requests' not in tables:
        op.create_table(
            'service_requests',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('internal_folio', sa.String(length=50), nullable=False),
            sa.Column('provider_name', sa.String(length=200), nullable=True),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='solicitado'),
            sa.Column('episa_folio', sa.String(length=100), nullable=False),
            sa.Column('authorization_folio', sa.String(length=100), nullable=True),
            sa.Column('budget_amount', sa.Float(), nullable=False),
            sa.Column('budget_file', sa.String(length=300), nullable=True),
            sa.Column('authorization_email_file', sa.String(length=300), nullable=True),
            sa.Column('invoice_xml_file', sa.String(length=300), nullable=True),
            sa.Column('invoice_pdf_file', sa.String(length=300), nullable=True),
            sa.Column('conformity_letter_file', sa.String(length=300), nullable=True),
            sa.Column('payment_receipt_file', sa.String(length=300), nullable=True),
            sa.Column('provider_id', sa.Integer(), nullable=True),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL')
        )
        op.create_index(op.f('ix_service_requests_id'), 'service_requests', ['id'], unique=False)
        op.create_index(op.f('ix_service_requests_internal_folio'), 'service_requests', ['internal_folio'], unique=True)

    # 5. Create service_stage_histories table if not exists
    if 'service_stage_histories' not in tables:
        op.create_table(
            'service_stage_histories',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('service_request_id', sa.Integer(), nullable=False),
            sa.Column('stage', sa.String(length=50), nullable=False),
            sa.Column('entered_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['service_request_id'], ['service_requests.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL')
        )
        op.create_index(op.f('ix_service_stage_histories_id'), 'service_stage_histories', ['id'], unique=False)
        op.create_index(op.f('ix_service_stage_histories_service_request_id'), 'service_stage_histories', ['service_request_id'], unique=False)

    # 6. Create service_observations table if not exists
    if 'service_observations' not in tables:
        op.create_table(
            'service_observations',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('service_request_id', sa.Integer(), nullable=False),
            sa.Column('notes', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['service_request_id'], ['service_requests.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL')
        )
        op.create_index(op.f('ix_service_observations_id'), 'service_observations', ['id'], unique=False)
        op.create_index(op.f('ix_service_observations_service_request_id'), 'service_observations', ['service_request_id'], unique=False)

    # 7. Alter petty_cash_invoices to add provider_id column if not exists
    pci_columns = [col['name'] for col in inspector.get_columns('petty_cash_invoices')]
    if 'provider_id' not in pci_columns:
        op.add_column('petty_cash_invoices', sa.Column('provider_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_petty_cash_invoices_provider_id_providers',
            'petty_cash_invoices', 'providers',
            ['provider_id'], ['id'],
            ondelete='SET NULL'
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Drop petty_cash_invoices provider_id relation
    if 'petty_cash_invoices' in tables:
        pci_columns = [col['name'] for col in inspector.get_columns('petty_cash_invoices')]
        if 'provider_id' in pci_columns:
            op.drop_constraint('fk_petty_cash_invoices_provider_id_providers', 'petty_cash_invoices', type_='foreignkey')
            op.drop_column('petty_cash_invoices', 'provider_id')

    # Drop tables in reverse order
    if 'service_observations' in tables:
        op.drop_table('service_observations')
    if 'service_stage_histories' in tables:
        op.drop_table('service_stage_histories')
    if 'service_requests' in tables:
        op.drop_table('service_requests')
    if 'account_transactions' in tables:
        op.drop_table('account_transactions')
    if 'accounts' in tables:
        op.drop_table('accounts')
    if 'providers' in tables:
        op.drop_table('providers')
