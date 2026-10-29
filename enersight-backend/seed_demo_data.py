"""Seed EnerSight with a demonstrable reading history.

Why this exists
---------------
Two problems it solves:

1. **A fresh database has no Admin and no way to make one.** `POST /users/` refuses
   role="Admin" and every admin endpoint requires an existing admin, so without this
   script the first account has to be inserted with raw SQL.

2. **Readings entered through the UI were all stamped "now",** so the monthly trend
   chart collapses to a single bar and the forecast degenerates to a flat line from
   one data point. Real historical months are needed for either to show anything.

What it does
------------
By default it generates monthly reading history for the meters already in your
database, using your own buildings, so the charts fill in without inventing
fictional records. Consumption is derived from each building's floor area and type
so the resulting energy-use intensity lands in a sensible Normal / High / Critical
band on the GIS map.

Modes
-----
    python seed_demo_data.py --demo
        A complete test dataset in one step: the demo buildings, 18 months of
        readings (existing readings are DELETED first), an appliance list for each
        demo building (add --appliances to cover your own buildings too), and demo
        accounts including one pending sign-up. The buildings
        grade 2 Critical, 2 High, 2 Normal and 1 No Data, and their appliance lists
        produce every verdict in Analytics' measured-vs-estimated table.

    python seed_demo_data.py --backfill
        Add history *before* each meter's earliest existing reading. Nothing you
        already recorded is touched or moved.

    python seed_demo_data.py --replace
        Delete every existing reading, then generate a clean run of history ending
        at the current month. Use this when the existing rows are throwaway test
        data. DESTRUCTIVE.

    python seed_demo_data.py --demo-buildings
        Additionally create the demo buildings with their own meters and history.
        Only useful on an empty database.

    python seed_demo_data.py --appliances
        Give every building that has no appliance list one sized to its floor area.
        Buildings that already have appliances are left alone.

Common options
--------------
    --months 12              How many months of history (default 12, 18 with --demo).
    --admin-password X       Password for accounts this script has to create.
    --dry-run                Report what would change and write nothing.
"""

import argparse
import math
import random
import sys
from datetime import datetime, timedelta

from app.auth import hash_password
from app.database import SessionLocal
from app.models import Appliance, Building, ConsumptionRecord, Meter, User


# Annual kWh per m2 each building type is aimed at, for buildings that are not in
# DEMO_BUILDINGS. These sit where real campus buildings sit - schools and offices
# generally run 100-300 kWh/m2 a year, and a tropical climate pushes cooling load up
# rather than down - so a Critical tag means something a facilities engineer would
# also call high. The status bands are > 150 High and > 250 Critical.
#
# Each target sits far enough inside its band that the monthly swing below
# (season, drift and noise together, about -19% to +20%) never carries a single
# month into the next band. Laboratory was 280, which dipped to High every cool
# season.
EUI_TARGET_BY_TYPE = {
    "Laboratory": 320.0,  # Critical  - equipment plus cooling
    "Office": 190.0,      # High      - air-conditioned through the working day
    "Support": 110.0,     # Normal    - partial cooling, long opening hours
    "Warehouse": 60.0,    # Normal    - lighting and ventilation only
}

DEFAULT_EUI_TARGET = 140.0
FALLBACK_FLOOR_AREA = 800.0

# Month-to-month variation. The seasonal swing gives the same-month-last-year
# forecast something to match, and the drift gives the linear trend a slope.
# Drift is centred on the middle of the history so the long-run average stays on
# target instead of creeping upwards.
SEASONAL_SWING = 0.12
MONTHLY_DRIFT = 0.004
NOISE = 0.04

DEMO_ADDRESS = "DNSC Panabo Campus"

