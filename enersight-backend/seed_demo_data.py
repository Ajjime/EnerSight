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
    python seed_demo_data.py --backfill
        Add history *before* each meter's earliest existing reading. Nothing you
        already recorded is touched or moved.

    python seed_demo_data.py --replace
        Delete every existing reading, then generate a clean run of history ending
        at the current month. Use this when the existing rows are throwaway test
        data. DESTRUCTIVE.

    python seed_demo_data.py --demo-buildings
        Additionally create five fictional buildings with their own meters and
        history. Only useful on an empty database.

Common options
--------------
    --months 12              How many months of history (default 12).
    --admin-password X       Password to use if an Admin has to be created.
    --dry-run                Report what would change and write nothing.
"""

import argparse
import math
import random
import sys
from datetime import datetime, timedelta

from app.auth import hash_password
from app.database import SessionLocal
from app.models import Building, ConsumptionRecord, Meter, User


# Annual energy-use intensity targets in kWh per square metre, by building type.
# The GIS map calls EUI > 20 Critical and > 10 High, so these deliberately spread
# buildings across all three bands instead of making everything one colour.
EUI_TARGET_BY_TYPE = {
    "Laboratory": 22.0,   # Critical
    "Office": 13.0,       # High
    "Support": 8.0,       # Normal
    "Warehouse": 5.0,     # Normal
}

DEFAULT_EUI_TARGET = 11.0
FALLBACK_FLOOR_AREA = 800.0

# Only used with --demo-buildings. Matches the frontend's "Load Sample Data" names
# so the two never produce duplicate-looking buildings.
DEMO_BUILDINGS = [
    ("Admin Building", "Main Campus", 7.3089, 125.6841, 1200.0, "Office", ["MTR-ADM-001"]),
    ("Engineering Building", "Engineering Complex", 7.3093, 125.6848, 1850.0, "Laboratory", ["MTR-ENG-001", "MTR-ENG-002"]),
    ("Library", "Learning Resource Center", 7.3084, 125.6835, 980.0, "Support", ["MTR-LIB-001"]),
    ("Warehouse", "Service Area", 7.3101, 125.6853, 2100.0, "Warehouse", ["MTR-WHS-001"]),
    ("Laboratory Building", "Science Wing", 7.3098, 125.6829, 1450.0, "Laboratory", ["MTR-LAB-001"]),
]

DEMO_BUILDING_NAMES = [entry[0] for entry in DEMO_BUILDINGS]


def seasonal_factor(month: int) -> float:
    """Hot-season bulge. Philippine demand peaks around April with air conditioning
    and dips in the cooler, wetter months, so a flat series would look synthetic.
    Peaks at 1.18 in April, troughs at 0.82 in October."""
    return 1.0 + 0.18 * math.sin((month - 1) / 12.0 * 2 * math.pi)


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


def monthly_kwh_for_building(building: Building) -> float:
    """Monthly consumption that lands this building near its type's EUI target."""
    floor_area = float(building.floor_area or 0) or FALLBACK_FLOOR_AREA
    target = EUI_TARGET_BY_TYPE.get(building.building_type, DEFAULT_EUI_TARGET)

    return (target * floor_area) / 12.0


def build_monthly_consumption(
    monthly_kwh: float, month_starts: list[datetime], rng: random.Random
) -> list[float]:
    """A gentle upward drift plus a seasonal bulge and a little noise, so the linear
    forecast has a real slope to find rather than a perfectly straight line."""
    values = []

    for step, month_start in enumerate(month_starts):
        growth = 1.0 + (0.012 * step)
        noise = rng.uniform(0.94, 1.06)
        values.append(monthly_kwh * growth * seasonal_factor(month_start.month) * noise)

    return values


def make_records(
    meter: Meter,
    user_id: int,
    start_value: float,
    month_starts: list[datetime],
    consumptions: list[float],
    rng: random.Random,
) -> tuple[list[ConsumptionRecord], float]:
    """Chain a run of readings forward from `start_value`. Each record's
    previous_reading is the one before it, so consumption differentials are correct
    and the meter face only ever counts up."""
    records = []
    running = float(start_value)
    last_index = len(month_starts) - 1

    for step, month_start in enumerate(month_starts):
        previous = running
        running = round(previous + consumptions[step], 2)

        reading_date = month_start + timedelta(
            days=rng.randint(1, 5),
            hours=rng.randint(8, 16),
            minutes=rng.randint(0, 59),
        )

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
                    f"seed-{meter.serial_no.lower()}-{month_start:%Y%m}.jpg"
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


