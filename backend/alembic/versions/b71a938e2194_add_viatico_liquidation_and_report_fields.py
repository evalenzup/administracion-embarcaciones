"""add_viatico_liquidation_and_report_fields

Revision ID: b71a938e2194
Revises: 20925c67f23c
Create Date: 2026-09-01 14:35:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = 'b71a938e2194'
down_revision: Union[str, None] = '20925c67f23c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('viaticos', sa.Column('reporte_pdf_path', sa.String(length=500), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_solicitante_nombre', sa.String(length=200), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_solicitante_fecha', sa.DateTime(timezone=True), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_solicitante_hash', sa.Text(), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_revisor_nombre', sa.String(length=200), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_revisor_fecha', sa.DateTime(timezone=True), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_revisor_hash', sa.Text(), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_tesoreria_nombre', sa.String(length=200), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_tesoreria_fecha', sa.DateTime(timezone=True), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_tesoreria_hash', sa.Text(), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_contabilidad_nombre', sa.String(length=200), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_contabilidad_fecha', sa.DateTime(timezone=True), nullable=True))
    op.add_column('viaticos', sa.Column('firma_comp_contabilidad_hash', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('viaticos', 'firma_comp_contabilidad_hash')
    op.drop_column('viaticos', 'firma_comp_contabilidad_fecha')
    op.drop_column('viaticos', 'firma_comp_contabilidad_nombre')
    op.drop_column('viaticos', 'firma_comp_tesoreria_hash')
    op.drop_column('viaticos', 'firma_comp_tesoreria_fecha')
    op.drop_column('viaticos', 'firma_comp_tesoreria_nombre')
    op.drop_column('viaticos', 'firma_comp_revisor_hash')
    op.drop_column('viaticos', 'firma_comp_revisor_fecha')
    op.drop_column('viaticos', 'firma_comp_revisor_nombre')
    op.drop_column('viaticos', 'firma_comp_solicitante_hash')
    op.drop_column('viaticos', 'firma_comp_solicitante_fecha')
    op.drop_column('viaticos', 'firma_comp_solicitante_nombre')
    op.drop_column('viaticos', 'reporte_pdf_path')