# Used by --demo and --demo-buildings. The first six match the frontend's "Load
# Samples" names, so the two never produce duplicate-looking buildings.
#
# `eui` is the annual target that decides the building's status, overriding its
# type. None leaves the building without readings, so it shows as No Data.
#
# `measured_vs_listed` is measured use divided by the appliance estimate. Analytics
# calls anything within 15% a match, flags more than 15% over, badges more than
# 50% over in red, and flags more than 15% under.
#
# These are generic campus building names, NOT a roster of real DNSC facilities,
# and the readings generated against them are simulated. Swap in the real names
# once they are known - and never present this history as measured data.
DEMO_BUILDINGS = [
    {
        "name": "Administration Building",
        "latitude": 7.31389, "longitude": 125.67127, "floor_area": 2400.0,
        "building_type": "Office", "meters": ["DNSC-ADM-01"],
        "eui": 195.0,                   # High
        "appliances": "office",
        "measured_vs_listed": 0.98,     # matches its list
    },
    {
        "name": "Institute of Computing",
        "latitude": 7.31425, "longitude": 125.67185, "floor_area": 1800.0,
        "building_type": "Laboratory", "meters": ["DNSC-ICT-01", "DNSC-ICT-02"],
        "eui": 340.0,                   # Critical
        "appliances": "computer_lab",
        "measured_vs_listed": 1.30,     # uses more than its list explains (amber)
    },
    {
        "name": "Learning Resource Center",
        "latitude": 7.31352, "longitude": 125.67068, "floor_area": 1600.0,
        "building_type": "Support", "meters": ["DNSC-LRC-01"],
        "eui": 110.0,                   # Normal
        "appliances": "library",
        "measured_vs_listed": 1.00,     # matches its list
    },
    {
        "name": "Science Laboratory Building",
        "latitude": 7.31461, "longitude": 125.67102, "floor_area": 1250.0,
        "building_type": "Office", "meters": ["DNSC-SCI-01"],
        "eui": 320.0,                   # Critical
        "appliances": "science_lab",
        "measured_vs_listed": 1.70,     # far more than its list explains (red)
    },
    {
        "name": "Student Center",
        "latitude": 7.31318, "longitude": 125.67214, "floor_area": 1400.0,
        "building_type": "Support", "meters": ["DNSC-STC-01"],
        "eui": 190.0,                   # High
        "appliances": "student_center",
        "measured_vs_listed": 0.72,     # uses less than its list says
    },
    {
        "name": "Maintenance and Storage",
        "latitude": 7.31278, "longitude": 125.67035, "floor_area": 900.0,
        "building_type": "Warehouse", "meters": ["DNSC-MNT-01"],
        "eui": 55.0,                    # Normal
        "appliances": "workshop",
        "measured_vs_listed": 1.00,     # matches its list
    },
    {
        # Newly turned over: a meter is installed but nobody has read it yet.
        "name": "New Academic Building",
        "latitude": 7.31497, "longitude": 125.67150, "floor_area": 1500.0,
        "building_type": "Office", "meters": ["DNSC-NAB-01"],
        "eui": None,                    # No Data
        "appliances": "office",
        "measured_vs_listed": None,
    },
]

DEMO_BY_NAME = {spec["name"]: spec for spec in DEMO_BUILDINGS}
DEMO_BUILDING_NAMES = list(DEMO_BY_NAME)

