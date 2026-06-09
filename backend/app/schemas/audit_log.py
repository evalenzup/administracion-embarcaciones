"""
SIAE — Schemas Pydantic para AuditLog.
"""

from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    """Respuesta de entrada de auditoría."""
    id: int
    user_id: int | None = None
    username: str
    action: str
    module: str
    entity_type: str | None = None
    entity_id: int | None = None
    description: str | None = None
    details: str | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogList(BaseModel):
    """Lista paginada de logs de auditoría."""
    total: int
    items: list[AuditLogResponse]
