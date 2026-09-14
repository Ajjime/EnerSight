import React, { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Building2 } from "lucide-react";

// Same palette as the full GIS Map page so a building reads the same colour
// on the dashboard preview and on the map itself.
function getStatusColor(status) {
  if (status === "Critical") {
    return "#dc2626";
  }

  if (status === "High") {
    return "#f59e0b";
  }

  if (status === "Normal") {
    return "#059669";
  }

  return "#64748b";
}

// Lucide's Building2, inlined because a divIcon takes an HTML string.
const BUILDING_GLYPH =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';

// One icon per status, reused across renders so the Critical pulse doesn't
// restart on every 30-second refresh.
const markerIconCache = new Map();

// The same teardrop pin as the GIS Map page (.energy-pin in index.css), so the
// preview and the full map read as one system. Anchor must stay [18, 39].
function getMarkerIcon(status) {
  const key = status || "No Data";

  if (markerIconCache.has(key)) {
    return markerIconCache.get(key);
  }

  const classes = ["energy-pin", key === "Critical" ? "is-critical" : ""]
    .filter(Boolean)
    .join(" ");

  const icon = L.divIcon({
    className: "energy-marker",
    html: `
      <span class="${classes}" style="--pin-color: ${getStatusColor(key)}">
        <span class="energy-pin__pulse"></span>
        <span class="energy-pin__head"><span class="energy-pin__glyph">${BUILDING_GLYPH}</span></span>
      </span>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 39],
    tooltipAnchor: [0, -36],
  });

  markerIconCache.set(key, icon);

  return icon;
}

function FitToBuildings({ points, pointsKey }) {
  const map = useMap();

  useEffect(() => {
    // The card sizes after mount inside the grid, so Leaflet needs a nudge
    // or it renders into a zero-height box and shows grey tiles.
    map.invalidateSize();

    if (!points.length) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 17);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 18 });
    // pointsKey keeps this from re-fitting (and fighting the user's panning)
    // on every parent re-render, since `points` is a fresh array each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey]);

  return null;
}

export default function MiniEnergyMap({
  buildings = [],
  height = 315,
  onEmptyAction,
}) {
  const mapped = useMemo(
    () =>
      buildings.filter(
        (building) =>
          Number.isFinite(Number(building.latitude)) &&
          Number.isFinite(Number(building.longitude)) &&
          building.latitude !== null &&
          building.longitude !== null
      ),
    [buildings]
  );

  const points = useMemo(
    () =>
      mapped.map((building) => [
        Number(building.latitude),
        Number(building.longitude),
      ]),
    [mapped]
  );

  const pointsKey = points.map((point) => point.join(",")).join(";");

  if (!mapped.length) {
    return (
      <div
        className="grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        style={{ height }}
      >
        <div>
          <Building2 className="mx-auto text-slate-400" size={34} />

          <p className="mt-3 text-sm font-semibold text-slate-700">
            No mapped buildings yet
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Add latitude and longitude to a building to place it on the map.
          </p>

          {onEmptyAction}
        </div>
      </div>
    );
  }

  return (
    <div
      className="energy-map-shell energy-gis-map rounded-2xl border border-slate-200"
      style={{ height }}
    >
      <MapContainer
        center={points[0]}
        zoom={17}
        zoomControl={false}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <FitToBuildings points={points} pointsKey={pointsKey} />

        {/* Muted with the same filter as the GIS Map page's street view. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="energy-street-tiles"
        />

        {mapped.map((building) => (
          <Marker
            key={building.building_id}
            position={[Number(building.latitude), Number(building.longitude)]}
            icon={getMarkerIcon(building.status)}
          >
            <Tooltip
              direction="top"
              offset={[0, -4]}
              opacity={1}
              className="energy-map-tooltip"
            >
              <span className="block text-xs font-semibold">
                {building.building}
              </span>
              <span className="block text-[11px] text-white/70">
                {building.status || "No Data"}
              </span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
