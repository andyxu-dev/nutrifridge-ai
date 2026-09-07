import type { NutritionLog } from "./types";

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-800 ring-amber-200",
  lunch: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  dinner: "bg-sky-100 text-sky-800 ring-sky-200",
  snack: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
};

export default function LoggedMealsSection({
  log,
  onDeleteMeal,
  onOpenQuickMeal,
}: {
  log: NutritionLog;
  onDeleteMeal: (mealId: number) => void;
  onOpenQuickMeal: () => void;
}) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Logged meals</p>
          <h2 className="text-lg font-semibold text-gray-950">Meals eaten today</h2>
        </div>
        <button
          type="button"
          onClick={onOpenQuickMeal}
          className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          + Log meal
        </button>
      </div>

      {log.meals.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">Nothing logged yet. Mark a recommended meal as eaten or add one manually.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {log.meals.map((meal) => (
            <div key={meal.id} className="flex items-start justify-between gap-3 rounded-[20px] bg-gray-50 p-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${MEAL_TYPE_COLORS[meal.meal_type] ?? "bg-gray-100 text-gray-600"}`}>
                    {meal.meal_type}
                  </span>
                  {meal.source === "manual" && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">Manual</span>
                  )}
                </div>
                <p className="truncate text-sm font-semibold text-gray-950">{meal.meal_name}</p>
                <p className="mt-1 text-xs text-gray-500">{Math.round(meal.calories)} kcal - {meal.protein_g}g protein</p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteMeal(meal.id)}
                className="rounded-full px-2 py-1 text-lg leading-none text-gray-300 transition hover:bg-white hover:text-red-500"
                title="Remove meal"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
