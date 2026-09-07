import type { NutritionLog } from "./types";

function ProgressMetric({
  label,
  consumed,
  target,
  unit,
  pct,
  accent,
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  pct: number;
  accent: string;
}) {
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target;
  const progress = Math.min(100, Math.max(0, pct || 0));

  return (
    <div className="rounded-[22px] bg-white/85 p-4 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-950">{Math.round(consumed)}</p>
        </div>
        <p className={`mt-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isOver ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>
          {isOver ? `${Math.round(consumed - target)} over` : `${Math.round(remaining)} left`}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-red-400" : accent}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>{Math.round(target)} {unit} target</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

export default function NutritionProgressSection({ log }: { log: NutritionLog }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Daily nutrition</p>
          <h2 className="text-xl font-semibold text-gray-950">Progress at a glance</h2>
        </div>
        <p className="text-sm text-gray-500">{log.date}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ProgressMetric label="Calories" consumed={log.consumed.calories} target={log.target.calories} unit="kcal" pct={log.progress.calories_pct} accent="bg-emerald-500" />
        <ProgressMetric label="Protein" consumed={log.consumed.protein_g} target={log.target.protein_g} unit="g" pct={log.progress.protein_pct} accent="bg-sky-500" />
        <ProgressMetric label="Carbs" consumed={log.consumed.carbs_g} target={log.target.carbs_g} unit="g" pct={log.progress.carbs_pct} accent="bg-amber-400" />
        <ProgressMetric label="Fat" consumed={log.consumed.fat_g} target={log.target.fat_g} unit="g" pct={log.progress.fat_pct} accent="bg-rose-400" />
      </div>
      {log.warnings.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {log.warnings.map((warning, index) => (
            <p key={index} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
              {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
