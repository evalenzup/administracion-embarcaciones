"""
SIAE — Modelo de Base de Datos para Proyectos.
Almacena la información de los proyectos científicos y operativos del departamento.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Project(Base):
    """Proyectos de investigación científica y logística de la DEO."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    account_number = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(300), nullable=False)
    responsible_name = Column(String(200), nullable=False)
    department = Column(String(150), nullable=False)
    division = Column(String(150), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cruises = relationship("CruisePlan", back_populates="project")
    vessel_requests = relationship("VesselRequest", back_populates="project")

    def __repr__(self):
        return f"<Project {self.account_number} - {self.name}>"
