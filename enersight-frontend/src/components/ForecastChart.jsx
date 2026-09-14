import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FORECAST_COLORS } from "../utils/forecast";
import { formatCompact, formatNumber } from "../utils/format";

// The actual-vs-forecast chart shared by the Dashboard card and the Analytics
// panel, so both draw the same estimates in the same colours with the same
// "leading" emphasis. Takes the model from buildForecastModel (utils/forecast.js).

function getBridgeMonth(model) {
  return model.series.filter((row) => !row.isForecast).at(-1)?.month;
}

function ForecastTooltip({ active, payload, label, model }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="min-w-[200px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
        {point.isForecast && (
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 normal-case">
            Forecast
          </span>
        )}
      </p>
      {!point.isForecast && (
        <p className="text-xs font-semibold text-slate-950">
          {point.isGap ? "No readings recorded" : `Actual: ${formatNumber(point.actual)} kWh`}
        </p>
      )}
      {model.methods
        .filter(
          (method) =>
            method.available && point[method.key] !== null && point[method.key] !== undefined
        )
        .map((method) => (
          <p
            key={method.key}
            style={{ color: FORECAST_COLORS[method.key] }}
            className="mt-1 text-xs font-medium"
          >
            {method.label}
            {method.key === model.bestKey ? " (leading)" : ""}: {formatNumber(point[method.key])} kWh
          </p>
        ))}
    </div>
  );
}

export function ForecastLegend({ model, className = "" }) {
  const bridgeMonth = getBridgeMonth(model);

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-600" />
        <span className="text-[10px] font-medium text-slate-400">Actual</span>
      </div>
      {model.methods
        .filter((method) => method.available)
        .map((method) => {
          const isBest = method.key === model.bestKey;
          return (
            <div key={method.key} className="flex items-center gap-1.5">
              <span
                className="block h-0 w-5"
                style={{
                  borderTop: `${isBest ? 2.5 : 2}px dashed ${FORECAST_COLORS[method.key]}`,
                }}
              />
              <span className="text-[10px] font-medium text-slate-400">
                {method.label}
                {isBest ? " (leading)" : ""}
              </span>
            </div>
          );
        })}
      {bridgeMonth && (
        <span className="ml-auto rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-600">
          Predicted from {bridgeMonth}
        </span>
      )}
    </div>
  );
}

export default function ForecastChart({
  model,
  className = "h-56",
  // Each chart needs its own id: two charts on one page sharing a gradient id
  // would both paint with whichever <defs> the browser found first.
  gradientId = "forecastActualBar",
  angledLabels = true,
}) {
  const bridgeMonth = getBridgeMonth(model);
  const tick = { fontSize: 10, fontWeight: 600, fill: "#94a3b8" };

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={model.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="month"
            tick={tick}
            {...(angledLabels
              ? { interval: 0, angle: -25, textAnchor: "end", height: 36 }
              : {})}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={tick}
            tickFormatter={formatCompact}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            content={<ForecastTooltip model={model} />}
            cursor={{ fill: "rgba(16,185,129,0.04)" }}
          />
          {bridgeMonth && (
            <ReferenceLine
              x={bridgeMonth}
              stroke="#cbd5e1"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
          <Bar
            dataKey="actual"
            fill={`url(#${gradientId})`}
            radius={[6, 6, 0, 0]}
            maxBarSize={28}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
          />
          {model.methods
            .filter((method) => method.available)
            .map((method) => {
              const isBest = method.key === model.bestKey;
              const color = FORECAST_COLORS[method.key];
              return (
                <Line
                  key={method.key}
                  type="monotone"
                  dataKey={method.key}
                  name={method.label}
                  stroke={color}
                  strokeWidth={isBest ? 2.5 : 1.75}
                  strokeOpacity={isBest ? 1 : 0.7}
                  strokeDasharray={isBest ? "7 4" : "3 3"}
                  dot={{ r: isBest ? 3.5 : 2.5, fill: color, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive
                  animationDuration={850}
                  animationEasing="ease-out"
                />
              );
            })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
