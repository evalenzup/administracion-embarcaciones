"""
SIAE — Servicio de auditoría.
Provee funciones para registrar acciones de usuario en el sistema.
"""

import json
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def log_action(
    db: Session,
    user_id: int | None,
    username: str,
    action: str,
    module: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    description: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Registrar una acción en el log de auditoría."""
    entry = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return entry
