"""
SIAE — Modelos de Planes de Crucero.
Salidas con waypoints, millas náuticas y estado del crucero.
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum
from datetime import datetime


class CruiseStatus(str, enum.Enum):
    """Estado del plan de crucero."""
    BORRADOR    = "borrador"
    PENDIENTE   = "pendiente"
    PLANIFICADO = "planificado"
    EN_CURSO    = "en_curso"
    COMPLETADO  = "completado"
    CANCELADO   = "cancelado"


class CruisePlan(Base):
    """Plan de crucero / salida de investigación."""

    __tablename__ = "cruise_plans"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    captain_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    vessel_request_id = Column(Integer, ForeignKey("vessel_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    scientific_leader = Column(String(200), nullable=True)
    departure_port_id = Column(Integer, ForeignKey("ports.id", ondelete="SET NULL"), nullable=True)
    return_port_id = Column(Integer, ForeignKey("ports.id", ondelete="SET NULL"), nullable=True)

    name = Column(String(200), nullable=False)
    objective = Column(Text, nullable=True)        # Objetivo científico/operativo
    status = Column(SAEnum(CruiseStatus), nullable=False, default=CruiseStatus.PLANIFICADO)

    # Fechas
    departure_date = Column(DateTime, nullable=True)
    return_date = Column(DateTime, nullable=True)
    departure_port = Column(String(200), nullable=True)
    return_port = Column(String(200), nullable=True)

    # Métricas
    planned_nm = Column(Float, nullable=True)      # Millas náuticas planificadas
    actual_nm = Column(Float, nullable=True)       # Millas náuticas reales
    fuel_consumed = Column(Float, nullable=True)   # Combustible consumido (litros)
    crew_count = Column(Integer, nullable=True)    # Número de tripulantes
    scientists_count = Column(Integer, nullable=True)  # Investigadores a bordo
    # Nuevos campos para Plan de Campaña (Fase 4)
    cruise_number = Column(String(100), unique=True, nullable=True, index=True)
    project_name = Column(String(300), nullable=True)
    study_area = Column(Text, nullable=True)
    disciplines = Column(Text, nullable=True)
    funding_source = Column(String(300), nullable=True)
    cruise_responsible = Column(String(200), nullable=True)

    notes = Column(Text, nullable=True)

    # Track GPS real (subido post-crucero)
    actual_track = Column(JSON, nullable=True)              # [{lat, lon, time?}]
    actual_track_filename = Column(String(300), nullable=True)
    actual_track_uploaded_at = Column(DateTime, nullable=True)

    # Reporte de salida
    trip_report = Column(Text, nullable=True)   # Observaciones/resumen de la salida

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="cruise_plans", lazy="selectin")
    captain = relationship("User", foreign_keys=[captain_id], backref="commanded_cruises", lazy="selectin")
    vessel_request = relationship("VesselRequest", backref="cruise_plans", lazy="selectin")
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_cruises", lazy="selectin")
    project = relationship("Project", back_populates="cruises", lazy="selectin")
    waypoints = relationship("CruiseWaypoint", back_populates="cruise", lazy="selectin",
                             cascade="all, delete-orphan", order_by="CruiseWaypoint.order_index")
    participants = relationship("CruiseParticipant", back_populates="cruise", lazy="selectin",
                                cascade="all, delete-orphan",
                                order_by="CruiseParticipant.role_in_cruise")
    crew = relationship("CruiseCrew", back_populates="cruise", lazy="selectin",
                        cascade="all, delete-orphan")
    checklist = relationship("CruiseEquipmentChecklist", back_populates="cruise", lazy="selectin",
                             cascade="all, delete-orphan")
    discharges = relationship("CruiseLogisticsDischarge", back_populates="cruise", lazy="selectin",
                              cascade="all, delete-orphan")
    departure_port_ref = relationship("Port", foreign_keys=[departure_port_id], lazy="selectin")
    return_port_ref = relationship("Port", foreign_keys=[return_port_id], lazy="selectin")

    @property
    def duration_days(self):
        if self.departure_date and self.return_date:
            dep_date = self.departure_date.date() if isinstance(self.departure_date, datetime) else self.departure_date
            ret_date = self.return_date.date() if isinstance(self.return_date, datetime) else self.return_date
            return (ret_date - dep_date).days
        return None

    @property
    def participants_count(self) -> int:
        return len(self.participants) if self.participants else 0

    def __repr__(self):
        return f"<CruisePlan {self.name} ({self.status.value})>"


class CruiseWaypoint(Base):
    """Waypoint / punto de interés de un crucero."""

    __tablename__ = "cruise_waypoints"

    id = Column(Integer, primary_key=True, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"), nullable=False, index=True)

    order_index = Column(Integer, nullable=False, default=0)
    name = Column(String(200), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(String(300), nullable=True)
    waypoint_type = Column(String(50), nullable=True)  # salida, llegada, estacion, etc.
    arrival_date = Column(Date, nullable=True)
    departure_date = Column(Date, nullable=True)
    
    speed_knots = Column(Float, nullable=True)
    activity = Column(Text, nullable=True)
    duration_hours = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    cruise = relationship("CruisePlan", back_populates="waypoints", lazy="selectin")
    samples = relationship("CruiseWaypointSample", back_populates="waypoint", lazy="selectin",
                           cascade="all, delete-orphan", order_by="CruiseWaypointSample.sampling_order")

    def __repr__(self):
        return f"<CruiseWaypoint {self.name} ({self.latitude},{self.longitude})>"


class CruiseEquipmentChecklist(Base):
    """Checklist de equipos y materiales a embarcar por investigador."""
    __tablename__ = "cruise_equipment_checklist"

    id = Column(Integer, primary_key=True, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    
    investigator_name = Column(String(150), nullable=False)
    item_name = Column(String(200), nullable=False)
    quantity = Column(Float, nullable=False, default=1.0)
    is_boarded = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relación
    cruise = relationship("CruisePlan", back_populates="checklist", lazy="selectin")

    def __repr__(self):
        return f"<CruiseEquipmentChecklist {self.item_name} for {self.investigator_name}>"


class CruiseLogisticsDischarge(Base):
    """Puntos de descarga y logística de muestras en ruta."""
    __tablename__ = "cruise_logistics_discharges"

    id = Column(Integer, primary_key=True, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    
    port_name = Column(String(200), nullable=False)
    discharge_date = Column(DateTime, nullable=True)
    responsible_land_person = Column(String(150), nullable=True)
    destination_lab = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relación
    cruise = relationship("CruisePlan", back_populates="discharges", lazy="selectin")

    def __repr__(self):
        return f"<CruiseLogisticsDischarge {self.port_name}>"


class CruiseWaypointSample(Base):
    """Matriz científica de muestreo en cada waypoint/estación."""
    __tablename__ = "cruise_waypoint_samples"

    id = Column(Integer, primary_key=True, index=True)
    waypoint_id = Column(Integer, ForeignKey("cruise_waypoints.id", ondelete="CASCADE"), nullable=False, index=True)
    
    variable_name = Column(String(150), nullable=False)
    sampling_order = Column(Integer, nullable=False, default=1)
    responsible_name = Column(String(150), nullable=True)
    volume_needed = Column(String(50), nullable=True)
    depth_surface = Column(Boolean, default=False, nullable=False)
    depth_mid_water = Column(Boolean, default=False, nullable=False)
    depth_bottom = Column(Boolean, default=False, nullable=False)
    depth_custom = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relación
    waypoint = relationship("CruiseWaypoint", back_populates="samples", lazy="selectin")

    def __repr__(self):
        return f"<CruiseWaypointSample {self.variable_name} order={self.sampling_order}>"
