"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  checkBackendHealth,
  fetchNutritionLog,
  fetchMealPlan,
  fetchUrgentItems,
  fetchGroceryList,
  fetchWasteLog,
  logMeal,
  deleteMealLog,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────

type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

type NutritionLog = {
  date: string;
  target: Macros & { bmr: number; tdee: number };
  consumed: Macros;
  remaining: Macros;
  progress: { calories_pct: number; protein_pct: number; carbs_pct: number; fat_pct: number };
  meals: LoggedMeal[];
  warnings: string[];
};

type LoggedMeal = {
  id: number;
  meal_type: string;
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_used: unknown[];
  created_at: string | null;
};

type PlanIngredient = {
  inventory_item_id: number;
  name: string;
  quantity_used: number;
  unit: string;
  reason: string;
  expiration_risk: string;
};

type PlanMeal = {
  meal_type: string;
  name: string;
  cuisine: string;
  cooking_time_minutes: number;
  ingredients: PlanIngredient[];
  estimated_macros: Macros;
  reason: string;
  macro_gap_helped: string[];
  urgent_ingredients_used: string[];
  score: number;
  score_breakdown: Record<string, number>;
  instructions: string[];
  tags: string[];
};

type MealPlan = {
  date: string;
  target: Macros & { bmr: number; tdee: number };
  consumed: Macros;
  remaining: Macros;
  meals: PlanMeal[];
  daily_estimated_total: Macros;
  recommendation_summary: string;
};

type UrgentItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  zone: string;
  best_before_date: string | null;
  expiration_risk: string;
};

type GroceryItem = {
  name: string;
  category: string;
  reason: string;
  priority: string;
};

type GroceryList = {
  recommended_to_buy: GroceryItem[];
  avoid_buying: { name: string; reason: string }[];
  nutrition_gap_summary: { protein_gap_today_g: number; calorie_gap_today: number; protein_low_in_inventory: boolean; analysis: string };
  inventory_summary: { total_items: number; urgent_count: number; medium_risk_count: number; low_stock_count: number; categories_present: string[] };
};

type WasteEntry = {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  item_category: string | null;
  reason: string;
  estimated_calories_wasted: number | null;
  discarded_at: string;
};

// ── Style helpers ─────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border border-red-200",
  high:    "bg-orange-100 text-orange-700 border border-orange-200",
  medium:  "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:     "bg-green-100 text-green-700 border border-green-200",
  unknown: "bg-gray-100 text-gray-600 border border-gray-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-50 text-red-700 border border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  low:    "bg-gray-50 text-gray-600 border border-gray-200",
};

const BAR_COLORS: Record<string, string> = {
  calories: "bg-green-500",
  protein:  "bg-blue-500",
  carbs:    "bg-yellow-400",
  fat:      "bg-red-400",
};

