type Metric = {
  label: string;
  value: number | string;
  hint?: string;
  accentClass: string;
};

export function DashboardMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="glass-panel rounded-[1.5rem] p-5">
          <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${metric.accentClass}`}>
            {metric.label}
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{metric.value}</div>
          {metric.hint ? <p className="mt-2 text-sm leading-6 text-slate-400">{metric.hint}</p> : null}
        </article>
      ))}
    </div>
  );
}
