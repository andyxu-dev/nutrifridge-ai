import Link from "next/link";

import type { FamilyDataBasic, MealPlan, PlanMeal } from "./types";

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
};

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-800 ring-amber-200",
  lunch: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  dinner: "bg-sky-100 text-sky-800 ring-sky-200",
  snack: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
};

function MacroChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

export default function MealPlanSection({
  mealPlan,
  hasMeals,
  markMsg,
  marking,
  eatenTypes,
  expandedMeal,
  familyData,
  todayMembers,
  onToggleExpanded,
  onMarkAsEaten,
}: {
  mealPlan: MealPlan | null;
  hasMeals: boolean;
  markMsg: { type: "success" | "error"; text: string } | null;
  marking: string | null;
  eatenTypes: Set<string>;
  expandedMeal: string | null;
  familyData: FamilyDataBasic | null;
  todayMembers: string[];
  onToggleExpanded: (mealType: string | null) => void;
  onMarkAsEaten: (meal: PlanMeal) => void;
}) {
  return (
    <div className="space-y-4 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Recommended meals</p>
          <h2 className="text-2xl font-semibold text-gray-950">Today's best matches</h2>
        </div>
        {familyData && todayMembers.length > 0 && (
          <Link href="/family" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm ring-1 ring-black/[0.04] transition hover:bg-emerald-50">
            Household food plan
          </Link>
        )}
      </div>

      {mealPlan?.recommendation_summary && (
        <p className="max-w-2xl text-sm leading-6 text-gray-500">{mealPlan.recommendation_summary}</p>
      )}

      {markMsg && (
        <div className={`rounded-[20px] px-4 py-3 text-sm ${markMsg.type === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-red-50 text-red-700 ring-1 ring-red-100"}`}>
          {markMsg.text}
        </div>
      )}

      {hasMeals ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {mealPlan?.meals.map((meal) => {
            const eaten = eatenTypes.has(meal.meal_type);
            const busy = marking === meal.meal_type;
            const expanded = expandedMeal === meal.meal_type;
            const scoreTone = meal.score >= 70 ? "text-emerald-700 bg-emerald-50" : meal.score >= 45 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
            const progressTone = meal.score >= 70 ? "bg-emerald-500" : meal.score >= 45 ? "bg-amber-400" : "bg-red-400";

            return (
              <article key={meal.meal_type} className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${MEAL_TYPE_COLORS[meal.meal_type] ?? "bg-gray-100 text-gray-700 ring-gray-200"}`}>
                        {meal.meal_type}
                      </span>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600">
                        {meal.cuisine}
                      </span>
                      <span className="text-xs font-medium text-gray-400">{meal.cooking_time_minutes} min</span>
                    </div>
                    <h3 className="text-lg font-semibold leading-snug text-gray-950">{meal.name}</h3>
                  </div>
                  <div className={`shrink-0 rounded-2xl px-3 py-2 text-right ${scoreTone}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide">Score</p>
                    <p className="text-lg font-semibold">{meal.score}</p>
                  </div>
                </div>

                <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${progressTone}`} style={{ width: `${Math.min(100, Math.max(0, meal.score))}%` }} />
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2">
                  <MacroChip label="Protein" value={`${meal.estimated_macros.protein_g}g`} tone="bg-sky-50 text-sky-700" />
                  <MacroChip label="Carbs" value={`${meal.estimated_macros.carbs_g}g`} tone="bg-amber-50 text-amber-700" />
                  <MacroChip label="Fat" value={`${meal.estimated_macros.fat_g}g`} tone="bg-rose-50 text-rose-700" />
                </div>

                {meal.recommendation_reasons.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {meal.recommendation_reasons.slice(0, 2).map((reason, index) => (
                      <span key={index} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}

                {meal.ingredients.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {meal.ingredients.map((ingredient) => (
                      <span key={ingredient.inventory_item_id} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_STYLES[ingredient.expiration_risk] ?? RISK_STYLES.unknown}`}>
                        {ingredient.name} ({ingredient.quantity_used}{ingredient.unit})
                      </span>
                    ))}
                  </div>
                )}

                {meal.urgent_ingredients_used.length > 0 && (
                  <p className="mb-3 rounded-2xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
                    Uses soon: {meal.urgent_ingredients_used.join(", ")}
                  </p>
                )}

                <p className="mb-3 text-sm leading-6 text-gray-500">{meal.reason}</p>

                <button
                  type="button"
                  onClick={() => onToggleExpanded(expanded ? null : meal.meal_type)}
                  className="mb-3 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900"
                >
                  {expanded ? "Hide" : "Show"} cooking steps
                </button>

                {expanded && (
                  <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-600 marker:text-emerald-600">
                    {meal.instructions.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                )}

                <button
                  type="button"
                  onClick={() => onMarkAsEaten(meal)}
                  disabled={eaten || busy}
                  className={`w-full rounded-full py-2.5 text-sm font-semibold transition ${
                    eaten
                      ? "bg-emerald-50 text-emerald-700"
                      : busy
                        ? "bg-gray-100 text-gray-400"
                        : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                  }`}
                >
                  {eaten ? "Eaten today" : busy ? "Logging..." : "Mark as eaten"}
                </button>
              </article>
            );
          })}
        </div>
      ) : mealPlan && mealPlan.meals.length === 0 ? (
        <div className="rounded-[24px] bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
          <p className="text-lg font-semibold text-emerald-800">You are on track today.</p>
          <p className="mt-1 text-sm text-emerald-700">No additional meal recommendation is needed right now.</p>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-lg font-semibold text-gray-950">No meal plan yet</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Add a profile and a few ingredients so NutriFridge can build a useful meal plan from what you have.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/profile" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
              Create profile
            </Link>
            <Link href="/inventory" className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
              Add inventory
            </Link>
          </div>
        </div>
      )}

      {mealPlan && hasMeals && (
        <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Plan total</p>
              <h3 className="text-base font-semibold text-gray-950">If you eat all recommended meals</h3>
            </div>
            <p className="text-lg font-semibold text-gray-950">{mealPlan.daily_estimated_total.calories} kcal</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MacroChip label="Protein" value={`${mealPlan.daily_estimated_total.protein_g}g`} tone="bg-sky-50 text-sky-700" />
            <MacroChip label="Carbs" value={`${mealPlan.daily_estimated_total.carbs_g}g`} tone="bg-amber-50 text-amber-700" />
            <MacroChip label="Fat" value={`${mealPlan.daily_estimated_total.fat_g}g`} tone="bg-rose-50 text-rose-700" />
          </div>
        </div>
      )}
    </div>
  );
}
