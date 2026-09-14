import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  X,
} from "lucide-react";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

const DEFAULT_CENTER = [6.7497, 125.3572];

const selectedLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 16px;
      background: #047857;
      color: white;
      border: 4px solid white;
      box-shadow: 0 18px 35px rgba(15, 23, 42, 0.25);
      font-size: 20px;
      font-weight: 900;
    ">
      📍
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 42],
});

function formatCoordinate(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return "";
  return numericValue.toFixed(6);
}

function LocationClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });
  return null;
}

function RecenterMap({ selectedLocation }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedLocation) return;
    map.setView([selectedLocation.latitude, selectedLocation.longitude], 17);
  }, [map, selectedLocation]);

  return null;
}

const LocationPickerModal = ({
  isOpen,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
}) => {
  const initialPosition = useMemo(() => {
    if (
      initialLatitude === "" ||
      initialLatitude === null ||
      initialLatitude === undefined ||
      initialLongitude === "" ||
      initialLongitude === null ||
      initialLongitude === undefined
    ) {
      return null;
    }

    const latitude = Number(initialLatitude);
    const longitude = Number(initialLongitude);

    if (
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      (latitude !== 0 || longitude !== 0)
    ) {
      return { latitude, longitude };
    }

    return null;
  }, [initialLatitude, initialLongitude]);

  const [selectedLocation, setSelectedLocation] = useState(initialPosition);
  const [locationMessage, setLocationMessage] = useState("");
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Holds the in-flight reverse-geocode so a newer click can cancel it. Without
  // this, rapid clicks raced and whichever response landed last won, so the
  // displayed address could belong to a previously clicked point while the
  // coordinates showed the current one.
  const geocodeRef = useRef({ controller: null, timer: null });

  const fetchAddress = useCallback((lat, lng) => {
    const pending = geocodeRef.current;

    pending.controller?.abort();
    window.clearTimeout(pending.timer);

    setIsGeocoding(true);
    setAddress("");

    // Nominatim's usage policy caps callers at one request per second, and this
    // used to fire on every single map click. Debounce so dragging the pin around
    // does not get the deployment's IP blocked.
    pending.timer = window.setTimeout(async () => {
      const controller = new AbortController();
      pending.controller = controller;

      // A hung request otherwise leaves "Fetching address..." on screen forever.
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" }, signal: controller.signal }
        );
        const data = await response.json();

        if (!controller.signal.aborted) {
          setAddress(data.display_name || "Address not found");
        }
      } catch (error) {
        // An abort means a newer click superseded this one; leave its state alone.
        if (error?.name !== "AbortError") {
          setAddress("Could not fetch address");
        }
      } finally {
        window.clearTimeout(timeoutId);

        if (!controller.signal.aborted) {
          setIsGeocoding(false);
        }
      }
    }, 400);
  }, []);

  // Resets the modal each time it opens. Setting state is the whole purpose of this
  // effect, and there is nothing to derive it from, so the rule does not apply.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedLocation(initialPosition);
      setLocationMessage("");
      setAddress("");
      setIsGeocoding(false);
      if (initialPosition) {
        fetchAddress(initialPosition.latitude, initialPosition.longitude);
      }
    }
  }, [isOpen, initialPosition, fetchAddress]);

  // Drop any in-flight lookup when the modal unmounts.
  useEffect(() => {
    const pending = geocodeRef.current;

    return () => {
      pending.controller?.abort();
      window.clearTimeout(pending.timer);
    };
  }, []);

  function handleLocationSelect(location) {
    setSelectedLocation(location);
    fetchAddress(location.latitude, location.longitude);
  }

  const mapCenter = selectedLocation
    ? [selectedLocation.latitude, selectedLocation.longitude]
    : DEFAULT_CENTER;

  if (!isOpen) return null;

  function handleUseCurrentLocation() {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support current location.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setSelectedLocation(location);
        fetchAddress(location.latitude, location.longitude);
        setLocationMessage("Current location selected successfully.");
      },
      () => {
        setLocationMessage(
          "Could not get your current location. Please allow location access or select manually on the map."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleConfirmLocation() {
    if (!selectedLocation) {
      setLocationMessage("Please click a location on the map first.");
      return;
    }

    onConfirm({
      latitude: formatCoordinate(selectedLocation.latitude),
      longitude: formatCoordinate(selectedLocation.longitude),
      address,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <MapPin size={14} />
              Select Building Location
            </div>

            <h2 className="text-2xl font-bold text-slate-950">
              Click the exact location on the map
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
              The address will be captured automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-red-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_300px]">
          <div className="overflow-hidden rounded-2xl border border-emerald-100">
            <MapContainer
              center={mapCenter}
              zoom={17}
              scrollWheelZoom
              className="h-[520px] w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <LocationClickHandler onSelect={handleLocationSelect} />
              <RecenterMap selectedLocation={selectedLocation} />

              {selectedLocation && (
                <Marker
                  position={[
                    selectedLocation.latitude,
                    selectedLocation.longitude,
                  ]}
                  icon={selectedLocationIcon}
                >
                  <Tooltip permanent direction="top" offset={[0, -42]}>
                    Selected Location
                  </Tooltip>
                </Marker>
              )}
            </MapContainer>
          </div>

          <aside className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-700 text-white">
              <Crosshair size={25} />
            </div>

            <h3 className="text-lg font-semibold text-slate-950">
              Selected Location
            </h3>

            <p className="mt-1 text-sm font-normal leading-6 text-slate-500">
              Click on the map or use your current device location.
            </p>

            <div className="mt-5 space-y-3">
              {/* Address — main display */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <MapPinned size={14} className="shrink-0 text-emerald-700" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Address
                  </p>
                </div>
                <p className="mt-2 text-sm font-normal leading-5 text-slate-950">
                  {isGeocoding
                    ? "Fetching address..."
                    : address
                    ? address
                    : selectedLocation
                    ? "Address not found"
                    : "Not selected"}
                </p>
              </div>

              {/* Lat / Lng — secondary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Lat
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">
                    {selectedLocation
                      ? formatCoordinate(selectedLocation.latitude)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Lng
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">
                    {selectedLocation
                      ? formatCoordinate(selectedLocation.longitude)
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            {locationMessage && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-normal leading-6 text-amber-700">
                {locationMessage}
              </div>
            )}

            <div className="mt-auto space-y-3 pt-5">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <LocateFixed size={18} />
                Use My Current Location
              </button>

              <button
                type="button"
                onClick={handleConfirmLocation}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Navigation size={18} />
                Use This Location
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
