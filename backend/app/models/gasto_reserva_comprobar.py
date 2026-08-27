"""
SIAE — Modelo de Base de Datos para Gastos a Reserva de Comprobar (GRC).
Permite gestionar solicitudes de viáticos/gastos en anticipo, firmas, comprobación de facturas y auditoría de tiempos.
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class GastoReservaComprobar(Base):
    """Solicitud de Gasto a Reserva de Comprobar (GRC) de la DEO."""
    __tablename__ = "gastos_reserva_comprobar"

    id = Column(Integer, primary_key=True, index=True)
    folio_episa = Column(String(100), unique=True, nullable=False, index=True)
    solicitante_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    fecha_solicitud = Column(Date, nullable=False, server_default=func.current_date())
    fecha_pago_servicio = Column(Date, nullable=True)
    
    justificacion = Column(Text, nullable=False)
    observaciones = Column(Text, nullable=True)
    
    # Montos financieros
    monto_solicitado = Column(Float, nullable=False, default=0.0)
    monto_comprobado = Column(Float, nullable=False, default=0.0)
    monto_devuelto = Column(Float, nullable=False, default=0.0)
    monto_saldo_favor = Column(Float, nullable=False, default=0.0)
    
    # Estados: borrador, solicitado, aprobado, comprobacion_pendiente, comprobado, rechazado
    status = Column(String(50), nullable=False, default="borrador")
    
    # Archivos
    solicitud_pdf_path = Column(String(500), nullable=True)
    comprobacion_pdf_path = Column(String(500), nullable=True)
    comprobante_devolucion_path = Column(String(500), nullable=True)
    
    # Cuentas, proyectos y categorías
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    category_id = Column(Integer, ForeignKey("financial_categories.id", ondelete="SET NULL"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    project_name = Column(String(300), nullable=True)  # Nombre del proyecto / campaña de respaldo
    asistente_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Firmas y Marcas de tiempo de los reportes firmados institucionalmente
    firma_solicitante_nombre = Column(String(200), nullable=True)
    firma_solicitante_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_solicitante_hash = Column(Text, nullable=True)
    
    firma_revisor_nombre = Column(String(200), nullable=True)
    firma_revisor_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_revisor_hash = Column(Text, nullable=True)
    
    firma_jefe_nombre = Column(String(200), nullable=True)
    firma_jefe_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_jefe_hash = Column(Text, nullable=True)
    
    firma_adquisiciones_nombre = Column(String(200), nullable=True)
    firma_adquisiciones_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_adquisiciones_hash = Column(Text, nullable=True)
    
    firma_director_nombre = Column(String(200), nullable=True)
    firma_director_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_director_hash = Column(Text, nullable=True)
    
    firma_tesoreria_nombre = Column(String(200), nullable=True)
    firma_tesoreria_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_tesoreria_hash = Column(Text, nullable=True)
    
    firma_contabilidad_nombre = Column(String(200), nullable=True)
    firma_contabilidad_fecha = Column(DateTime(timezone=True), nullable=True)
    firma_contabilidad_hash = Column(Text, nullable=True)

    # Métricas de tiempos calculados (en horas)
    tiempo_revisor_horas = Column(Float, nullable=True)
    tiempo_jefe_horas = Column(Float, nullable=True)
    tiempo_director_horas = Column(Float, nullable=True)
    tiempo_tesoreria_horas = Column(Float, nullable=True)
    tiempo_contabilidad_horas = Column(Float, nullable=True)
    tiempo_total_dias = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    solicitante = relationship("User", foreign_keys=[solicitante_id], lazy="selectin")
    asistente = relationship("User", foreign_keys=[asistente_id], lazy="selectin")
    account = relationship("Account", lazy="selectin")
    category = relationship("FinancialCategory", lazy="selectin")
    project = relationship("Project", lazy="selectin")
    facturas = relationship("GastoReservaComprobarFactura", back_populates="gasto", cascade="all, delete-orphan")
    items = relationship("GastoReservaComprobarItem", back_populates="gasto", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<GastoReservaComprobar {self.folio_episa} - ${self.monto_solicitado} ({self.status})>"


class GastoReservaComprobarItem(Base):
    """Partida o concepto individual solicitado en un GRC."""
    __tablename__ = "gastos_reserva_comprobar_items"

    id = Column(Integer, primary_key=True, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos_reserva_comprobar.id", ondelete="CASCADE"), nullable=False, index=True)
    
    concepto = Column(String(300), nullable=False)
    partida = Column(String(50), nullable=False)  # ej. 21601
    cucop = Column(String(200), nullable=True)
    rubro_conacyt = Column(String(100), nullable=True)
    subtotal = Column(Float, nullable=False)

    gasto = relationship("GastoReservaComprobar", back_populates="items")


class GastoReservaComprobarFactura(Base):
    """Factura o comprobante CFDI asociado a la comprobación de un GRC."""
    __tablename__ = "gastos_reserva_comprobar_facturas"

    id = Column(Integer, primary_key=True, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos_reserva_comprobar.id", ondelete="CASCADE"), nullable=False, index=True)
    
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
    gasto = relationship("GastoReservaComprobar", back_populates="facturas")
    category = relationship("FinancialCategory", lazy="selectin")
    registered_by = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<GastoReservaComprobarFactura {self.uuid or 'MANUAL'} - Total: {self.total}>"