# name, category, watts, quantity, hours/day, days/month. Quantities are for a
# building of roughly 1,000 m2 and get scaled to hit each building's target.
# Single units (a server rack, an autoclave) stay single. Categories match the
# frontend's appliance form.
APPLIANCE_PROFILES = {
    "office": [
        ("Split-type aircon, 2.0 HP", "Cooling", 1800, 20, 9, 22),
        ("Window-type aircon, 1.5 HP", "Cooling", 1300, 6, 8, 22),
        ("Ceiling fan", "Cooling", 75, 20, 8, 22),
        ("LED tube light, 18 W", "Lighting", 18, 200, 10, 22),
        ("Desktop computer with monitor", "Office", 250, 60, 8, 22),
        ("Laser printer / photocopier", "Office", 900, 4, 3, 22),
        ("Network and server rack", "Office", 1200, 1, 24, 30),
        ("Refrigerator", "Kitchen", 150, 2, 24, 30),
        ("Water dispenser", "Kitchen", 500, 3, 6, 22),
    ],
    "computer_lab": [
        ("Split-type aircon, 2.5 HP", "Cooling", 2200, 16, 10, 22),
        ("Precision aircon, server room", "Cooling", 3500, 1, 24, 30),
        ("LED tube light, 18 W", "Lighting", 18, 150, 11, 22),
        ("Desktop computer with monitor", "Laboratory", 250, 120, 9, 22),
        ("Classroom projector", "Office", 300, 8, 6, 22),
        ("Rack server", "Laboratory", 800, 4, 24, 30),
        ("Network switch", "Laboratory", 150, 10, 24, 30),
    ],
    "science_lab": [
        ("Split-type aircon, 2.0 HP", "Cooling", 1800, 12, 9, 22),
        ("Fume hood exhaust fan", "Laboratory", 750, 4, 8, 22),
        ("Laboratory refrigerator", "Laboratory", 400, 4, 24, 30),
        ("Drying oven", "Laboratory", 1500, 2, 4, 22),
        ("Autoclave", "Laboratory", 2000, 1, 2, 22),
        ("Hot plate with stirrer", "Laboratory", 600, 8, 3, 22),
        ("Compound microscope", "Laboratory", 30, 30, 4, 22),
        ("LED tube light, 18 W", "Lighting", 18, 120, 10, 22),
    ],
    "library": [
        ("Split-type aircon, 2.0 HP", "Cooling", 1800, 14, 10, 26),
        ("Ceiling fan", "Cooling", 75, 20, 10, 26),
        ("LED tube light, 18 W", "Lighting", 18, 220, 11, 26),
        ("Computer, e-library and catalogue", "Office", 200, 30, 9, 26),
        ("Photocopier", "Office", 900, 2, 4, 26),
        ("CCTV system", "Others", 200, 1, 24, 30),
    ],
    "student_center": [
        ("Split-type aircon, 2.0 HP", "Cooling", 1800, 10, 10, 26),
        ("Stand fan", "Cooling", 75, 15, 10, 26),
        ("LED tube light, 18 W", "Lighting", 18, 150, 12, 26),
        ("Commercial refrigerator", "Kitchen", 600, 4, 24, 30),
        ("Chest freezer", "Kitchen", 300, 3, 24, 30),
        ("Electric rice cooker", "Kitchen", 1000, 4, 3, 26),
        ("Water dispenser", "Kitchen", 500, 4, 8, 26),
        ("Sound system", "Others", 800, 1, 4, 8),
    ],
    "workshop": [
        ("LED high-bay light, 150 W", "Lighting", 150, 20, 10, 22),
        ("Security light", "Lighting", 50, 12, 12, 30),
        ("Exhaust fan", "Cooling", 250, 6, 8, 22),
        ("Window-type aircon, 1.0 HP", "Cooling", 900, 2, 8, 22),
        ("Welding machine", "Others", 5000, 1, 2, 10),
        ("Air compressor", "Others", 2200, 1, 3, 22),
        ("Bench grinder and power tools", "Others", 900, 3, 2, 22),
        ("Water pump", "Others", 1500, 1, 6, 30),
    ],
}

PROFILE_BY_TYPE = {
    "Office": "office",
    "Laboratory": "computer_lab",
    "Support": "library",
    "Warehouse": "workshop",
}

# Created by --demo so every role can sign in and the approval queue on the Users
# page has an entry. An active account is only added when that role has no active
# user yet; the pending one is added unless its username is taken.
DEMO_USERS = [
    ("Demo Campus Administrator", "manager.demo", "Manager", "Active"),
    ("Demo Facilities Staff", "staff.demo", "Staff", "Active"),
    ("Pending Facilities Staff", "staff.pending", "Staff", "Pending"),
]


def seasonal_factor(month: int) -> float:
    """Hot-season bulge. Philippine demand peaks around April with air conditioning
    and dips in the cooler, wetter months, so a flat series would look synthetic.
    Peaks at 1.12 in April, troughs at 0.88 in October."""
    return 1.0 + SEASONAL_SWING * math.sin((month - 1) / 12.0 * 2 * math.pi)


def add_months(anchor: datetime, delta: int) -> datetime:
    """First day of the month `delta` months away from `anchor`."""
    year = anchor.year
    month = anchor.month + delta

    while month > 12:
        month -= 12
        year += 1

    while month <= 0:
        month += 12
        year -= 1

    return datetime(year, month, 1)


def eui_target(building: Building) -> float:
    spec = DEMO_BY_NAME.get(building.name)

    if spec and spec["eui"] is not None:
        return spec["eui"]

    return EUI_TARGET_BY_TYPE.get(building.building_type, DEFAULT_EUI_TARGET)


def daily_kwh_for_building(building: Building) -> float:
    """Daily consumption that lands this building near its annual EUI target."""
    floor_area = float(building.floor_area or 0) or FALLBACK_FLOOR_AREA

    return (eui_target(building) * floor_area) / 365.0


def is_left_unread(building: Building) -> bool:
    spec = DEMO_BY_NAME.get(building.name)

    return bool(spec) and spec["eui"] is None


