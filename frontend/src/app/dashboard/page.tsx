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
  logManualMeal,
  fetchNutritionAnalysis,
  fetchFamily,
  fetchFamilyMealPlan,
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
  source?: string;
  notes?: string;
  created_at: string | null;
};

type NutritionAnalysis = {
  date: string;
  consumed: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  target: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  remaining: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  macro_status: { calories: string; protein: string; carbs: string; fat: string };
  health_notes: string[];
  summary: string;
  next_meal_recommendation: string;
  adjustment_reasons: string[];
  disclaimer: string;
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
  nutrition_gap_summary: {
    protein_gap_today_g: number;
    calorie_gap_today: number;
    protein_low_in_inventory: boolean;
    analysis: string;
  };
  inventory_summary: {
    total_items: number;
    urgent_count: number;
    medium_risk_count: number;
    low_stock_count: number;
    categories_present: string[];
  };
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

type FamilyMemberBasic = {
  id?: number;
  member_key: string;
  name: string;
  goal?: string;
  diet_style?: string;
};

type FamilyDataBasic = {
  primary_member: FamilyMemberBasic;
  additional_members: FamilyMemberBasic[];
};

type FamilyMeal = {
  name: string;
  meal_type: string;
  estimated_macros: Macros;
  per_member_allocations?: {
    member_name: string;
    portion_guidance: string;
    estimated_macros: Macros;
  }[];
};

type FamilyPlanData = {
  meals: FamilyMeal[];
  recommendation_summary: string;
  conflict_notes: string[];
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
  high:   "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:    "bg-gray-100 text-gray-600 border border-gray-200",
};

const CUISINE_EMOJI: Record<string, string> = {
  chinese: "🥢",
  western: "🍴",
  any:     "🍽",
};

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700",
  lunch:     "bg-green-100 text-green-700",
  dinner:    "bg-blue-100 text-blue-700",
  snack:     "bg-purple-100 text-purple-700",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[risk] ?? RISK_STYLES.unknown}`}>
      {risk}
    </span>
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <span className={`text-xs font-semibold ${isOver ? "text-red-500" : "text-gray-400"}`}>
          {isOver ? `+${Math.round(consumed - target)} over` : `${Math.round(remaining)} ${unit} left`}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold text-gray-900">{Math.round(consumed)}</span>
        <span className="text-sm text-gray-400">/ {target} {unit}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-red-400" : color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className={`text-right text-xs mt-1.5 font-medium ${isOver ? "text-red-500" : "text-gray-300"}`}>
        {pct}%
      </div>
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
  const [analysis, setAnalysis] = useState<NutritionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [eatenTypes, setEatenTypes] = useState<Set<string>>(new Set());
  const [markMsg, setMarkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [quickForm, setQuickForm] = useState({
    meal_type: "snack", meal_name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", notes: "",
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickMsg, setQuickMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Family state
  const [familyData, setFamilyData] = useState<FamilyDataBasic | null>(null);
  const [familySelections, setFamilySelections] = useState<string[]>([]);
  const [planMode, setPlanMode] = useState<"personal" | "family">("personal");
  const [familyPlan, setFamilyPlan] = useState<FamilyPlanData | null>(null);
  const [familyPlanLoading, setFamilyPlanLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    const [logData, planData, urgentData, groceryData, wasteData, analysisData] = await Promise.all([
      fetchNutritionLog(),
      fetchMealPlan(),
      fetchUrgentItems(),
      fetchGroceryList(),
      fetchWasteLog(),
      fetchNutritionAnalysis(),
    ]);
    setLog(logData);
    setMealPlan(planData);
    setUrgentItems(urgentData ?? []);
    setGroceryList(groceryData);
    setWasteLog((wasteData ?? []).slice(0, 5));
    setAnalysis(analysisData);
    if (logData?.meals) {
      setEatenTypes(new Set(logData.meals.map((m: LoggedMeal) => m.meal_type)));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const online = await checkBackendHealth();
      setBackendOnline(online);
      if (online) {
        await refreshAll();
        const fd = await fetchFamily();
        if (fd) setFamilyData(fd as FamilyDataBasic);
      }
      setLoading(false);
    };
    // Restore family selections from localStorage
    const stored = localStorage.getItem("familySelections");
    if (stored) {
      try { setFamilySelections(JSON.parse(stored)); } catch { /* ignore */ }
    }
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
      setMarkMsg({
        type: "success",
        text: `${meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)} marked as eaten!`,
      });
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

  const handleQuickMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickSaving(true);
    setQuickMsg(null);
    try {
      await logManualMeal({
        meal_type: quickForm.meal_type,
        meal_name: quickForm.meal_name,
        calories:  parseFloat(quickForm.calories) || 0,
        protein_g: parseFloat(quickForm.protein_g) || 0,
        carbs_g:   parseFloat(quickForm.carbs_g) || 0,
        fat_g:     parseFloat(quickForm.fat_g) || 0,
        notes:     quickForm.notes || null,
      });
      setQuickMsg({ type: "success", text: "Meal logged!" });
      setQuickForm({ meal_type: "snack", meal_name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", notes: "" });
      await refreshAll();
    } catch (err) {
      setQuickMsg({ type: "error", text: String(err) });
    } finally {
      setQuickSaving(false);
    }
  };

  const toggleFamilySelection = (key: string) => {
    setFamilySelections((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem("familySelections", JSON.stringify(next));
      return next;
    });
  };

  const handleFamilyPlan = async () => {
    if (familySelections.length === 0) return;
    setFamilyPlanLoading(true);
    try {
      const data = await fetchFamilyMealPlan(familySelections);
      setFamilyPlan(data as FamilyPlanData);
    } catch { /* ignore */ } finally {
      setFamilyPlanLoading(false);
    }
  };

  const STATUS_STYLE: Record<string, string> = {
    under:    "bg-yellow-100 text-yellow-700",
    on_track: "bg-green-100 text-green-700",
    over:     "bg-red-100 text-red-700",
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-gray-200 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-gray-200 rounded-2xl" />
          <div className="h-96 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Hero date
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{greeting}!</h1>
            <p className="text-green-100 mt-1 text-sm">
              Personalized nutrition from what you already have.
            </p>
            {log && (
              <p className="text-green-200 text-xs mt-2">
                Target: {log.target.calories} kcal &nbsp;·&nbsp; BMR {log.target.bmr} &nbsp;·&nbsp; TDEE {log.target.tdee}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-green-100 text-sm font-medium">{formattedDate.split(",")[0]}</p>
            <p className="text-green-200 text-xs mt-0.5">{formattedDate.slice(formattedDate.indexOf(",") + 2)}</p>
          </div>
        </div>
      </div>

      {/* ── Banners ───────────────────────────────────────────────────── */}
      {backendOnline === false && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl shrink-0">⊘</span>
            <div>
              <p className="font-semibold text-red-700">Backend is not reachable</p>
              <p className="text-sm text-red-600 mt-1">
                Start the FastAPI server:{" "}
                <code className="bg-red-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  cd backend &amp;&amp; uvicorn app.main:app --reload
                </code>
              </p>
            </div>
          </div>
        </div>
      )}

      {backendOnline && !log && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-800">
          <span className="font-semibold">No profile found. </span>
          <Link href="/profile" className="underline font-medium">Create your profile</Link> to get personalized nutrition targets and meal plans.
        </div>
      )}

      {/* ── Nutrition Progress ────────────────────────────────────────── */}
      {log && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">Daily Nutrition Progress</h2>
            <span className="text-xs text-gray-400">{log.date}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ProgressCard label="Calories" consumed={log.consumed.calories} target={log.target.calories} unit="kcal" pct={log.progress.calories_pct} color="bg-green-500" />
            <ProgressCard label="Protein"  consumed={log.consumed.protein_g} target={log.target.protein_g} unit="g" pct={log.progress.protein_pct} color="bg-blue-500" />
            <ProgressCard label="Carbs"    consumed={log.consumed.carbs_g}   target={log.target.carbs_g}   unit="g" pct={log.progress.carbs_pct}   color="bg-yellow-400" />
            <ProgressCard label="Fat"      consumed={log.consumed.fat_g}     target={log.target.fat_g}     unit="g" pct={log.progress.fat_pct}     color="bg-red-400" />
          </div>
          {log.warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {log.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{w}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      {backendOnline && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Meal Plan ──────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-gray-700">Today&apos;s Recommended Meals</h2>
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setPlanMode("personal")}
                  className={`px-3 py-1.5 rounded-md transition-colors ${planMode === "personal" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
                >
                  Personal Plan
                </button>
                <button
                  onClick={() => { setPlanMode("family"); if (familySelections.length > 0 && !familyPlan) handleFamilyPlan(); }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${planMode === "family" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
                >
                  Family Plan
                </button>
              </div>
            </div>

            {planMode === "personal" && mealPlan?.recommendation_summary && (
              <p className="text-sm text-gray-500 italic -mt-1">{mealPlan.recommendation_summary}</p>
            )}

            {/* ── Family Plan Mode ──────────────────────────────── */}
            {planMode === "family" && (
              <div className="space-y-3">
                {familyPlanLoading && (
                  <div className="text-sm text-gray-400 text-center py-6 animate-pulse">Generating family meal plan…</div>
                )}
                {!familyPlanLoading && familySelections.length === 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 text-sm text-blue-700">
                    Select members in the <Link href="/family" className="underline font-semibold">Family section</Link> to generate a family meal plan.
                  </div>
                )}
                {!familyPlanLoading && familySelections.length > 0 && !familyPlan && (
                  <button
                    onClick={handleFamilyPlan}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Generate Family Meal Plan
                  </button>
                )}
                {familyPlan && (
                  <>
                    {familyPlan.recommendation_summary && (
                      <p className="text-sm text-gray-500 italic">{familyPlan.recommendation_summary}</p>
                    )}
                    {familyPlan.conflict_notes.length > 0 && (
                      <div className="space-y-1.5">
                        {familyPlan.conflict_notes.map((note, i) => (
                          <p key={i} className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">⚠ {note}</p>
                        ))}
                      </div>
                    )}
                    {familyPlan.meals.map((meal, idx) => (
                      <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${MEAL_TYPE_COLORS[meal.meal_type] ?? "bg-gray-100 text-gray-600"}`}>
                            {meal.meal_type}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{meal.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">{meal.estimated_macros.calories} kcal</span>
                        </div>
                        {meal.per_member_allocations && meal.per_member_allocations.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {meal.per_member_allocations.map((a, ai) => (
                              <div key={ai} className="text-xs text-gray-500 flex items-center gap-2">
                                <span className="font-medium text-gray-700">{a.member_name}:</span>
                                <span>{a.portion_guidance}</span>
                                <span className="text-gray-400">({a.estimated_macros.calories} kcal)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={handleFamilyPlan}
                      disabled={familyPlanLoading}
                      className="text-xs text-green-600 hover:text-green-800 font-semibold"
                    >
                      Regenerate →
                    </button>
                    <Link href="/family" className="ml-4 text-xs text-gray-400 hover:text-gray-600 font-medium">
                      Full Family Plan →
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* ── Personal Plan Mode ────────────────────────────── */}
            {planMode === "personal" && markMsg && (
              <div className={`rounded-xl px-4 py-3 text-sm border ${
                markMsg.type === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                {markMsg.text}
              </div>
            )}

            {planMode === "personal" && mealPlan && mealPlan.meals.length > 0 ? (
              <>
                <div className="space-y-4">
                  {mealPlan.meals.map((meal) => {
                    const eaten = eatenTypes.has(meal.meal_type);
                    const busy = marking === meal.meal_type;
                    const expanded = expandedMeal === meal.meal_type;
                    const scoreColor = meal.score >= 70 ? "bg-green-500" : meal.score >= 45 ? "bg-yellow-400" : "bg-red-400";
                    const scoreText = meal.score >= 70 ? "text-green-600" : meal.score >= 45 ? "text-yellow-600" : "text-red-500";
                    const mealTypeColor = MEAL_TYPE_COLORS[meal.meal_type] ?? "bg-gray-100 text-gray-600";

                    return (
                      <div
                        key={meal.meal_type}
                        className={`bg-white rounded-2xl shadow-sm border p-5 transition-all ${eaten ? "border-green-200 opacity-80" : "border-gray-100"}`}
                      >
                        {/* Top row */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${mealTypeColor}`}>
                              {meal.meal_type}
                            </span>
                            <span className="text-sm text-gray-500">
                              {CUISINE_EMOJI[meal.cuisine] ?? "🍽"} {meal.cuisine}
                            </span>
                            <span className="text-xs text-gray-400">· {meal.cooking_time_minutes} min</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-500 shrink-0">
                            {meal.estimated_macros.calories} kcal
                          </span>
                        </div>

                        {/* Name */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">{meal.name}</h3>

                        {/* Score bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-gray-400">Match score</span>
                            <span className={`font-bold ${scoreText}`}>{meal.score}/100</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${scoreColor}`} style={{ width: `${meal.score}%` }} />
                          </div>
                        </div>

                        {/* Macros */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="text-center bg-blue-50 rounded-xl p-2.5">
                            <div className="text-xs text-blue-400 font-medium mb-0.5">Protein</div>
                            <div className="font-bold text-blue-700">{meal.estimated_macros.protein_g}g</div>
                          </div>
                          <div className="text-center bg-yellow-50 rounded-xl p-2.5">
                            <div className="text-xs text-yellow-500 font-medium mb-0.5">Carbs</div>
                            <div className="font-bold text-yellow-700">{meal.estimated_macros.carbs_g}g</div>
                          </div>
                          <div className="text-center bg-red-50 rounded-xl p-2.5">
                            <div className="text-xs text-red-400 font-medium mb-0.5">Fat</div>
                            <div className="font-bold text-red-600">{meal.estimated_macros.fat_g}g</div>
                          </div>
                        </div>

                        {/* Ingredients */}
                        {meal.ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {meal.ingredients.map((ing) => (
                              <span
                                key={ing.inventory_item_id}
                                className={`text-xs px-2.5 py-1 rounded-full border font-medium ${RISK_STYLES[ing.expiration_risk] ?? RISK_STYLES.unknown}`}
                              >
                                {ing.name}{" "}
                                <span className="opacity-70">({ing.quantity_used}{ing.unit})</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Tags */}
                        {meal.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {meal.tags.map((tag) => (
                              <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                #{tag.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Urgent warning */}
                        {meal.urgent_ingredients_used.length > 0 && (
                          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-3">
                            ⚠ Uses expiring soon: {meal.urgent_ingredients_used.join(", ")}
                          </p>
                        )}

                        {/* Reason */}
                        <p className="text-xs text-gray-400 italic mb-3">{meal.reason}</p>

                        {/* Instructions toggle */}
                        <button
                          type="button"
                          onClick={() => setExpandedMeal(expanded ? null : meal.meal_type)}
                          className="text-xs text-green-600 hover:text-green-800 font-semibold flex items-center gap-1 mb-3 transition-colors"
                        >
                          {expanded ? "▲ Hide" : "▼ Show"} cooking instructions
                        </button>

                        {expanded && (
                          <ol className="space-y-2 mb-4 pl-4 list-decimal marker:text-green-500">
                            {meal.instructions.map((step, i) => (
                              <li key={i} className="text-xs text-gray-600 leading-relaxed pl-1">{step}</li>
                            ))}
                          </ol>
                        )}

                        {/* Mark as Eaten */}
                        <button
                          onClick={() => handleMarkAsEaten(meal)}
                          disabled={eaten || busy}
                          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            eaten
                              ? "bg-green-100 text-green-600 cursor-default"
                              : busy
                              ? "bg-gray-100 text-gray-400 cursor-wait"
                              : "bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow"
                          }`}
                        >
                          {eaten ? "✓ Eaten today" : busy ? "Logging…" : "Mark as Eaten"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Daily plan totals */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">If you eat all recommended meals</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
                    {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((key) => (
                      <div key={key} className="bg-gray-50 rounded-xl p-3">
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
            ) : planMode === "personal" && mealPlan && mealPlan.meals.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <span className="text-3xl mb-2 block">🎉</span>
                <p className="font-semibold text-green-700">You&apos;ve hit your nutrition targets for today!</p>
                <p className="text-sm text-green-600 mt-1">No more meals recommended.</p>
              </div>
            ) : planMode === "personal" ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                <span className="text-3xl mb-3 block">🥗</span>
                <p className="font-medium text-gray-600 mb-1">No meal plan yet</p>
                <p className="text-sm text-gray-400">
                  <Link href="/profile" className="text-green-600 underline">Create a profile</Link> and{" "}
                  <Link href="/inventory" className="text-green-600 underline">add some ingredients</Link> to get started.
                </p>
              </div>
            ) : null}
          </div>

          {/* ── Right: Sidebar ───────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Meals Eaten Today */}
            {log && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">Meals Eaten Today</h3>
                  <span className="text-xs text-gray-400">{log.meals.length} logged</span>
                </div>
                {log.meals.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm text-gray-400">Nothing logged yet.</p>
                    <p className="text-xs text-gray-300 mt-1">Mark a meal as eaten above.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {log.meals.map((m) => (
                      <div key={m.id} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${MEAL_TYPE_COLORS[m.meal_type] ?? "bg-gray-100 text-gray-600"}`}>
                              {m.meal_type}
                            </span>
                            {m.source === "manual" && (
                              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Manual</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800 truncate">{m.meal_name}</p>
                          <p className="text-xs text-gray-400">{Math.round(m.calories)} kcal · {m.protein_g}g P</p>
                        </div>
                        <button
                          onClick={() => handleDeleteMeal(m.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors shrink-0 mt-1 text-lg leading-none"
                          title="Remove meal"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Urgent Ingredients */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Urgent Ingredients</h3>
                {urgentItems.length > 0 && (
                  <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                    {urgentItems.length}
                  </span>
                )}
              </div>
              {urgentItems.length === 0 ? (
                <div className="px-5 py-5 text-center">
                  <span className="text-2xl block mb-1">✅</span>
                  <p className="text-sm text-green-600 font-medium">All fresh!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {urgentItems.slice(0, 6).map((item) => (
                    <div key={item.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-800 truncate">{item.name}</span>
                      <RiskBadge risk={item.expiration_risk} />
                    </div>
                  ))}
                  {urgentItems.length > 6 && (
                    <div className="px-5 py-2.5">
                      <Link href="/inventory" className="text-xs text-green-600 hover:text-green-800 font-medium">
                        +{urgentItems.length - 6} more → View all
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Weekly Grocery Preview */}
            {groceryList && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">Grocery Preview</h3>
                  <Link href="/grocery-list" className="text-xs text-green-600 hover:text-green-800 font-semibold">
                    Full list →
                  </Link>
                </div>
                {groceryList.nutrition_gap_summary.analysis && (
                  <div className={`mx-4 mt-4 rounded-xl p-3 text-xs ${
                    groceryList.nutrition_gap_summary.protein_low_in_inventory
                      ? "bg-red-50 text-red-700"
                      : "bg-blue-50 text-blue-700"
                  }`}>
                    {groceryList.nutrition_gap_summary.analysis}
                  </div>
                )}
                <div className="divide-y divide-gray-100 mt-3">
                  {groceryList.recommended_to_buy.slice(0, 4).map((item, i) => (
                    <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-800">{item.name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                        {item.priority}
                      </span>
                    </div>
                  ))}
                  {groceryList.recommended_to_buy.length === 0 && (
                    <div className="px-5 py-4 text-sm text-gray-400 text-center">Pantry looks stocked!</div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Add Meal */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Quick Add Meal</h3>
                <p className="text-xs text-gray-400 mt-0.5">Log food eaten outside the home</p>
              </div>
              <form onSubmit={handleQuickMeal} className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select
                      value={quickForm.meal_type}
                      onChange={(e) => setQuickForm((p) => ({ ...p, meal_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      {["breakfast", "lunch", "dinner", "snack"].map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      required
                      value={quickForm.meal_name}
                      onChange={(e) => setQuickForm((p) => ({ ...p, meal_name: e.target.value }))}
                      placeholder="e.g. Protein bar"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: "calories",  label: "kcal" },
                    { key: "protein_g", label: "P(g)" },
                    { key: "carbs_g",   label: "C(g)" },
                    { key: "fat_g",     label: "F(g)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                      <input
                        type="number" min="0" step="any"
                        value={quickForm[key as keyof typeof quickForm]}
                        onChange={(e) => setQuickForm((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <input
                    value={quickForm.notes}
                    onChange={(e) => setQuickForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                {quickMsg && (
                  <p className={`text-xs rounded-lg px-3 py-2 ${
                    quickMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}>{quickMsg.text}</p>
                )}
                <button
                  type="submit" disabled={quickSaving}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  {quickSaving ? "Logging…" : "Log Meal"}
                </button>
              </form>
            </div>

            {/* Nutrition Analysis */}
            {analysis && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800 text-sm">Today&apos;s Analysis</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm text-gray-700">{analysis.summary}</p>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(analysis.macro_status) as [string, string][]).map(([key, status]) => (
                      <div key={key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-gray-500 capitalize">{key}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {status.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {analysis.next_meal_recommendation && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-blue-700 font-medium mb-0.5">Next meal suggestion</p>
                      <p className="text-xs text-blue-600">{analysis.next_meal_recommendation}</p>
                    </div>
                  )}

                  {analysis.health_notes.length > 0 && (
                    <div className="space-y-1.5">
                      {analysis.health_notes.map((note, i) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          {note}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-300 italic">{analysis.disclaimer}</p>
                </div>
              </div>
            )}

            {/* Who is eating today? */}
            {familyData && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">Who is Eating Today?</h3>
                  <Link href="/family" className="text-xs text-green-600 hover:text-green-800 font-semibold">
                    Family Plan →
                  </Link>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {[familyData.primary_member, ...familyData.additional_members].map((member) => {
                    const sel = familySelections.includes(member.member_key);
                    return (
                      <button
                        key={member.member_key}
                        type="button"
                        onClick={() => toggleFamilySelection(member.member_key)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                          sel ? "bg-green-50 text-green-800 font-semibold" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-xs shrink-0 ${
                          sel ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                        }`}>
                          {sel ? "✓" : ""}
                        </span>
                        <span>{member.name}</span>
                        {member.member_key === "primary" && (
                          <span className="text-gray-400 font-normal">(you)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {familySelections.length > 0 && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-gray-400">{familySelections.length} selected — switch to Family Plan above</p>
                  </div>
                )}
              </div>
            )}

            {/* Recent Food Waste */}
            {wasteLog.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-orange-100">
                  <h3 className="font-semibold text-gray-800 text-sm">Recent Food Waste</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {wasteLog.reduce((s, e) => s + (e.estimated_calories_wasted ?? 0), 0).toFixed(0)} kcal discarded recently
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {wasteLog.slice(0, 4).map((entry) => (
                    <div key={entry.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{entry.item_name}</p>
                        <p className="text-xs text-gray-400 capitalize">{entry.reason.replace(/_/g, " ")}</p>
                      </div>
                      {entry.estimated_calories_wasted != null && (
                        <span className="text-xs font-medium text-red-500 shrink-0">
                          −{entry.estimated_calories_wasted.toFixed(0)} kcal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-orange-50">
                  <p className="text-xs text-orange-600">
                    Tip: use expiring items first.{" "}
                    <Link href="/inventory" className="underline font-medium">Manage inventory →</Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