def create_demo_buildings(db, rng: random.Random, dry_run: bool) -> int:
    created = 0

    for name, address, lat, lon, area, btype, serials in DEMO_BUILDINGS:
        if db.query(Building).filter(Building.name == name).first():
            continue

        if dry_run:
            print(f"  Would create building {name!r} with {len(serials)} meter(s)")
            created += 1
            continue

        building = Building(
            name=name,
            address=address,
            latitude=lat,
            longitude=lon,
            floor_area=area,
            building_type=btype,
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


def seed_meters(db, months: int, admin_id: int, rng: random.Random, replace: bool, dry_run: bool) -> dict:
    stats = {"meters": 0, "readings": 0, "skipped": 0}

    meters = db.query(Meter).order_by(Meter.meter_id).all()

    if not meters:
        print("  No meters found. Add buildings and meters first, or use --demo-buildings.")
        return stats

    this_month = datetime(datetime.utcnow().year, datetime.utcnow().month, 1)

    for meter in meters:
        building = (
            db.query(Building).filter(Building.building_id == meter.building_id).first()
        )

        if not building:
            print(f"  {meter.serial_no}: no building, skipped")
            stats["skipped"] += 1
            continue

        existing = (
            db.query(ConsumptionRecord)
            .filter(ConsumptionRecord.meter_id == meter.meter_id)
            .order_by(ConsumptionRecord.reading_date.asc())
            .all()
        )

        monthly_kwh = monthly_kwh_for_building(building) / max(
            db.query(Meter).filter(Meter.building_id == building.building_id).count(), 1
        )

        if replace or not existing:
            # A clean run of complete months ending with last month.
            month_starts = [add_months(this_month, -(months - offset)) for offset in range(months)]
            start_value = float(meter.initial_reading or 0.0)
        else:
            # Backfill: end where the earliest existing reading begins, so the chain
            # stays continuous and nothing already recorded has to move.
            earliest = existing[0]
            anchor_month = datetime(earliest.reading_date.year, earliest.reading_date.month, 1)
            month_starts = [add_months(anchor_month, -(months - offset)) for offset in range(months)]

            target_end = float(earliest.previous_reading or earliest.reading_value or 0.0)
            consumptions = build_monthly_consumption(monthly_kwh, month_starts, rng)
            total = sum(consumptions)

            # The generated history has to fit under the value the existing chain
            # already starts from, or the meter would appear to count down.
            if total > target_end:
                if target_end <= 0:
                    print(f"  {meter.serial_no}: no headroom before the first reading, skipped")
                    stats["skipped"] += 1
                    continue

                scale = (target_end * 0.95) / total
                consumptions = [value * scale for value in consumptions]

            start_value = target_end - sum(consumptions)

            records, _ = make_records(
                meter, admin_id, start_value, month_starts, consumptions, rng
            )

            if dry_run:
                print(
                    f"  {meter.serial_no}: would backfill {len(records)} month(s) "
                    f"from {month_starts[0]:%b %Y} to {month_starts[-1]:%b %Y}"
                )
            else:
                db.add_all(records)
                db.commit()
                print(
                    f"  {meter.serial_no}: backfilled {len(records)} month(s), "
                    f"{start_value:,.0f} -> {target_end:,.0f} kWh"
                )

            stats["meters"] += 1
            stats["readings"] += len(records)
            continue

        consumptions = build_monthly_consumption(monthly_kwh, month_starts, rng)
        records, final_value = make_records(
            meter, admin_id, start_value, month_starts, consumptions, rng
        )

        if dry_run:
            print(
                f"  {meter.serial_no}: would create {len(records)} month(s) "
                f"from {month_starts[0]:%b %Y} to {month_starts[-1]:%b %Y}"
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate monthly reading history so the trend and forecast charts have data."
    )
    mode = parser.add_mutually_exclusive_group()
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
        help="Also create five fictional buildings. Only useful on an empty database.",
    )
    parser.add_argument("--months", type=int, default=12, help="Months of history (default 12).")
    parser.add_argument(
        "--admin-password",
        default="EnerSight2026!",
        help="Password for the admin account, if one has to be created.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report changes, write nothing.")
    parser.add_argument(
        "--seed", type=int, default=20260912, help="Random seed, so runs are repeatable."
    )

    args = parser.parse_args()

    if args.months < 1 or args.months > 60:
        print("--months must be between 1 and 60.")
        return 1

    if not args.backfill and not args.replace and not args.demo_buildings:
        parser.print_help()
        print("\nPick a mode: --backfill (safe), --replace (destructive), or --demo-buildings.")
        return 1

    rng = random.Random(args.seed)
    db = SessionLocal()

    try:
        if args.dry_run:
            print("DRY RUN - nothing will be written.\n")

        print("Ensuring an Admin account exists...")
        admin = ensure_admin(db, args.admin_password, args.dry_run)
        admin_id = admin.user_id if admin else None

        if args.demo_buildings:
            print("\nCreating demo buildings...")
            create_demo_buildings(db, rng, args.dry_run)

        if args.replace:
            existing_count = db.query(ConsumptionRecord).count()
            print(f"\nDeleting {existing_count} existing reading(s)...")

            if not args.dry_run:
                db.query(ConsumptionRecord).delete(synchronize_session=False)
                db.commit()

        print(f"\nGenerating {args.months} months of history...")
        stats = seed_meters(db, args.months, admin_id, rng, args.replace, args.dry_run)

        total_readings = db.query(ConsumptionRecord).count()

        print("")
        print("Done." if not args.dry_run else "Dry run complete.")
        print(
            f"  {stats['meters']} meter(s) seeded, {stats['readings']} reading(s) "
            f"generated, {stats['skipped']} skipped."
        )
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