const CUISINE_EMOJI: Record<string, string> = {
  chinese: "🥢",
  western: "🍴",
  any:     "🍽",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[risk] ?? RISK_STYLES.unknown}`}>
      {risk}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 45 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-500">{score}</span>
    </div>
  );
}

function ProgressCard({
  label, consumed, target, unit, pct, color,
}: {
  label: string; consumed: number; target: number; unit: string; pct: number; color: string;
}) {
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className={`text-xs font-medium ${isOver ? "text-red-500" : "text-gray-400"}`}>
          {isOver ? `+${Math.round(consumed - target)} over` : `${Math.round(remaining)} ${unit} left`}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-gray-900">{Math.round(consumed)}</span>
        <span className="text-sm text-gray-400">/ {target} {unit}</span>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${isOver ? "bg-red-400" : color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="text-right text-xs text-gray-400 mt-1">{pct}%</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [log, setLog] = useState<NutritionLog | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [urgentItems, setUrgentItems] = useState<UrgentItem[]>([]);
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [wasteLog, setWasteLog] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [eatenTypes, setEatenTypes] = useState<Set<string>>(new Set());
  const [markMsg, setMarkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const [logData, planData, urgentData, groceryData, wasteData] = await Promise.all([
      fetchNutritionLog(),
      fetchMealPlan(),
      fetchUrgentItems(),
      fetchGroceryList(),
      fetchWasteLog(),
    ]);
    setLog(logData);
    setMealPlan(planData);
    setUrgentItems(urgentData ?? []);
    setGroceryList(groceryData);
    setWasteLog((wasteData ?? []).slice(0, 5));
    if (logData?.meals) {
      setEatenTypes(new Set(logData.meals.map((m: LoggedMeal) => m.meal_type)));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const online = await checkBackendHealth();
      setBackendOnline(online);
      if (online) await refreshAll();
      setLoading(false);
    };
    init();
  }, [refreshAll]);

  const handleMarkAsEaten = async (meal: PlanMeal) => {
    setMarking(meal.meal_type);
    setMarkMsg(null);
    try {
      await logMeal({
        meal_type: meal.meal_type,
        meal_name: meal.name,
        calories:  meal.estimated_macros.calories,
        protein_g: meal.estimated_macros.protein_g,
        carbs_g:   meal.estimated_macros.carbs_g,
        fat_g:     meal.estimated_macros.fat_g,
        ingredients_used: meal.ingredients.map((ing) => ({
          inventory_item_id: ing.inventory_item_id,
          name:          ing.name,
          quantity_used: ing.quantity_used,
          unit:          ing.unit,
        })),
      });
      setMarkMsg({ type: "success", text: `${meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)} marked as eaten!` });
      await refreshAll();
    } catch (err) {
      setMarkMsg({ type: "error", text: `Failed: ${String(err)}` });
    } finally {
      setMarking(null);
    }
  };

  const handleDeleteMeal = async (mealId: number) => {
    try {
      await deleteMealLog(mealId);
      await refreshAll();
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Backend offline */}
      {backendOnline === false && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-500 text-lg mt-0.5">&#9888;</span>
          <div>
            <p className="font-semibold text-red-700">Backend is not reachable</p>
            <p className="text-sm text-red-600 mt-0.5">
              Start the FastAPI server at <code className="bg-red-100 px-1 rounded">http://localhost:8000</code>
            </p>
            <p className="text-xs text-red-400 font-mono mt-1">
              cd backend &amp;&amp; source venv/bin/activate &amp;&amp; uvicorn app.main:app --reload
            </p>
          </div>
        </div>
      )}

      {backendOnline && !log && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-yellow-800">
          No profile found.{" "}
          <Link href="/profile" className="underline font-medium">Create your profile</Link> to get started.
        </div>
      )}

      {/* ── 1. Daily Nutrition Progress ──────────────────────────────── */}
      {log && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Daily Nutrition Progress</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ProgressCard label="Calories" consumed={log.consumed.calories} target={log.target.calories} unit="kcal" pct={log.progress.calories_pct} color={BAR_COLORS.calories} />
            <ProgressCard label="Protein"  consumed={log.consumed.protein_g} target={log.target.protein_g} unit="g" pct={log.progress.protein_pct} color={BAR_COLORS.protein} />
            <ProgressCard label="Carbs"    consumed={log.consumed.carbs_g}   target={log.target.carbs_g}   unit="g" pct={log.progress.carbs_pct}   color={BAR_COLORS.carbs} />
            <ProgressCard label="Fat"      consumed={log.consumed.fat_g}     target={log.target.fat_g}     unit="g" pct={log.progress.fat_pct}     color={BAR_COLORS.fat} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            BMR: {log.target.bmr} kcal &nbsp;|&nbsp; TDEE: {log.target.tdee} kcal
          </p>
          {log.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {log.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">{w}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 2. Meals Eaten Today ─────────────────────────────────────── */}
      {log && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Meals Eaten Today
            <span className="text-sm font-normal text-gray-400 ml-2">({log.meals.length} logged)</span>
          </h2>
          {log.meals.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing logged yet — mark a recommended meal as eaten below.</p>
          ) : (
            <div className="space-y-2">
              {log.meals.map((m) => (
                <div key={m.id} className="bg-white rounded-xl border border-green-100 shadow-sm px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-green-600 w-16 shrink-0">{m.meal_type}</span>
                    <span className="font-medium text-gray-900 truncate">{m.meal_name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-gray-400 hidden sm:block">
                      {Math.round(m.calories)} kcal &middot; {m.protein_g}g P &middot; {m.carbs_g}g C &middot; {m.fat_g}g F
                    </span>
                    <button
                      onClick={() => handleDeleteMeal(m.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 3. Recommended Meal Plan ─────────────────────────────────── */}
      {backendOnline && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Today&apos;s Recommended Meal Plan</h2>

          {mealPlan?.recommendation_summary && (
            <p className="text-sm text-gray-500 mb-4 italic">{mealPlan.recommendation_summary}</p>
          )}

          {markMsg && (
            <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              markMsg.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {markMsg.text}
            </div>
          )}

          {mealPlan && mealPlan.meals.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mealPlan.meals.map((meal) => {
                  const eaten = eatenTypes.has(meal.meal_type);
                  const busy = marking === meal.meal_type;
                  const expanded = expandedMeal === meal.meal_type;
                  return (
                    <div
                      key={meal.meal_type}
                      className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${eaten ? "border-green-200 opacity-75" : "border-gray-100"}`}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-green-600">{meal.meal_type}</span>
                          <span className="text-xs text-gray-400">{CUISINE_EMOJI[meal.cuisine] ?? "🍽"} {meal.cuisine}</span>
                          <span className="text-xs text-gray-400">· {meal.cooking_time_minutes}min</span>
                        </div>
                        <span className="text-xs text-gray-400">{meal.estimated_macros.calories} kcal</span>
                      </div>

                      <h3 className="font-semibold text-gray-900 mb-2">{meal.name}</h3>

                      {/* Score bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">Match score</span>
                        </div>
                        <ScoreBar score={meal.score} />
                      </div>

                      {/* Ingredient chips */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {meal.ingredients.map((ing) => (
                          <span key={ing.inventory_item_id} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                            {ing.name} ({ing.quantity_used}{ing.unit})
                            <RiskBadge risk={ing.expiration_risk} />
                          </span>
                        ))}
                      </div>

                      {/* Macro mini-row */}
                      <div className="grid grid-cols-3 gap-2 text-xs text-center mb-3">
                        <div className="bg-blue-50 rounded-lg p-1.5">
                          <div className="font-bold text-blue-700">{meal.estimated_macros.protein_g}g</div>
                          <div className="text-blue-400">Protein</div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-1.5">
                          <div className="font-bold text-yellow-700">{meal.estimated_macros.carbs_g}g</div>
                          <div className="text-yellow-400">Carbs</div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-1.5">
                          <div className="font-bold text-red-600">{meal.estimated_macros.fat_g}g</div>
                          <div className="text-red-400">Fat</div>
                        </div>
                      </div>

                      {/* Tags */}
                      {meal.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {meal.tags.map((tag) => (
                            <span key={tag} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                              {tag.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}

                      {meal.urgent_ingredients_used.length > 0 && (
                        <p className="text-xs text-orange-500 mb-2">
                          ⚠ Uses expiring: {meal.urgent_ingredients_used.join(", ")}
                        </p>
                      )}

                      <p className="text-xs text-gray-400 italic mb-3">{meal.reason}</p>

                      {/* Instructions toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedMeal(expanded ? null : meal.meal_type)}
                        className="text-xs text-green-600 hover:text-green-800 font-medium mb-3 flex items-center gap-1"
                      >
                        {expanded ? "▲ Hide instructions" : "▼ Show cooking instructions"}
                      </button>

                      {expanded && (
                        <ol className="space-y-1.5 mb-3 pl-4 list-decimal">
                          {meal.instructions.map((step, i) => (
                            <li key={i} className="text-xs text-gray-600 leading-relaxed">{step}</li>
                          ))}
                        </ol>
                      )}

                      {/* Mark as eaten button */}
                      <button
                        onClick={() => handleMarkAsEaten(meal)}
                        disabled={eaten || busy}
                        className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                          eaten
                            ? "bg-green-100 text-green-600 cursor-default"
                            : busy
                            ? "bg-gray-100 text-gray-400 cursor-wait"
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}
                      >
                        {eaten ? "✓ Eaten" : busy ? "Logging…" : "Mark as Eaten"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Plan totals */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">If you eat all recommended meals</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((key) => (
                    <div key={key} className="text-center">
                      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                        {key === "calories" ? "Calories" : key.replace("_g", "")}
                      </div>
                      <div className="font-bold text-gray-900">
                        {mealPlan.daily_estimated_total[key]}{key !== "calories" ? "g" : " kcal"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : mealPlan && mealPlan.meals.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-green-700">
              You have reached your nutrition target for today — no more meals recommended!
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-gray-500">
              No meal plan yet.{" "}
              <Link href="/profile" className="underline text-green-600">Create a profile</Link> and{" "}
              <Link href="/inventory" className="underline text-green-600">add inventory items</Link> to generate one.
            </div>
          )}
        </section>
      )}

      {/* ── 4. Urgent Ingredients ─────────────────────────────────────── */}
      {backendOnline && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Urgent Ingredients
            <span className="text-sm font-normal text-gray-400 ml-2">({urgentItems.length} need attention)</span>
          </h2>
          {urgentItems.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-green-700">
              All ingredients are fresh!{" "}
              <Link href="/inventory" className="underline font-medium">View inventory</Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-left">Zone</th>
                    <th className="px-4 py-3 text-left">Qty</th>
                    <th className="px-4 py-3 text-left">Best Before</th>
                    <th className="px-4 py-3 text-left">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {urgentItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{item.zone}</td>
                      <td className="px-4 py-3 text-gray-500">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-3 text-gray-500">{item.best_before_date ?? "—"}</td>
                      <td className="px-4 py-3"><RiskBadge risk={item.expiration_risk} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── 5. Weekly Grocery Suggestions ───────────────────────────────── */}
      {backendOnline && groceryList && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-700">Weekly Grocery Suggestions</h2>
            <Link href="/grocery-list" className="text-xs text-green-600 hover:text-green-800 font-medium">
              Full list →
            </Link>
          </div>

          {/* Nutrition gap pill */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <span className="font-semibold">Nutrition insight: </span>
            {groceryList.nutrition_gap_summary.analysis}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recommended to buy */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="text-green-500">✓</span> Buy This Week
                <span className="text-xs font-normal text-gray-400">({groceryList.recommended_to_buy.length} items)</span>
              </h3>
              {groceryList.recommended_to_buy.length === 0 ? (
                <p className="text-sm text-gray-400">Your pantry looks well stocked!</p>
              ) : (
                <ul className="space-y-2">
                  {groceryList.recommended_to_buy.slice(0, 6).map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                        {item.priority}
                      </span>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <p className="text-xs text-gray-400 leading-snug">{item.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Avoid buying */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="text-orange-500">⚠</span> Use Before Buying More
                <span className="text-xs font-normal text-gray-400">({groceryList.avoid_buying.length} items)</span>
              </h3>
              {groceryList.avoid_buying.length === 0 ? (
                <p className="text-sm text-gray-400">No items to flag.</p>
              ) : (
                <ul className="space-y-2">
                  {groceryList.avoid_buying.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <p className="text-xs text-gray-400 leading-snug">{item.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 6. Waste Awareness ───────────────────────────────────────────── */}
      {backendOnline && wasteLog.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Recent Food Waste
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({wasteLog.reduce((s, e) => s + (e.estimated_calories_wasted ?? 0), 0).toFixed(0)} kcal discarded recently)
            </span>
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Qty</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-right">Cal wasted</th>
                  <th className="px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {wasteLog.map((entry) => (
                  <tr key={entry.id} className="hover:bg-orange-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.item_name}</td>
                    <td className="px-4 py-3 text-gray-500">{entry.quantity} {entry.unit}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{entry.reason.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-right text-red-500 font-medium">
                      {entry.estimated_calories_wasted != null ? `${entry.estimated_calories_wasted.toFixed(0)} kcal` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{entry.discarded_at.split("T")[0] || entry.discarded_at.split(" ")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Tip: Plan meals around expiring ingredients to reduce waste.{" "}
            <Link href="/inventory" className="underline text-green-600">Manage inventory</Link>
          </p>
        </section>
      )}
    </div>
  );
}
