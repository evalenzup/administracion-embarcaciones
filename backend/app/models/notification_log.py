"""
SIAE — Modelo NotificationLog.
Registra el histórico de notificaciones y alertas enviadas por Telegram a comisionados, solicitantes y asistentes.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class NotificationLog(Base):
    """Registro de notificaciones push enviadas vía Telegram."""

    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    tramite_type = Column(String(50), nullable=False, index=True)  # 'viatico', 'grc', 'general'
    tramite_id = Column(Integer, nullable=True, index=True)
    notification_type = Column(String(50), nullable=False, index=True)
    # Ejemplos: 'aprobado', 'rechazado', 'salida_dia_previo', 'fin_comision',
    #           'semaforo_preventivo', 'semaforo_urgente', 'remanente_devolucion',
    #           'comprobado', 'manual_announcement', 'broadcast'

    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    telegram_id = Column(String(50), nullable=False, index=True)
    recipient_role = Column(String(20), nullable=False, default="titular")  # 'titular', 'asistente', 'admin', 'general'
    
    title = Column(String(200), nullable=True)
    message_text = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="sent")  # 'sent', 'failed', 'simulated'
    error_detail = Column(Text, nullable=True)
    
    sent_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relación
    user = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<NotificationLog {self.tramite_type}:{self.tramite_id} -> {self.telegram_id} ({self.notification_type})>"
