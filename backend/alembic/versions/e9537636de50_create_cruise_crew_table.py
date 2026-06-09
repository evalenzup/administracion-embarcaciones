"""create_cruise_crew_table

Revision ID: e9537636de50
Revises: 2cf21eb9fb51
Create Date: 2026-06-03 18:18:37.315627
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM


# revision identifiers
revision: str = 'e9537636de50'
down_revision: Union[str, None] = '2cf21eb9fb51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Dropear tabla si fue auto-creada por SQLAlchemy al reiniciar el contenedor
    op.execute("DROP TABLE IF EXISTS cruise_crew CASCADE")

    # 1. Crear tabla cruise_crew
    op.create_table(
        'cruise_crew',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cruise_id', sa.Integer(), nullable=False),
        sa.Column('personnel_id', sa.Integer(), nullable=False),
        sa.Column('role', ENUM('capitan', 'primer_oficial', 'marinero', 'jefe_maquinas', 'medico', name='crewrole', create_type=False), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['cruise_id'], ['cruise_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['personnel_id'], ['personnel.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cruise_crew_id'), 'cruise_crew', ['id'], unique=False)
    op.create_index(op.f('ix_cruise_crew_cruise_id'), 'cruise_crew', ['cruise_id'], unique=False)
    op.create_index(op.f('ix_cruise_crew_personnel_id'), 'cruise_crew', ['personnel_id'], unique=False)

    # 2. Migrar datos existentes (copiar tripulación de cruise_participants a cruise_crew)
    op.execute("""
        INSERT INTO cruise_crew (cruise_id, personnel_id, role, notes, created_at, updated_at)
        SELECT cp.cruise_id, pp.personnel_id, upper(cp.role_in_cruise::text)::crewrole, cp.notes, cp.created_at, cp.updated_at
        FROM cruise_participants cp
        JOIN participant_profiles pp ON cp.participant_id = pp.id
        WHERE pp.personnel_id IS NOT NULL
          AND upper(cp.role_in_cruise::text) IN ('CAPITAN', 'PRIMER_OFICIAL', 'MARINERO', 'JEFE_MAQUINAS', 'MEDICO')
    """)

    # 3. Eliminar tripulantes de la tabla cruise_participants
    op.execute("""
        DELETE FROM cruise_participants
        WHERE id IN (
            SELECT cp.id
            FROM cruise_participants cp
            JOIN participant_profiles pp ON cp.participant_id = pp.id
            WHERE pp.personnel_id IS NOT NULL
              AND upper(cp.role_in_cruise::text) IN ('CAPITAN', 'PRIMER_OFICIAL', 'MARINERO', 'JEFE_MAQUINAS', 'MEDICO')
        )
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_cruise_crew_personnel_id'), table_name='cruise_crew')
    op.drop_index(op.f('ix_cruise_crew_cruise_id'), table_name='cruise_crew')
    op.drop_index(op.f('ix_cruise_crew_id'), table_name='cruise_crew')
    op.drop_table('cruise_crew')
