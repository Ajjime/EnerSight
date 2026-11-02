// The demo campus that Settings → Sample data loads and removes. It mirrors
// DEMO_BUILDINGS in enersight-backend/seed_demo_data.py (sampleData.test.js
// reads that file and fails if they drift), so loading samples here and seeding
// from the backend produce the same buildings and meters.
//
// The Buildings and Meters pages used to carry their own copies. The meters
// copy still named buildings from an older sample set ("Admin Building",
// "Library"), so loading sample meters always failed.

export const SAMPLE_ADDRESS = "DNSC Panabo Campus";

export const SAMPLE_BUILDINGS = [
  {
    name: "Administration Building",
    latitude: 7.31389,
    longitude: 125.67127,
    floor_area: 2400,
    building_type: "Office",
    meters: ["DNSC-ADM-01"],
  },
  {
    name: "Institute of Computing",
    latitude: 7.31425,
    longitude: 125.67185,
    floor_area: 1800,
    building_type: "Laboratory",
    meters: ["DNSC-ICT-01", "DNSC-ICT-02"],
  },
  {
    name: "Learning Resource Center",
    latitude: 7.31352,
    longitude: 125.67068,
    floor_area: 1600,
    building_type: "Support",
    meters: ["DNSC-LRC-01"],
  },
  {
    name: "Science Laboratory Building",
    latitude: 7.31461,
    longitude: 125.67102,
    floor_area: 1250,
    building_type: "Office",
    meters: ["DNSC-SCI-01"],
  },
  {
    name: "Student Center",
    latitude: 7.31318,
    longitude: 125.67214,
    floor_area: 1400,
    building_type: "Support",
    meters: ["DNSC-STC-01"],
  },
  {
    name: "Maintenance and Storage",
    latitude: 7.31278,
    longitude: 125.67035,
    floor_area: 900,
    building_type: "Warehouse",
    meters: ["DNSC-MNT-01"],
  },
  {
    name: "New Academic Building",
    latitude: 7.31497,
    longitude: 125.6715,
    floor_area: 1500,
    building_type: "Office",
    meters: ["DNSC-NAB-01"],
  },
];

function key(value) {
  return String(value || "").toLowerCase().trim();
}

const SAMPLE_NAMES = new Set(SAMPLE_BUILDINGS.map((sample) => key(sample.name)));
const SAMPLE_SERIALS = new Set(
  SAMPLE_BUILDINGS.flatMap((sample) => sample.meters.map(key))
);

/** POST /buildings/ body for a sample building. */
export function sampleBuildingPayload(sample) {
  return {
    name: sample.name,
    address: SAMPLE_ADDRESS,
    latitude: sample.latitude,
    longitude: sample.longitude,
    floor_area: sample.floor_area,
    building_type: sample.building_type,
    status: "Active",
  };
}

/**
 * POST /meters/ body for a sample meter. Every sample meter is a main meter on its
 * own supply, so each one counts toward its building's total. (They used to be
 * "Main" and "Sub", but nothing treated a "Sub" as wired after the main, and the
 * demo's grades are tuned on the sum of all of them.)
 */
export function sampleMeterPayload(serial, buildingId) {
  return {
    serial_no: serial,
    building_id: Number(buildingId),
    meter_type: "Digital",
    status: "Active",
    meter_category: "Main",
    is_submeter: false,
  };
}

/**
 * What loading the samples would add, given what is already saved: the sample
 * buildings that are missing, and every missing sample meter with the name of
 * the building it goes on (which may be one that is about to be added).
 */
export function samplesToAdd(buildings = [], meters = []) {
  const savedNames = new Set(buildings.map((building) => key(building.name)));
  const savedSerials = new Set(meters.map((meter) => key(meter.serial_no)));

  return {
    buildings: SAMPLE_BUILDINGS.filter((sample) => !savedNames.has(key(sample.name))),
    meters: SAMPLE_BUILDINGS.flatMap((sample) =>
      sample.meters
        .map((serial, index) => ({ serial, index, buildingName: sample.name }))
        .filter(({ serial }) => !savedSerials.has(key(serial)))
    ),
  };
}

/**
 * The saved records that are samples. Meters go first: deleting a building also
 * deletes its meters, and the backend refuses either delete once a meter has
 * readings, so this order stops at the first meter that has history.
 */
export function samplesToRemove(buildings = [], meters = []) {
  return {
    meters: meters.filter((meter) => SAMPLE_SERIALS.has(key(meter.serial_no))),
    buildings: buildings.filter((building) => SAMPLE_NAMES.has(key(building.name))),
  };
}
