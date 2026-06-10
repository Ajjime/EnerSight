import { useEffect, useRef, useState } from "react";

export const DEFAULT_AUTO_REFRESH_MS = 30000;

export function useAutoRefresh(
  refreshCallback,
  { intervalMs = DEFAULT_AUTO_REFRESH_MS, enabled = true, runOnMount = true } = {}
) {
  const refreshCallbackRef = useRef(refreshCallback);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  useEffect(() => {
    refreshCallbackRef.current = refreshCallback;
  }, [refreshCallback]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let isMounted = true;

    async function runRefresh() {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        setIsAutoRefreshing(true);
        await refreshCallbackRef.current();

        if (isMounted) {
          setLastUpdated(new Date());
        }
      } finally {
        if (isMounted) {
          setIsAutoRefreshing(false);
        }
      }
    }

    if (runOnMount) {
      runRefresh();
    }

    const intervalId = window.setInterval(runRefresh, intervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, runOnMount]);

  return { lastUpdated, isAutoRefreshing };
}