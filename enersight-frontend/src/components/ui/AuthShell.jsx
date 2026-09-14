import React from "react";
import {
  BarChart3,
  Building2,
  Leaf,
  MapPinned,
  ScanLine,
  ShieldCheck,
  Zap,
} from "lucide-react";
import logo from "../../assets/logo/EnerSight Logo.png";

const SYSTEM_NAME = "EnerSight";
const SYSTEM_TAGLINE = "See energy clearly, manage buildings wisely.";

const featureBadges = [
  {
    label: "GIS Mapping",
    icon: MapPinned,
  },
  {
    label: "OCR Reading",
    icon: ScanLine,
  },
  {
    label: "Energy Reports",
    icon: BarChart3,
  },
];

const quickBadges = [
  {
    label: "Smart Monitoring",
    icon: Zap,
  },
  {
    label: "Building Insights",
    icon: Building2,
  },
  {
    label: "Secure Access",
    icon: ShieldCheck,
  },
];

const AuthShell = ({ title, subtitle, children }) => {
  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-50 to-lime-50 px-4 py-4 text-slate-900 md:px-6 md:py-5">
      <main className="mx-auto flex h-full max-w-6xl items-center justify-center">
        <div className="grid w-full h-full max-h-[calc(100vh-2.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[0.85fr_1.15fr]">
          <section className="relative hidden overflow-hidden bg-slate-950 p-8 text-white lg:block">
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-emerald-500/20" />
            <div className="pointer-events-none absolute -right-48 -top-48 h-[38rem] w-[38rem] rounded-full border border-emerald-500/10" />
            <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-16 right-16 h-32 w-32 rounded-full bg-lime-300/10 blur-2xl" />

            <div className="relative z-10 flex h-full flex-col justify-between gap-8">
              <div>
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white shadow-xl">
                    <img
                      src={logo}
                      alt={SYSTEM_NAME}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-3xl font-bold leading-none">
                      {SYSTEM_NAME}
                    </h1>
                    <p className="mt-2 max-w-[300px] text-[11px] font-semibold uppercase leading-5 tracking-[0.18em] text-lime-300">
                      {SYSTEM_TAGLINE}
                    </p>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-lime-300">
                    <Leaf size={15} />
                    Smart Energy Command Center
                  </div>

                  <h2 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight">
                    Monitor energy with clarity.
                  </h2>

                  <p className="mt-4 max-w-md text-sm font-normal leading-6 text-slate-300">
                    A modern GIS and OCR-assisted platform for building energy
                    monitoring, reports, and role-based access.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {featureBadges.map((feature) => {
                    const Icon = feature.icon;

                    return (
                      <div
                        key={feature.label}
                        className="flex min-h-[68px] flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5"
                      >
                        <div className="mb-1.5 grid h-8 w-8 place-items-center rounded-xl bg-emerald-700 text-lime-300">
                          <Icon size={16} />
                        </div>

                        <p className="text-xs font-medium leading-4 text-white">
                          {feature.label}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {quickBadges.map((badge) => {
                    const Icon = badge.icon;

                    return (
                      <div
                        key={badge.label}
                        className="flex min-h-[68px] flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5"
                      >
                        <div className="mb-1.5 grid h-8 w-8 place-items-center rounded-xl bg-emerald-700 text-white">
                          <Icon size={18} />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium leading-4 text-white">
                            {badge.label}
                          </p>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-lime-300" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="relative flex items-center overflow-y-auto p-5 md:p-6">
            <div className="pointer-events-none absolute right-8 top-8 hidden h-24 w-24 rounded-full bg-emerald-100/60 blur-2xl md:block" />

            <div className="relative z-10 mx-auto w-full max-w-sm">
              <div className="mb-3">
                <div className="mb-3 flex items-center gap-3 lg:hidden">
                  <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-md">
                    <img
                      src={logo}
                      alt={SYSTEM_NAME}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div>
                    <h1 className="text-lg font-semibold leading-none text-slate-950">
                      {SYSTEM_NAME}
                    </h1>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Smart Energy
                    </p>
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Account Access
                </p>

                <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                  {title}
                </h2>

                {subtitle && (
                  <p className="mt-1.5 text-sm font-normal leading-5 text-slate-500">
                    {subtitle}
                  </p>
                )}
              </div>

              {children}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AuthShell;