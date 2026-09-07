import Link from "next/link";

import type { NutritionLog } from "./types";

export default function DashboardHero({
  formattedDate,
  greeting,
  calorieTarget,
  log,
  onOpenQuickMeal,
}: {
  formattedDate: string;
  greeting: string;
  calorieTarget: number | undefined;
  log: NutritionLog | null;
  onOpenQuickMeal: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-900 via-emerald-700 to-lime-600 p-6 text-white shadow-xl shadow-emerald-900/10 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-emerald-100">{formattedDate}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">{greeting}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/90">
            A calm plan for today's meals, macros, and the ingredients that deserve attention first.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
          <div className="rounded-[22px] bg-white/15 p-4 ring-1 ring-white/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Daily target</p>
            <p className="mt-2 text-3xl font-semibold">{calorieTarget ? Math.round(calorieTarget) : "--"}</p>
            <p className="text-xs text-emerald-100">kcal</p>
          </div>
          <div className="rounded-[22px] bg-white/15 p-4 ring-1 ring-white/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Energy model</p>
            <p className="mt-2 text-sm font-semibold">BMR {log?.target.bmr ?? "--"}</p>
            <p className="mt-1 text-sm font-semibold">TDEE {log?.target.tdee ?? "--"}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOpenQuickMeal}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
        >
          + Log meal
        </button>
        <Link
          href="/inventory"
          className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
        >
          Add inventory
        </Link>
      </div>
    </section>
  );
}
