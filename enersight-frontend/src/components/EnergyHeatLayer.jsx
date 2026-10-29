import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

import {
  EUI_CRITICAL_THRESHOLD,
  EUI_HIGH_THRESHOLD,
} from "../utils/energyStatus";

// The gradient stops are the grading thresholds, not the extremes of whatever
// happens to be on screen. Anchoring to the data would re-scale the colours
// every time the filter changes and paint the least-bad building red on a
// campus where nothing is actually in trouble.
const HEAT_GRADIENT = {
  0.0: "#059669",
  [EUI_HIGH_THRESHOLD / EUI_CRITICAL_THRESHOLD]: "#f59e0b",
  1.0: "#ef4444",
};

// Buildings graded Normal still need to register, or the layer would look like
// they have no readings at all.
const MIN_WEIGHT = 0.08;

/**
 * Energy-intensity heat layer over the building markers, weighted by EUI.
 *
 * Renders nothing itself: leaflet.heat draws onto its own canvas pane, and this
 * component only keeps that layer in step with the buildings passed in. The
 * markers stay on top, so a reader can still tell which building a hot spot is
 * and the colour is never the only channel.
 */
export default function EnergyHeatLayer({ buildings, radius = 42, blur = 28 }) {
  const map = useMap();

  useEffect(() => {
    // leaflet.heat patches the Leaflet namespace on import; if that ever fails,
    // the map should still draw its markers rather than crash.
    if (!map || typeof L.heatLayer !== "function") {
      return undefined;
    }

    const points = buildings
      .filter((building) => {
        const lat = Number(building.latitude);
        const lng = Number(building.longitude);

        return (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          building.energy_status !== "No Data"
        );
      })
      .map((building) => [
        Number(building.latitude),
        Number(building.longitude),
        Math.min(
          1,
          Math.max(MIN_WEIGHT, Number(building.eui || 0) / EUI_CRITICAL_THRESHOLD)
        ),
      ]);

    if (points.length === 0) {
      return undefined;
    }

    const layer = L.heatLayer(points, {
      radius,
      blur,
      max: 1,
      minOpacity: 0.25,
      gradient: HEAT_GRADIENT,
    });

    layer.addTo(map);

    return () => {
      layer.remove();
    };
  }, [map, buildings, radius, blur]);

  return null;
}