def plan_reading_dates(
    month_starts: list[datetime], rng: random.Random, not_after: datetime
) -> list[datetime]:
    """One meter-reading visit early in each month, dropping any still to come."""
    dates = []

    for month_start in month_starts:
        visit = month_start + timedelta(
            days=rng.randint(1, 5),
            hours=rng.randint(8, 15),
            minutes=rng.randint(0, 59),
        )

        if visit < not_after:
            dates.append(visit)

    return dates


def build_interval_consumption(
    daily_kwh: float,
    dates: list[datetime],
    rng: random.Random,
    first_interval_days: float = 30.0,
) -> list[float]:
    """kWh for each reading: the daily rate times the days since the previous
    reading, shaped by season, a gentle drift and a little noise.

    Scaling by days is what keeps a building in one status band. Intensity is
    annualised over each interval's real length, so a flat monthly figure read 26
    days after the last reading annualises 13% high and one read 35 days after
    reads 13% low, which was enough to flip a building between High and Critical
    from one month to the next."""
    values = []
    middle = (len(dates) - 1) / 2

    for step, reading_date in enumerate(dates):
        days = (
            first_interval_days
            if step == 0
            else (reading_date - dates[step - 1]).total_seconds() / 86400.0
        )
        midpoint = reading_date - timedelta(days=days / 2)
        drift = 1.0 + MONTHLY_DRIFT * (step - middle)
        noise = rng.uniform(1.0 - NOISE, 1.0 + NOISE)

        values.append(daily_kwh * days * seasonal_factor(midpoint.month) * drift * noise)

    return values


def make_records(
    meter: Meter,
    user_id: int,
    start_value: float,
    dates: list[datetime],
    consumptions: list[float],
    rng: random.Random,
) -> tuple[list[ConsumptionRecord], float]:
    """Chain a run of readings forward from `start_value`. Each record's
    previous_reading is the one before it, so consumption differentials are correct
    and the meter face only ever counts up."""
    records = []
    running = float(start_value)
    last_index = len(dates) - 1

    for step, reading_date in enumerate(dates):
        previous = running
        running = round(previous + consumptions[step], 2)

        # Most readings came from a photo; some were typed by hand and carry no OCR
        # accuracy, which is what the real system produces.
        from_photo = rng.random() < 0.75

        records.append(
            ConsumptionRecord(
                meter_id=meter.meter_id,
                user_id=user_id,
                previous_reading=previous,
                reading_value=running,
                reading_date=reading_date,
                image_path=(
                    f"seed-{meter.serial_no.lower()}-{reading_date:%Y%m}.jpg"
                    if from_photo
                    else None
                ),
                ocr_accuracy=round(rng.uniform(88.0, 99.4), 2) if from_photo else None,
                # The two most recent months stay pending so the verify workflow has
                # something to act on during a demo.
                is_verified=step < last_index - 1,
            )
        )

    return records, running


