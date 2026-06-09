# SIAE Models — Importar todos los modelos para que Alembic los detecte
from app.models.permission import Permission
from app.models.role import Role, role_permissions
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.models.vessel import Vessel
from app.models.vessel_rate import VesselRate, VesselRateClientType
from app.models.document import Document
from app.models.maintenance import MaintenanceCategory, MaintenanceRecord
from app.models.inventory import InventoryItem, InventoryMovement
from app.models.logbook import LogbookEntry
from app.models.cruise import CruisePlan, CruiseWaypoint, CruiseEquipmentChecklist, CruiseLogisticsDischarge, CruiseWaypointSample
from app.models.cruise_billing import CruiseBilling, BillingStatus
from app.models.vessel_request import VesselRequest
from app.models.participant_profile import ParticipantProfile
from app.models.cruise_participant import CruiseParticipant
from app.models.cruise_crew import CruiseCrew
from app.models.personnel import Personnel
from app.models.equipment import Equipment, EquipmentRoutine, EquipmentRoutinePart
from app.models.vessel_crew import VesselCrew
from app.models.port import Port
from app.models.fuel_log import FuelLog

__all__ = [
    "Permission", "Role", "role_permissions", "User", "UserRole",
    "AuditLog", "Vessel", "VesselRate", "VesselRateClientType", "Document",
    "Port",
    "MaintenanceCategory", "MaintenanceRecord",
    "InventoryItem", "InventoryMovement",
    "LogbookEntry",
    "CruisePlan", "CruiseWaypoint", "CruiseParticipant", "CruiseCrew",
    "ParticipantProfile",
    "Personnel",
    "CruiseEquipmentChecklist",
    "CruiseLogisticsDischarge",
    "CruiseWaypointSample",
    "CruiseBilling",
    "BillingStatus",
    "VesselRequest",
    "Equipment",
    "EquipmentRoutine",
    "EquipmentRoutinePart",
    "VesselCrew",
    "FuelLog",
]
