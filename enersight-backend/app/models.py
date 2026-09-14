from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Staff")
    full_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Pending")

    consumption_records = relationship("ConsumptionRecord", back_populates="user")


class Building(Base):
    __tablename__ = "buildings"

    building_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    floor_area = Column(Float, nullable=True)
    building_type = Column(String, nullable=True)
    status = Column(String, default="Active")

    # Meter.building_id is NOT NULL, so without a cascade SQLAlchemy tries to null it
    # on parent delete and raises IntegrityError. The route still refuses to delete a
    # building whose meters carry readings, so this only ever removes empty meters.
    meters = relationship(
        "Meter", back_populates="building", cascade="all, delete-orphan"
    )
    appliances = relationship(
        "Appliance", back_populates="building", cascade="all, delete-orphan"
    )


class Meter(Base):
    __tablename__ = "meters"

    meter_id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.building_id"), nullable=False)
    serial_no = Column(String, nullable=False)
    meter_type = Column(String, nullable=True, default="Digital")
    status = Column(String, nullable=True, default="Active")
    meter_category = Column(String, nullable=True)
    installation_date = Column(String, nullable=True)
    initial_reading = Column(Float, nullable=True, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    building = relationship("Building", back_populates="meters")
    consumption_records = relationship("ConsumptionRecord", back_populates="meter")


class ConsumptionRecord(Base):
    __tablename__ = "consumption_records"

    record_id = Column(Integer, primary_key=True, index=True)
    meter_id = Column(Integer, ForeignKey("meters.meter_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    previous_reading = Column(Float, nullable=True, default=0.0)
    reading_value = Column(Float, nullable=False)
    reading_date = Column(DateTime, default=datetime.utcnow)
    image_path = Column(String, nullable=True)
    ocr_accuracy = Column(Float, nullable=True)
    is_verified = Column(Boolean, default=False)

    meter = relationship("Meter", back_populates="consumption_records")
    user = relationship("User", back_populates="consumption_records")


class Appliance(Base):
    __tablename__ = "appliances"

    appliance_id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.building_id"), nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    wattage = Column(Float, nullable=False, default=0.0)
    quantity = Column(Integer, nullable=False, default=1)
    hours_per_day = Column(Float, nullable=False, default=0.0)
    days_per_month = Column(Integer, nullable=False, default=30)
    created_at = Column(DateTime, default=datetime.utcnow)

    building = relationship("Building", back_populates="appliances")


class Setting(Base):
    __tablename__ = "settings"

    setting_id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# The EnergyReport model was removed. Reports are computed on demand from
# consumption_records, so nothing ever read or wrote that table; it only added a
# phantom entity to the schema. Recover it from git history if stored report
# snapshots are ever needed.


class AccessLog(Base):
    """Audit trail. Written through app/audit.py."""

    __tablename__ = "access_log"

    log_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    action_type = Column(String, nullable=False)
    log_datetime = Column(DateTime, default=datetime.utcnow, index=True)
