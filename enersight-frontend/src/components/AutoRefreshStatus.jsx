import { Loader2, RefreshCw } from "lucide-react";

function formatInterval(intervalMs) {
  const seconds = Math.max(1, Math.round(intervalMs / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.round(seconds / 60)}m`;
}

function formatLastUpdated(lastUpdated) {
  if (!lastUpdated) {
    return "--:--";
  }

  return lastUpdated.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AutoRefreshStatus({
  lastUpdated,
  isRefreshing = false,
  intervalMs = 30000,
  className = "",
}) {
  return (
    <div
      className={`inline-flex h-5 w-fit items-center gap-1 rounded-full border border-white/30 bg-white px-2 text-[9px] font-black leading-none text-emerald-800 shadow-sm ${className}`}
      title={`Auto refresh every ${formatInterval(
        intervalMs
      )}. Last updated ${formatLastUpdated(lastUpdated)}.`}
    >
      {isRefreshing ? (
        <Loader2 size={9} className="animate-spin" />
      ) : (
        <RefreshCw size={9} />
      )}

      <span>
        {formatInterval(intervalMs)} · {formatLastUpdated(lastUpdated)}
      </span>
    </div>
  );
}