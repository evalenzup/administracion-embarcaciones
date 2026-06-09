"""
SIAE — Router de Auditoría del sistema.
Solo lectura — lista las acciones registradas con filtros.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogList

router = APIRouter(prefix="/api/v1/audit", tags=["Auditoría"])


@router.get("", response_model=AuditLogList)
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    module: str = Query(None),
    action: str = Query(None),
    username: str = Query(None),
    start_date: str = Query(None), # YYYY-MM-DD
    end_date: str = Query(None),   # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "view")),
):
    """Listar logs de auditoría con filtros. Solo para administradores."""
    query = db.query(AuditLog)

    if module:
        query = query.filter(AuditLog.module == module)
    if action:
        query = query.filter(AuditLog.action == action)
    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username}%"))
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(AuditLog.created_at >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            # Incluir todo el día (hasta 23:59:59)
            end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(AuditLog.created_at <= end_dt)
        except ValueError:
            pass

    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()

    return AuditLogList(total=total, items=items)