def ensure_admin(db, password: str, dry_run: bool) -> User | None:
    existing_admin = db.query(User).filter(User.role == "Admin").first()

    if existing_admin:
        print(f"  Admin already exists: {existing_admin.username} (left untouched)")
        return existing_admin

    if dry_run:
        print("  Would create Admin 'admin'")
        return None

    admin = User(
        full_name="System Administrator",
        username="admin",
        password_hash=hash_password(password),
        role="Admin",
        status="Active",
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print(f"  Created Admin 'admin' with password '{password}'")
    print("  Change this password after your first sign-in.")

    return admin


def ensure_demo_users(db, password: str, dry_run: bool) -> int:
    created = 0

    for full_name, username, role, status in DEMO_USERS:
        if db.query(User).filter(User.username == username).first():
            print(f"  {username}: already exists (left untouched)")
            continue

        if status == "Active":
            active = (
                db.query(User).filter(User.role == role, User.status == "Active").first()
            )

            if active:
                print(f"  {username}: skipped, {active.username} is already an active {role}")
                continue

        if dry_run:
            print(f"  Would create {status.lower()} {role} '{username}'")
            created += 1
            continue

        db.add(
            User(
                full_name=full_name,
                username=username,
                password_hash=hash_password(password),
                role=role,
                status=status,
            )
        )
        db.commit()
        created += 1
        print(f"  Created {status.lower()} {role} '{username}' with password '{password}'")

    return created


def create_demo_buildings(db, rng: random.Random, dry_run: bool) -> int:
    created = 0

    for spec in DEMO_BUILDINGS:
        name = spec["name"]
        serials = spec["meters"]

        if db.query(Building).filter(Building.name == name).first():
            continue

        if dry_run:
            print(f"  Would create building {name!r} with {len(serials)} meter(s)")
            created += 1
            continue

        building = Building(
            name=name,
            address=DEMO_ADDRESS,
            latitude=spec["latitude"],
            longitude=spec["longitude"],
            floor_area=spec["floor_area"],
            building_type=spec["building_type"],
            status="Active",
        )
        db.add(building)
        db.commit()
        db.refresh(building)
        created += 1

        for index, serial in enumerate(serials):
            if db.query(Meter).filter(Meter.serial_no == serial).first():
                continue

            db.add(
                Meter(
                    building_id=building.building_id,
                    serial_no=serial,
                    meter_type="Digital",
                    status="Active",
                    meter_category="Main" if index == 0 else "Sub",
                    installation_date=datetime.utcnow().strftime("%Y-%m-%d"),
                    initial_reading=float(rng.randint(4000, 12000)),
                )
            )

        db.commit()
        print(f"  Created building {name!r} with {len(serials)} meter(s)")

    return created


def backfill_meter(
    meter: Meter,
    existing: list[ConsumptionRecord],
    meter_daily_kwh: float,
    months: int,
    user_id: int,
    rng: random.Random,
    dry_run: bool,
    db,
) -> int:
    """History that ends where the earliest existing reading begins, so the chain
    stays continuous and nothing already recorded has to move. Returns the number
    of readings added."""
    earliest = existing[0]
    anchor_month = datetime(earliest.reading_date.year, earliest.reading_date.month, 1)
    month_starts = [add_months(anchor_month, -(months - offset)) for offset in range(months)]
    dates = plan_reading_dates(month_starts, rng, earliest.reading_date)

    target_end = float(earliest.previous_reading or earliest.reading_value or 0.0)
    consumptions = build_interval_consumption(meter_daily_kwh, dates, rng)
    total = sum(consumptions)

    # The generated history has to fit under the value the existing chain already
    # starts from, or the meter would appear to count down.
    if total > target_end:
        if target_end <= 0:
            print(f"  {meter.serial_no}: no headroom before the first reading, skipped")
            return 0

        scale = (target_end * 0.95) / total
        consumptions = [value * scale for value in consumptions]

    start_value = target_end - sum(consumptions)
    records, _ = make_records(meter, user_id, start_value, dates, consumptions, rng)

    if dry_run:
        print(
            f"  {meter.serial_no}: would backfill {len(records)} month(s) "
            f"from {dates[0]:%b %Y} to {dates[-1]:%b %Y}"
        )
    else:
        db.add_all(records)
        db.commit()
        print(
            f"  {meter.serial_no}: backfilled {len(records)} month(s), "
            f"{start_value:,.0f} -> {target_end:,.0f} kWh"
        )

    return len(records)


def seed_meters(db, months: int, user_id: int, rng: random.Random, replace: bool, dry_run: bool) -> dict:
    stats = {"meters": 0, "readings": 0, "skipped": 0}

    meters = db.query(Meter).order_by(Meter.meter_id).all()

    if not meters:
        print("  No meters found. Add buildings and meters first, or use --demo-buildings.")
        return stats

    buildings = db.query(Building).order_by(Building.building_id).all()
    building_ids = {building.building_id for building in buildings}

    for meter in meters:
        if meter.building_id not in building_ids:
            print(f"  {meter.serial_no}: no building, skipped")
            stats["skipped"] += 1

    now = datetime.now()
    this_month = datetime(now.year, now.month, 1)
    # Up to and including this month, as long as this month's visit has happened.
    month_starts = [add_months(this_month, offset - months + 1) for offset in range(months)]

    for building in buildings:
        building_meters = [meter for meter in meters if meter.building_id == building.building_id]

        if not building_meters:
            continue

        if is_left_unread(building):
            print(f"  {building.name}: left without readings, so it shows No Data")
            stats["skipped"] += len(building_meters)
            continue

        meter_daily_kwh = daily_kwh_for_building(building) / len(building_meters)
        # Staff read all of a building's meters on one visit, so they share a date.
        # Staggered dates would widen the span a period's readings cover without
        # adding kWh, and read as a dip in intensity.
        visit_dates = plan_reading_dates(month_starts, rng, now - timedelta(hours=2))

        for index, meter in enumerate(building_meters):
            existing = (
                db.query(ConsumptionRecord)
                .filter(ConsumptionRecord.meter_id == meter.meter_id)
                .order_by(ConsumptionRecord.reading_date.asc())
                .all()
            )

            if existing and not replace:
                added = backfill_meter(
                    meter, existing, meter_daily_kwh, months, user_id, rng, dry_run, db
                )

                if added:
                    stats["meters"] += 1
                    stats["readings"] += added
                else:
                    stats["skipped"] += 1

                continue

            dates = [visit + timedelta(minutes=15 * index) for visit in visit_dates]
            consumptions = build_interval_consumption(meter_daily_kwh, dates, rng)
            start_value = float(meter.initial_reading or 0.0)
            records, final_value = make_records(
                meter, user_id, start_value, dates, consumptions, rng
            )

            if dry_run:
                print(
                    f"  {meter.serial_no}: would create {len(records)} month(s) "
                    f"from {dates[0]:%b %Y} to {dates[-1]:%b %Y}"
                )
            else:
                db.add_all(records)
                db.commit()
                print(
                    f"  {meter.serial_no}: {len(records)} month(s), "
                    f"{start_value:,.0f} -> {final_value:,.0f} kWh"
                )

            stats["meters"] += 1
            stats["readings"] += len(records)

    return stats


def appliance_kwh_month(item) -> float:
    _, _, watts, quantity, hours, days = item

    return watts * quantity * hours * days / 1000.0


def fit_appliance_list(profile: str, goal_kwh_month: float) -> list[tuple]:
    """The profile's appliances with quantities scaled so the list adds up to about
    `goal_kwh_month`. Single units stay single; everything else scales together."""
    items = APPLIANCE_PROFILES[profile]
    fixed = sum(appliance_kwh_month(item) for item in items if item[3] == 1)
    scalable = sum(appliance_kwh_month(item) for item in items if item[3] > 1)
    factor = max(goal_kwh_month - fixed, 0.0) / scalable if scalable else 0.0

    fitted = [
        (name, category, watts, quantity if quantity == 1 else max(1, round(quantity * factor)), hours, days)
        for name, category, watts, quantity, hours, days in items
    ]

    # Rounding quantities moves the total a little. Take up the slack on the
    # largest scalable load, where one unit more or less is the smallest change.
    scalable_indexes = [index for index, item in enumerate(items) if item[3] > 1]

    if scalable_indexes:
        biggest = max(scalable_indexes, key=lambda index: appliance_kwh_month(fitted[index]))
        name, category, watts, quantity, hours, days = fitted[biggest]
        per_unit = watts * hours * days / 1000.0
        gap = goal_kwh_month - sum(appliance_kwh_month(item) for item in fitted)
        fitted[biggest] = (
            name, category, watts, max(1, quantity + round(gap / per_unit)), hours, days
        )

    return fitted


def seed_appliances(db, dry_run: bool, demo_only: bool) -> int:
    """`demo_only` keeps invented appliance lists off buildings you added yourself."""
    created = 0

    for building in db.query(Building).order_by(Building.building_id).all():
        if demo_only and building.name not in DEMO_BY_NAME:
            continue

        if db.query(Appliance).filter(Appliance.building_id == building.building_id).count():
            print(f"  {building.name}: already has an appliance list (left untouched)")
            continue

        spec = DEMO_BY_NAME.get(building.name, {})
        profile = spec.get("appliances") or PROFILE_BY_TYPE.get(building.building_type, "office")
        ratio = spec.get("measured_vs_listed") or 1.0
        measured_kwh_month = daily_kwh_for_building(building) * 365.0 / 12.0
        items = fit_appliance_list(profile, measured_kwh_month / ratio)
        listed_kwh_month = sum(appliance_kwh_month(item) for item in items)

        if dry_run:
            print(
                f"  {building.name}: would add {len(items)} appliance(s), "
                f"{listed_kwh_month:,.0f} kWh/month listed"
            )
            created += len(items)
            continue

        for name, category, watts, quantity, hours, days in items:
            db.add(
                Appliance(
                    building_id=building.building_id,
                    name=name,
                    category=category,
                    wattage=float(watts),
                    quantity=quantity,
                    hours_per_day=float(hours),
                    days_per_month=days,
                )
            )

        db.commit()
        created += len(items)

        if is_left_unread(building):
            comparison = "no readings to compare against"
        else:
            comparison = f"about {measured_kwh_month:,.0f} kWh/month measured"

        print(
            f"  {building.name}: {len(items)} appliance(s), "
            f"{listed_kwh_month:,.0f} kWh/month listed, {comparison}"
        )

    return created


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate monthly reading history so the trend and forecast charts have data."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--demo",
        action="store_true",
        help=(
            "Full test dataset: demo buildings, demo users, appliances, and a fresh "
            "reading history. DELETES existing readings."
        ),
    )
    mode.add_argument(
        "--backfill",
        action="store_true",
        help="Add history before each meter's earliest existing reading. Non-destructive.",
    )
    mode.add_argument(
        "--replace",
        action="store_true",
        help="DELETE every existing reading, then generate a clean history. Destructive.",
    )
    parser.add_argument(
        "--demo-buildings",
        action="store_true",
        help="Also create the demo buildings. Only useful on an empty database.",
    )
    parser.add_argument(
        "--appliances",
        action="store_true",
        help="Add a sized appliance list to every building that has none. Non-destructive.",
    )
    parser.add_argument(
        "--months",
        type=int,
        default=None,
        help="Months of history (default 12, or 18 with --demo).",
    )
    parser.add_argument(
        "--admin-password",
        default="EnerSight2026!",
        help="Password for any account this script has to create.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report changes, write nothing.")
    parser.add_argument(
        "--seed", type=int, default=20260912, help="Random seed, so runs are repeatable."
    )

    args = parser.parse_args()

    # --demo on its own only invents appliances for the demo buildings. Adding
    # --appliances extends that to every building without a list.
    appliances_for_all = args.appliances

    if args.demo:
        args.replace = True
        args.demo_buildings = True
        args.appliances = True

    if args.months is None:
        # 18 months gives the same-month-last-year forecast a year to match against
        # plus six months to back-test it on.
        args.months = 18 if args.demo else 12

    if args.months < 1 or args.months > 60:
        print("--months must be between 1 and 60.")
        return 1

    seeds_readings = args.backfill or args.replace or args.demo_buildings

    if not seeds_readings and not args.appliances:
        parser.print_help()
        print(
            "\nPick a mode: --demo (full test data, destructive), --backfill (safe), "
            "--replace (destructive), --demo-buildings, or --appliances."
        )
        return 1

    rng = random.Random(args.seed)
    db = SessionLocal()

    try:
        if args.dry_run:
            print("DRY RUN - nothing will be written.\n")

        print("Ensuring an Admin account exists...")
        admin = ensure_admin(db, args.admin_password, args.dry_run)
        admin_id = admin.user_id if admin else None

        if args.demo:
            print("\nCreating demo accounts...")
            ensure_demo_users(db, args.admin_password, args.dry_run)

        if args.demo_buildings:
            print("\nCreating demo buildings...")
            create_demo_buildings(db, rng, args.dry_run)

        stats = None

        if seeds_readings:
            if args.replace:
                existing_count = db.query(ConsumptionRecord).count()
                print(f"\nDeleting {existing_count} existing reading(s)...")

                if not args.dry_run:
                    db.query(ConsumptionRecord).delete(synchronize_session=False)
                    db.commit()

            print(f"\nGenerating {args.months} months of history...")
            stats = seed_meters(db, args.months, admin_id, rng, args.replace, args.dry_run)

        appliance_count = None

        if args.appliances:
            print("\nAdding appliance lists...")
            appliance_count = seed_appliances(
                db, args.dry_run, demo_only=args.demo and not appliances_for_all
            )

        total_readings = db.query(ConsumptionRecord).count()

        print("")
        print("Done." if not args.dry_run else "Dry run complete.")

        if stats is not None:
            print(
                f"  {stats['meters']} meter(s) seeded, {stats['readings']} reading(s) "
                f"generated, {stats['skipped']} skipped."
            )

        if appliance_count is not None:
            print(f"  {appliance_count} appliance(s) added.")

        print(f"  The database now holds {total_readings} reading(s) in total.")
    except Exception as exc:  # noqa: BLE001 - a seed script should report and exit
        db.rollback()
        print(f"Seeding failed: {exc}")
        return 1
    finally:
        db.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
