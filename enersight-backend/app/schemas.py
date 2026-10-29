from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str = "Staff"


class UserOut(BaseModel):
    user_id: int
    full_name: str
    username: str
    role: str
    status: str

    class Config:
        from_attributes = True


class UserStatusUpdate(BaseModel):
    status: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class BuildingCreate(BaseModel):
    name: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    floor_area: Optional[float] = None
    building_type: Optional[str] = None
    status: str = "Active"


class BuildingResponse(BuildingCreate):
    building_id: int

    class Config:
        from_attributes = True


class MeterCreate(BaseModel):
    building_id: int
    serial_no: str
    meter_type: Optional[str] = "Digital"
    status: Optional[str] = "Active"
    meter_category: Optional[str] = None
    installation_date: Optional[str] = None
    initial_reading: Optional[float] = 0.0


class MeterResponse(MeterCreate):
    meter_id: int
    latest_reading: Optional[float] = None
    previous_reading: Optional[float] = None

    class Config:
        from_attributes = True


class ApplianceCreate(BaseModel):
    """Appliance input.

    The bounds matter: these fields feed
    `watts x quantity x hours/day x days/month / 1000`, and without them a negative
    quantity produced negative kWh and negative pesos in the building totals, while
    30 hours a day was accepted without comment.
    """

    building_id: int
    name: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None
    wattage: float = Field(default=0.0, ge=0, le=100000)
    quantity: int = Field(default=1, ge=1, le=10000)
    hours_per_day: float = Field(default=0.0, ge=0, le=24)
    days_per_month: int = Field(default=30, ge=1, le=31)


class ApplianceResponse(ApplianceCreate):
    appliance_id: int
    estimated_kwh_month: float = 0.0
    estimated_cost_month: float = 0.0

    class Config:
        from_attributes = True


class RateUpdate(BaseModel):
    rate_per_kwh: float


class RateResponse(BaseModel):
    rate_per_kwh: float


class ReadingCreate(BaseModel):
    """Input for creating or updating a reading.

    Deliberately does NOT accept `user_id` or `is_verified`:

    - `user_id` is taken from the authenticated token instead. Accepting it let any
      Staff user attribute a reading to somebody else, and the frontend's fallback
      of `|| 1` silently credited readings to user 1 whenever localStorage was
      malformed. An audit trail you can forge is not an audit trail.
    - `is_verified` is set only by PUT /readings/{id}/verify, which requires Admin
      or Manager. As a plain input field it let a Staff user mark their own reading
      verified at creation and walk straight around that restriction.
    """

    meter_id: int
    previous_reading: Optional[float] = Field(default=None, ge=0)
    reading_value: float = Field(ge=0)
    # Optional so a reading can be backdated. Without this field the column default
    # (utcnow) stamps every reading with the moment it was typed, which collapses the
    # monthly trend and the forecast to a single data point.
    reading_date: Optional[datetime] = None
    image_path: Optional[str] = None
    ocr_accuracy: Optional[float] = Field(default=None, ge=0, le=100)
    # What OCR read, as a digit string so leading zeros survive. Set once at
    # creation; PUT /readings/{id} ignores it.
    ocr_reading: Optional[str] = Field(default=None, max_length=12, pattern=r"^[0-9]+$")


class ReadingResponse(ReadingCreate):
    record_id: int
    reading_date: datetime
    # Output only; see the note on ReadingCreate.
    user_id: Optional[int] = None
    is_verified: bool = False

    class Config:
        from_attributes = True


class ReportCreate(BaseModel):
    """A snapshot of a report the user just generated.

    The figures are sent by the client because the Reports page already computes
    them from the readings it has loaded; this records what was presented, which
    is the point of an audit snapshot. `building_id` null means the report covered
    the whole campus.

    `user_id` and `generated_at` are deliberately absent: both are set from the
    server, so a saved report cannot be attributed to somebody else or backdated.
    """

    building_id: Optional[int] = None
    # Long enough to carry the period alongside the type, since Table 2.5 gives
    # the snapshot no separate period column.
    report_type: str = Field(min_length=1, max_length=120)
    total_consumption: float = Field(default=0, ge=0)
    average_consumption: float = Field(default=0, ge=0)
    peak_consumption: float = Field(default=0, ge=0)


class ReportResponse(BaseModel):
    report_id: int
    building_id: Optional[int] = None
    user_id: Optional[int] = None
    report_type: Optional[str] = None
    total_consumption: float = 0
    average_consumption: float = 0
    peak_consumption: float = 0
    generated_at: datetime

    class Config:
        from_attributes = True
