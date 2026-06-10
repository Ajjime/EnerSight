from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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


class ReadingCreate(BaseModel):
    meter_id: int
    user_id: Optional[int] = None
    previous_reading: Optional[float] = None
    reading_value: float
    image_path: Optional[str] = None
    ocr_accuracy: Optional[float] = None
    is_verified: bool = False


class ReadingResponse(ReadingCreate):
    record_id: int
    reading_date: datetime

    class Config:
        from_attributes = True
