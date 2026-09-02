"""
SIAE — Modelo de Base de Datos para Viáticos.
Permite gestionar comisiones de viaje, montos solicitados, viáticos, comprobación de facturas.
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Viatico(Base):
    """Solicitud de Viático para comisiones de viaje de la DEO."""
    __tablename__ = "viaticos"

    id = Column(Integer, primary_key=True, index=True)
    folio_comision = Column(String(100), unique=True, nullable=False, index=True)
    personal_id = Column(Integer, ForeignKey("personnel.id", ondelete="SET NULL"), nullable=True)
    
    fecha_solicitud = Column(Date, nullable=False, server_default=func.current_date())
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    destino = Column(String(200), nullable=False)
    
    justificacion = Column(Text, nullable=False)
    observaciones = Column(Text, nullable=True)
    
    # Montos financieros
    monto_solicitado = Column(Float, nullable=False, default=0.0)
    monto_viaticos = Column(Float, nullable=False, default=0.0)
    monto_pasaje_aereo = Column(Float, nullable=False, default=0.0)
    monto_hospedaje_paquete = Column(Float, nullable=False, default=0.0)
    monto_arrendamiento_vehiculos = Column(Float, nullable=False, default=0.0)
    monto_pasaje_terrestre = Column(Float, nullable=False, default=0.0)
    monto_gasolina = Column(Float, nullable=False, default=0.0)
    
    monto_comprobado = Column(Float, nullable=False, default=0.0)
    monto_devuelto = Column(Float, nullable=False, default=0.0)
    monto_saldo_favor = Column(Float, nullable=False, default=0.0)
    
    # Estados: borrador, solicitado, aprobado, comprobacion_pendiente, comprobado, rechazado
    status = Column(String(50), nullable=False, default="borrador")
    
    # Archivos PDF
    solicitud_pdf_path = Column(String(500), nullable=True)
    comprobacion_pdf_path = Column(String(500), nullable=True)
    comprobante_devolucion_path = Column(String(500), nullable=True)
    reporte_pdf_path = Column(String(500), nullable=True)

    # Historial de firmas de la solicitud
    firma_solicitante_nombre = Column(String(200), nullable=True)
    firma_solicitante_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_solicitante_hash = Column(Text, nullable=True)
    
    firma_jefe_nombre = Column(String(200), nullable=True)
    firma_jefe_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_jefe_hash = Column(Text, nullable=True)
    
    firma_revisor_nombre = Column(String(200), nullable=True)
    firma_revisor_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_revisor_hash = Column(Text, nullable=True)
    
    firma_tesoreria_nombre = Column(String(200), nullable=True)
    firma_tesoreria_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_tesoreria_hash = Column(Text, nullable=True)
    
    firma_responsable_nombre = Column(String(200), nullable=True)
    firma_responsable_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_responsable_hash = Column(Text, nullable=True)

    # Historial de firmas de la comprobación EPISA
    firma_comp_solicitante_nombre = Column(String(200), nullable=True)
    firma_comp_solicitante_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_comp_solicitante_hash = Column(Text, nullable=True)

    firma_comp_revisor_nombre = Column(String(200), nullable=True)
    firma_comp_revisor_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_comp_revisor_hash = Column(Text, nullable=True)

    firma_comp_tesoreria_nombre = Column(String(200), nullable=True)
    firma_comp_tesoreria_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_comp_tesoreria_hash = Column(Text, nullable=True)

    firma_comp_contabilidad_nombre = Column(String(200), nullable=True)
    firma_comp_contabilidad_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_comp_contabilidad_hash = Column(Text, nullable=True)
    
    # Cuentas, proyectos
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    project_name = Column(String(300), nullable=True)
    asistente_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    personal = relationship("Personnel", foreign_keys=[personal_id], lazy="selectin")
    asistente = relationship("User", foreign_keys=[asistente_id], lazy="selectin")
    account = relationship("Account", lazy="selectin")
    project = relationship("Project", lazy="selectin")
    facturas = relationship("ViaticoFactura", back_populates="viatico", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Viatico {self.folio_comision} - ${self.monto_solicitado} ({self.status})>"


class ViaticoFactura(Base):
    """Factura CFDI asociada a la comprobación de un Viático."""
    __tablename__ = "viaticos_facturas"

    id = Column(Integer, primary_key=True, index=True)
    viatico_id = Column(Integer, ForeignKey("viaticos.id", ondelete="CASCADE"), nullable=False, index=True)
    
    uuid = Column(String(100), unique=True, nullable=True, index=True)  # UUID fiscal (para facturas XML)
    folio = Column(String(50), nullable=True)
    serie = Column(String(50), nullable=True)
    
    emisor_rfc = Column(String(20), nullable=False)
    emisor_nombre = Column(String(200), nullable=False)
    
    receptor_rfc = Column(String(20), nullable=True)
    receptor_nombre = Column(String(200), nullable=True)
    
    # Montos
    subtotal = Column(Float, nullable=False)
    iva = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False)
    moneda = Column(String(10), nullable=False, default="MXN")
    
    fecha_emision = Column(DateTime(timezone=True), nullable=True)
    
    xml_filename = Column(String(300), nullable=True)
    pdf_filename = Column(String(300), nullable=True)
    
    is_manual = Column(Integer, default=0, nullable=True)  # 1 si es carga manual sin XML, 0/None si es XML
    category_id = Column(Integer, ForeignKey("financial_categories.id", ondelete="RESTRICT"), nullable=True)
    description = Column(Text, nullable=True)
    
    sat_status = Column(String(50), nullable=True, default="Desconocido")
    sat_verified_at = Column(DateTime(timezone=True), nullable=True)
    
    registered_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    viatico = relationship("Viatico", back_populates="facturas")
    category = relationship("FinancialCategory", lazy="selectin")
    registered_by = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<ViaticoFactura {self.uuid or 'MANUAL'} - Total: {self.total}>"
