import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_ADDRESS,
  SAMPLE_BUILDINGS,
  sampleMeterPayload,
  samplesToAdd,
  samplesToRemove,
} from "./sampleData";

describe("samplesToAdd", () => {
  it("adds every sample building and meter to an empty system", () => {
    const plan = samplesToAdd([], []);

    expect(plan.buildings).toHaveLength(SAMPLE_BUILDINGS.length);
    expect(plan.meters.map((meter) => meter.serial)).toEqual(
      SAMPLE_BUILDINGS.flatMap((sample) => sample.meters)
    );
  });

  it("skips what is already saved, ignoring case and spaces", () => {
    const plan = samplesToAdd(
      [{ name: " institute of computing " }],
      [{ serial_no: "dnsc-ict-01" }]
    );

    expect(plan.buildings.map((b) => b.name)).not.toContain("Institute of Computing");
    expect(plan.meters).toContainEqual({
      serial: "DNSC-ICT-02",
      index: 1,
      buildingName: "Institute of Computing",
    });
    expect(plan.meters.map((m) => m.serial)).not.toContain("DNSC-ICT-01");
  });

  it("makes every sample meter a main meter, so each counts toward its building", () => {
    expect(sampleMeterPayload("DNSC-ICT-01", "5")).toMatchObject({
      building_id: 5,
      meter_category: "Main",
      is_submeter: false,
    });
    expect(sampleMeterPayload("DNSC-ICT-02", 5)).toMatchObject({
      meter_category: "Main",
      is_submeter: false,
    });
  });
});

describe("samplesToRemove", () => {
  it("picks only sample records and leaves the user's own alone", () => {
    const plan = samplesToRemove(
      [{ name: "Student Center" }, { name: "GBC-JEMAR" }],
      [{ serial_no: "DNSC-STC-01" }, { serial_no: "MY-METER-1" }]
    );

    expect(plan.buildings).toEqual([{ name: "Student Center" }]);
    expect(plan.meters).toEqual([{ serial_no: "DNSC-STC-01" }]);
  });
});

describe("matches seed_demo_data.py", () => {
  // The backend seeds the same campus. If the two lists drift, loading samples
  // from Settings and seeding from the backend create different buildings.
  const seed = readFileSync(
    new URL("../../../enersight-backend/seed_demo_data.py", import.meta.url),
    "utf8"
  );

  it("has the same buildings, meters and floor areas", () => {
    const seeded = [
      ...seed.matchAll(
        /"name": "([^"]+)",\s*"latitude": ([\d.]+), "longitude": ([\d.]+), "floor_area": ([\d.]+),\s*"building_type": "(\w+)", "meters": \[([^\]]*)\]/g
      ),
    ].map((m) => ({
      name: m[1],
      latitude: Number(m[2]),
      longitude: Number(m[3]),
      floor_area: Number(m[4]),
      building_type: m[5],
      meters: [...m[6].matchAll(/"([^"]+)"/g)].map((s) => s[1]),
    }));

    expect(seeded).toEqual(SAMPLE_BUILDINGS);
  });

  it("uses the same address", () => {
    expect(seed).toContain(`DEMO_ADDRESS = "${SAMPLE_ADDRESS}"`);
  });
});
