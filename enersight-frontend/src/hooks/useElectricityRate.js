import { useCallback, useEffect, useState } from "react";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { DEFAULT_RATE_PER_KWH } from "../utils/currency";

/**
 * The configured electricity rate, with an honest failure signal.
 *
 * This replaces four byte-identical copies of the same effect in Dashboard,
 * Analytics, Reports and BuildingsList. Every copy swallowed failure with a bare
 * return or a console.error, so when the rate could not be loaded the whole app
 * quietly priced everything at the ₱12 fallback with nothing on screen to say so.
 * Analytics even printed "At ₱12.00 / kWh" as though that were the configured
 * value.
 *
 * `isFallback` is true whenever the displayed rate is the built-in default rather
 * than a value the backend confirmed. Show it.
 */
export function useElectricityRate() {
  const [rate, setRate] = useState(DEFAULT_RATE_PER_KWH);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(true);
  const [error, setError] = useState("");

  // showLoading is skipped on the initial call: isLoading already starts true, and
  // setting state synchronously inside an effect body triggers a cascading render.
  const loadRate = useCallback(async (signal, showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const response = await apiFetch(`${API_BASE_URL}/settings/rate`);

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (signal?.cancelled) {
        return;
      }

      if (!response.ok) {
        setError(
          `Could not load the electricity rate (${response.status}). ` +
            `Showing the default of ₱${DEFAULT_RATE_PER_KWH.toFixed(2)}/kWh.`
        );
        setIsFallback(true);
        return;
      }

      const value = Number(data?.rate_per_kwh);

      if (!Number.isFinite(value)) {
        setError(
          `The server returned an unreadable electricity rate. ` +
            `Showing the default of ₱${DEFAULT_RATE_PER_KWH.toFixed(2)}/kWh.`
        );
        setIsFallback(true);
        return;
      }

      setRate(value);
      setIsFallback(false);
      setError("");
    } catch (caught) {
      if (signal?.cancelled) {
        return;
      }

      console.error("Fetch rate error:", caught);
      setError(
        `Could not reach the server for the electricity rate. ` +
          `Showing the default of ₱${DEFAULT_RATE_PER_KWH.toFixed(2)}/kWh.`
      );
      setIsFallback(true);
    } finally {
      if (!signal?.cancelled) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };

    // False positive: every setState inside loadRate runs after the first await,
    // and showLoading=false skips the one call that would have been synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRate(signal, false);

    return () => {
      signal.cancelled = true;
    };
  }, [loadRate]);

  return { rate, isLoading, isFallback, error, reloadRate: loadRate };
}
