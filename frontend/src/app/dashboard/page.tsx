"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
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
  fetchFamilySchedule,
} from "@/lib/api";

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
  consumed: Macros;
  target: Macros;
  remaining: Macros;
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
  recommendation_reasons: string[];
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

type Schedule = Record<string, Record<string, string[]>>;

type QuickForm = {
  meal_type: string;
  meal_name: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  notes: string;
};

type QuickFormKey = keyof QuickForm;

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-800 ring-amber-200",
  lunch: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  dinner: "bg-sky-100 text-sky-800 ring-sky-200",
  snack: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
};

const STATUS_STYLE: Record<string, string> = {
  under: "bg-amber-100 text-amber-800",
  on_track: "bg-emerald-100 text-emerald-800",
  over: "bg-red-100 text-red-700",
};

const QUICK_FORM_INITIAL: QuickForm = {
  meal_type: "snack",
  meal_name: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  notes: "",
};

function formatMealType(mealType: string) {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${RISK_STYLES[risk] ?? RISK_STYLES.unknown}`}>
      {risk}
    </span>
  );
}

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

function MacroChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function QuickMealModal({
  isOpen,
  quickForm,
  quickSaving,
  quickMsg,
  onClose,
  onSubmit,
  setQuickForm,
}: {
  isOpen: boolean;
  quickForm: QuickForm;
  quickSaving: boolean;
  quickMsg: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  setQuickForm: Dispatch<SetStateAction<QuickForm>>;
}) {
  if (!isOpen) return null;

  const macroFields: { key: QuickFormKey; label: string }[] = [
    { key: "calories", label: "Calories" },
    { key: "protein_g", label: "Protein" },
    { key: "carbs_g", label: "Carbs" },
    { key: "fat_g", label: "Fat" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Manual meal</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950">Log a meal</h2>
            <p className="mt-1 text-sm text-gray-500">Track food eaten outside your recommended plan.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-200"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Type</span>
              <select
                value={quickForm.meal_type}
                onChange={(e) => setQuickForm((p) => ({ ...p, meal_type: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              >
                {["breakfast", "lunch", "dinner", "snack"].map((type) => (
                  <option key={type} value={type}>{formatMealType(type)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Name</span>
              <input
                required
                value={quickForm.meal_name}
                onChange={(e) => setQuickForm((p) => ({ ...p, meal_name: e.target.value }))}
                placeholder="Protein bowl, latte, leftovers..."
                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {macroFields.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quickForm[key]}
                  onChange={(e) => setQuickForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Notes</span>
            <textarea
              value={quickForm.notes}
              onChange={(e) => setQuickForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional context"
              rows={3}
              className="w-full resize-none rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          {quickMsg && (
            <p className={`rounded-2xl px-4 py-3 text-sm ${quickMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {quickMsg.text}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={quickSaving}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {quickSaving ? "Logging..." : "Log meal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickForm>(QUICK_FORM_INITIAL);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickMsg, setQuickMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [familyData, setFamilyData] = useState<FamilyDataBasic | null>(null);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [todayOverride, setTodayOverride] = useState<string[] | null>(null);

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
      setEatenTypes(new Set(logData.meals.map((meal: LoggedMeal) => meal.meal_type)));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const online = await checkBackendHealth();
      setBackendOnline(online);
      if (online) {
        await refreshAll();
        const [fd, sched] = await Promise.all([fetchFamily(), fetchFamilySchedule()]);
        if (fd) setFamilyData(fd as FamilyDataBasic);
        if (sched) setSchedule(sched as Schedule);
      }
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
        calories: meal.estimated_macros.calories,
        protein_g: meal.estimated_macros.protein_g,
        carbs_g: meal.estimated_macros.carbs_g,
        fat_g: meal.estimated_macros.fat_g,
        ingredients_used: meal.ingredients.map((ingredient) => ({
          inventory_item_id: ingredient.inventory_item_id,
          name: ingredient.name,
          quantity_used: ingredient.quantity_used,
          unit: ingredient.unit,
        })),
      });
      setMarkMsg({ type: "success", text: `${formatMealType(meal.meal_type)} marked as eaten.` });
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
    } catch {
      /* keep dashboard stable if delete fails */
    }
  };

  const handleQuickMeal = async (e: FormEvent) => {
    e.preventDefault();
    setQuickSaving(true);
    setQuickMsg(null);
    try {
      await logManualMeal({
        meal_type: quickForm.meal_type,
        meal_name: quickForm.meal_name,
        calories: parseFloat(quickForm.calories) || 0,
        protein_g: parseFloat(quickForm.protein_g) || 0,
        carbs_g: parseFloat(quickForm.carbs_g) || 0,
        fat_g: parseFloat(quickForm.fat_g) || 0,
        notes: quickForm.notes || null,
      });
      setQuickMsg({ type: "success", text: "Meal logged." });
      setQuickForm(QUICK_FORM_INITIAL);
      await refreshAll();
      setIsQuickOpen(false);
    } catch (err) {
      setQuickMsg({ type: "error", text: String(err) });
    } finally {
      setQuickSaving(false);
    }
  };

  function todayScheduleType(): "weekday" | "weekend_holiday" {
    const day = new Date().getDay();
    return day === 0 || day === 6 ? "weekend_holiday" : "weekday";
  }

  function defaultTodayMembers(): string[] {
    const st = todayScheduleType();
    const keys = new Set<string>();
    for (const memberKeys of Object.values(schedule[st] ?? {})) {
      memberKeys.forEach((key: string) => keys.add(key));
    }
    return Array.from(keys);
  }

  const todayMembers = todayOverride ?? defaultTodayMembers();

  function toggleTodayMember(key: string) {
    const current = todayOverride ?? defaultTodayMembers();
    setTodayOverride(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  }

  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const hasMeals = Boolean(mealPlan && mealPlan.meals.length > 0);
  const calorieTarget = log?.target.calories ?? mealPlan?.target.calories;
  const insightTitle = analysis?.macro_status.protein === "under" ? "Protein is still low" : "Today's nutrition insight";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 animate-pulse rounded-[28px] bg-gray-200" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-[22px] bg-gray-200" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-96 animate-pulse rounded-[28px] bg-gray-200 lg:col-span-2" />
          <div className="h-96 animate-pulse rounded-[28px] bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
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
            onClick={() => {
              setQuickMsg(null);
              setIsQuickOpen(true);
            }}
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

      {backendOnline === false && (
        <div className="rounded-[24px] bg-red-50 p-5 text-red-800 ring-1 ring-red-100">
          <p className="font-semibold">Backend is not reachable</p>
          <p className="mt-1 text-sm text-red-700">
            Start the FastAPI server with <code className="rounded bg-red-100 px-1.5 py-0.5 text-xs">cd backend && uvicorn app.main:app --reload</code>.
          </p>
        </div>
      )}

      {backendOnline && !log && (
        <div className="rounded-[24px] bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-100">
          <p className="font-semibold">Create a profile to personalize the dashboard.</p>
          <p className="mt-1 text-sm">
            Add your body metrics and goals on the{" "}
            <Link href="/profile" className="font-semibold underline">profile page</Link>.
          </p>
        </div>
      )}

      {log && (
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
      )}

      {analysis && (
        <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Today's insight</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-950">{insightTitle}</h2>
            </div>
            <div>
              <p className="text-sm leading-6 text-gray-600">{analysis.summary}</p>
              {analysis.next_meal_recommendation && (
                <p className="mt-2 text-sm font-medium text-emerald-700">{analysis.next_meal_recommendation}</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.entries(analysis.macro_status) as [string, string][]).map(([key, status]) => (
              <span key={key} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>
                {key}: {status.replace("_", " ")}
              </span>
            ))}
          </div>
          {(analysis.health_notes.length > 0 || analysis.disclaimer) && (
            <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
              {analysis.health_notes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {analysis.health_notes.slice(0, 2).map((note, index) => (
                    <p key={index} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      {note}
                    </p>
                  ))}
                </div>
              )}
              {analysis.disclaimer && (
                <p className="text-xs leading-5 text-gray-400 lg:max-w-xs">{analysis.disclaimer}</p>
              )}
            </div>
          )}
        </section>
      )}

      {backendOnline && (
        <section className="grid gap-6 lg:grid-cols-3">
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
                        onClick={() => setExpandedMeal(expanded ? null : meal.meal_type)}
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
                        onClick={() => handleMarkAsEaten(meal)}
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

          <aside className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Today at a glance</p>
                <h2 className="text-lg font-semibold text-gray-950">What needs attention</h2>
              </div>
              <Link href="/inventory" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
                Inventory
              </Link>
            </div>

            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Urgent ingredients</h3>
                  {urgentItems.length > 0 && (
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">{urgentItems.length}</span>
                  )}
                </div>
                {urgentItems.length === 0 ? (
                  <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">No urgent ingredients today.</p>
                ) : (
                  <div className="space-y-2">
                    {urgentItems.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.quantity} {item.unit} in {item.zone}</p>
                        </div>
                        <RiskBadge risk={item.expiration_risk} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Grocery preview</h3>
                  <Link href="/grocery-list" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Full list</Link>
                </div>
                {groceryList?.recommended_to_buy.length ? (
                  <div className="space-y-2">
                    {groceryList.recommended_to_buy.slice(0, 4).map((item, index) => (
                      <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="truncate text-xs text-gray-400">{item.reason}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                          {item.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">No grocery gaps surfaced yet.</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      )}

      {log && (
        <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Logged meals</p>
              <h2 className="text-lg font-semibold text-gray-950">Meals eaten today</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickMsg(null);
                setIsQuickOpen(true);
              }}
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
                    onClick={() => handleDeleteMeal(meal.id)}
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
      )}

      {backendOnline && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Household</p>
                <h2 className="text-lg font-semibold text-gray-950">Today's attendance</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {todayScheduleType() === "weekday" ? "Weekday schedule" : "Weekend schedule"}
                  {todayOverride ? " with today's override" : ""}
                </p>
              </div>
              <Link href="/family" className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
                Edit schedule
              </Link>
            </div>

            {familyData ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[familyData.primary_member, ...familyData.additional_members].map((member) => {
                    const selected = todayMembers.includes(member.member_key);
                    return (
                      <button
                        key={member.member_key}
                        type="button"
                        onClick={() => toggleTodayMember(member.member_key)}
                        className={`rounded-2xl px-4 py-3 text-left transition ${
                          selected ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <span className="block text-sm font-semibold">
                          {member.name}{member.member_key === "primary" ? " (you)" : ""}
                        </span>
                        <span className="mt-1 block text-xs opacity-70">{selected ? "Eating at home" : "Away today"}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-500">
                  <span>{todayMembers.length} household member{todayMembers.length === 1 ? "" : "s"} eating at home</span>
                  {todayOverride && (
                    <button type="button" onClick={() => setTodayOverride(null)} className="font-semibold text-emerald-700 hover:text-emerald-900">
                      Reset
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">Create a profile to set household attendance.</p>
            )}
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Waste</p>
                <h2 className="text-lg font-semibold text-gray-950">Recent food waste</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {wasteLog.length > 0
                    ? `${wasteLog.reduce((sum, entry) => sum + (entry.estimated_calories_wasted ?? 0), 0).toFixed(0)} kcal discarded recently`
                    : "No discarded items logged recently"}
                </p>
              </div>
              <Link href="/inventory" className="rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100">
                Manage inventory
              </Link>
            </div>

            {wasteLog.length === 0 ? (
              <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">Nice and tidy. Use expiring ingredients first to keep this quiet.</p>
            ) : (
              <div className="space-y-2">
                {wasteLog.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl bg-orange-50/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-950">{entry.item_name}</p>
                      <p className="text-xs capitalize text-orange-700">{entry.reason.replace(/_/g, " ")}</p>
                    </div>
                    {entry.estimated_calories_wasted != null && (
                      <span className="shrink-0 text-sm font-semibold text-orange-700">
                        {entry.estimated_calories_wasted.toFixed(0)} kcal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <QuickMealModal
        isOpen={isQuickOpen}
        quickForm={quickForm}
        quickSaving={quickSaving}
        quickMsg={quickMsg}
        onClose={() => setIsQuickOpen(false)}
        onSubmit={handleQuickMeal}
        setQuickForm={setQuickForm}
      />
    </div>
  );
}
