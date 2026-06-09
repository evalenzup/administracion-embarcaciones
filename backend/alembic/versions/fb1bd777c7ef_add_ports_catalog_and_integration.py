"""add_ports_catalog_and_integration

Revision ID: fb1bd777c7ef
Revises: e20df57efd44
Create Date: 2026-06-08 17:40:45.817798
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = 'fb1bd777c7ef'
down_revision: Union[str, None] = 'e20df57efd44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # ── Create ports table if it doesn't exist ──
    if 'ports' not in tables:
        op.create_table(
            'ports',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('latitude', sa.Float(), nullable=False),
            sa.Column('longitude', sa.Float(), nullable=False),
            sa.Column('description', sa.String(length=300), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_ports_id'), 'ports', ['id'], unique=False)
        op.create_index(op.f('ix_ports_name'), 'ports', ['name'], unique=True)

    # ── Add FK columns to cruise_plans if they don't exist ──
    columns = [c['name'] for c in inspector.get_columns('cruise_plans')]
    if 'departure_port_id' not in columns:
        op.add_column('cruise_plans', sa.Column('departure_port_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_cruise_plans_departure_port_id_ports', 'cruise_plans', 'ports', ['departure_port_id'], ['id'], ondelete='SET NULL')
    
    if 'return_port_id' not in columns:
        op.add_column('cruise_plans', sa.Column('return_port_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_cruise_plans_return_port_id_ports', 'cruise_plans', 'ports', ['return_port_id'], ['id'], ondelete='SET NULL')

    # ── Seed default ports if empty ──
    res = conn.execute(sa.text("SELECT COUNT(*) FROM ports")).scalar()
    if res == 0:
        op.execute(
            "INSERT INTO ports (name, latitude, longitude, description, is_active) VALUES "
            "('Ensenada, BC (Muelle principal)', 31.8615, -116.6340, 'Dársena / API Ensenada', true), "
            "('El Sauzal, BC (Escollera Sauzal)', 31.8906, -116.6872, 'Puerto de El Sauzal, Ensenada', true), "
            "('La Paz, BCS (Pichilingue)', 24.2764, -110.3168, 'Puerto de Pichilingue, La Paz', true), "
            "('Guaymas, Son.', 27.9171, -110.8936, 'Puerto de Guaymas', true), "
            "('Mazatlán, Sin.', 23.1895, -106.4215, 'Puerto de Mazatlán', true)"
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # ── Remove columns from cruise_plans if they exist ──
    if 'cruise_plans' in tables:
        columns = [c['name'] for c in inspector.get_columns('cruise_plans')]
        if 'return_port_id' in columns:
            op.drop_constraint('fk_cruise_plans_return_port_id_ports', 'cruise_plans', type_='foreignkey')
            op.drop_column('cruise_plans', 'return_port_id')
        if 'departure_port_id' in columns:
            op.drop_constraint('fk_cruise_plans_departure_port_id_ports', 'cruise_plans', type_='foreignkey')
            op.drop_column('cruise_plans', 'departure_port_id')

    # ── Drop ports table if it exists ──
    if 'ports' in tables:
        op.drop_index(op.f('ix_ports_name'), table_name='ports')
        op.drop_index(op.f('ix_ports_id'), table_name='ports')
        op.drop_table('ports')
