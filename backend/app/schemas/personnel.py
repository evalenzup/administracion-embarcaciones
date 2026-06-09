"""
SIAE — Schemas Pydantic para Personal.
"""
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.personnel import PersonnelRole, PersonnelStatus


class PersonnelCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    employee_number: str | None = Field(None, max_length=50)
    curp: str | None = Field(None, max_length=20)
    rfc: str | None = Field(None, max_length=15)
    nationality: str | None = Field("Mexicana", max_length=100)
    phone: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    emergency_contact: str | None = Field(None, max_length=200)
    emergency_phone: str | None = Field(None, max_length=30)
    role: PersonnelRole = PersonnelRole.MARINERO
    status: PersonnelStatus = PersonnelStatus.ACTIVO
    hire_date: date | None = None
    birth_date: date | None = None
    blood_type: str | None = Field(None, max_length=5)
    passport_number: str | None = Field(None, max_length=50)
    passport_expiry: date | None = None
    seamans_book: str | None = Field(None, max_length=50)
    seamans_book_expiry: date | None = None
    medical_cert_expiry: date | None = None
    stcw_expiry: date | None = None
    notes: str | None = None
    user_id: int | None = None
    photo_url: str | None = None
    id_document_url: str | None = None
    seamans_book_url: str | None = None


class PersonnelUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    employee_number: str | None = None
    curp: str | None = None
    rfc: str | None = None
    nationality: str | None = None
    phone: str | None = None
    email: str | None = None
    emergency_contact: str | None = None
    emergency_phone: str | None = None
    role: PersonnelRole | None = None
    status: PersonnelStatus | None = None
    hire_date: date | None = None
    birth_date: date | None = None
    blood_type: str | None = None
    passport_number: str | None = None
    passport_expiry: date | None = None
    seamans_book: str | None = None
    seamans_book_expiry: date | None = None
    medical_cert_expiry: date | None = None
    stcw_expiry: date | None = None
    notes: str | None = None
    user_id: int | None = None
    is_active: bool | None = None
    photo_url: str | None = None
    id_document_url: str | None = None
    seamans_book_url: str | None = None


class UserBasicPersonnel(BaseModel):
    id: int; username: str; full_name: str
    model_config = {"from_attributes": True}


class PersonnelResponse(BaseModel):
    id: int
    user_id: int | None = None
    first_name: str
    last_name: str
    full_name: str
    employee_number: str | None = None
    curp: str | None = None
    rfc: str | None = None
    nationality: str | None = None
    phone: str | None = None
    email: str | None = None
    emergency_contact: str | None = None
    emergency_phone: str | None = None
    role: PersonnelRole
    status: PersonnelStatus
    hire_date: date | None = None
    birth_date: date | None = None
    blood_type: str | None = None
    passport_number: str | None = None
    passport_expiry: date | None = None
    seamans_book: str | None = None
    seamans_book_expiry: date | None = None
    medical_cert_expiry: date | None = None
    stcw_expiry: date | None = None
    photo_url: str | None = None
    id_document_url: str | None = None
    seamans_book_url: str | None = None
    notes: str | None = None
    is_active: bool
    document_alerts: list[dict] = []
    system_user: UserBasicPersonnel | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PersonnelList(BaseModel):
    total: int
    items: list[PersonnelResponse]
