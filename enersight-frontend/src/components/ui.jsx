import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

export const statusClass = (status = '') => {
  const key = status.toLowerCase();
  if (key.includes('critical')) return 'bg-red-50 text-red-700 border-red-200';
  if (key.includes('high') || key.includes('alert') || key.includes('review')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (key.includes('normal') || key.includes('medium')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key.includes('low') || key.includes('verified') || key.includes('active') || key.includes('ready')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>{status}</span>
);

export const PageHeader = ({ eyebrow, title, subtitle, children }) => (
  <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
    <div>
      {eyebrow && <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-700">{eyebrow}</p>}
      <h2 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{title}</h2>
      {subtitle && <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
  </div>
);

export const StatCard = ({ title, value, unit, icon: Icon, trend, tone = 'emerald' }) => {
  const tones = {
    emerald: { grad: 'from-emerald-600 to-teal-500', pill: 'bg-emerald-50 text-emerald-700' },
    blue: { grad: 'from-blue-600 to-cyan-500', pill: 'bg-blue-50 text-blue-700' },
    amber: { grad: 'from-amber-500 to-lime-500', pill: 'bg-amber-50 text-amber-700' },
    rose: { grad: 'from-rose-600 to-red-500', pill: 'bg-rose-50 text-rose-700' },
    slate: { grad: 'from-slate-800 to-slate-600', pill: 'bg-slate-100 text-slate-700' },
  };
  const selected = tones[tone] || tones.emerald;
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/50 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-100/50 blur-2xl" />
      <div className="mb-5 flex items-start justify-between">
        <div className={`rounded-2xl bg-gradient-to-br ${selected.grad} p-3 text-white shadow-lg`}>
          {Icon && <Icon size={22} />}
        </div>
        {trend && <span className={`rounded-full px-2.5 py-1 text-xs font-black ${selected.pill}`}>{trend}</span>}
      </div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <h3 className="text-3xl font-black text-slate-950">{value}</h3>
        {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
      </div>
    </div>
  );
};

export const ChartCard = ({ title, subtitle, children, actions }) => (
  <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/60">
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-black text-slate-950">{title}</h3>
        {subtitle && <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

export const FilterBar = ({ children }) => (
  <div className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex md:items-center">
    {children}
  </div>
);

export const Select = ({ children, className = '', ...props }) => <select {...props} className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600 outline-none transition focus:border-emerald-500 focus:bg-white ${className}`}>{children}</select>;
export const Input = (props) => <input {...props} className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600 outline-none transition focus:border-emerald-500 focus:bg-white ${props.className || ''}`} />;
export const PrimaryButton = ({ children, className = '', ...props }) => <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 ${className}`}>{children}</button>;
export const SecondaryButton = ({ children, className = '', ...props }) => <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 ${className}`}>{children}</button>;

export const DataTable = ({ columns, rows, renderRow }) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          <tr>{columns.map(c => <th key={c} className="px-5 py-4">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{rows.map(renderRow)}</tbody>
      </table>
    </div>
  </div>
);

export const AlertCard = ({ title, children, type = 'warning' }) => {
  const Icon = type === 'success' ? CheckCircle2 : type === 'info' ? Info : AlertTriangle;
  const cls = type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : type === 'info' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800';
  return <div className={`rounded-3xl border p-5 ${cls}`}><div className="mb-2 flex items-center gap-2 font-black"><Icon size={18}/>{title}</div><p className="text-sm font-medium leading-6 opacity-80">{children}</p></div>;
};

export const ReportCard = ({ title, subtitle, meta, icon: Icon, children }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-200/70">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">{Icon && <Icon size={22}/>}</div>
      <StatusBadge status={meta || 'Ready'} />
    </div>
    <h3 className="text-lg font-black text-slate-950">{title}</h3>
    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{subtitle}</p>
    {children}
  </div>
);

export const EmptyState = ({ title = 'No records found', subtitle = 'Try adjusting filters or adding a new record.' }) => <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-black text-slate-800">{title}</p><p className="mt-2 text-sm text-slate-500">{subtitle}</p></div>;
export const LoadingState = () => <div className="flex items-center gap-2 rounded-3xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={16}/> Loading energy data...</div>;

export const DangerButton = ({ children, className = '', ...props }) => <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/15 transition hover:-translate-y-0.5 hover:bg-rose-700 ${className}`}>{children}</button>;

export const Modal = ({ open, title, subtitle, children, footer, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-slate-950">{title}</h3>
            {subtitle && <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-200">Close</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">{footer}</div>}
      </div>
    </div>
  );
};
