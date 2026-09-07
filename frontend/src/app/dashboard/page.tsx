"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import AttendanceCard from "./components/AttendanceCard";
import DashboardHero from "./components/DashboardHero";
import InsightPanel from "./components/InsightPanel";
import LoggedMealsSection from "./components/LoggedMealsSection";
import MealPlanSection from "./components/MealPlanSection";
import NutritionProgressSection from "./components/NutritionProgressSection";
import QuickMealModal from "./components/QuickMealModal";
import TodayAtGlancePanel from "./components/TodayAtGlancePanel";
import WasteCard from "./components/WasteCard";
import type {
  FamilyDataBasic,
  GroceryList,
  LoggedMeal,
  MealPlan,
  NutritionAnalysis,
  NutritionLog,
  PlanMeal,
  QuickForm,
  Schedule,
  UrgentItem,
  WasteEntry,
} from "./components/types";
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
      <DashboardHero
        formattedDate={formattedDate}
        greeting={greeting}
        calorieTarget={calorieTarget}
        log={log}
        onOpenQuickMeal={() => {
          setQuickMsg(null);
          setIsQuickOpen(true);
        }}
      />

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

      {log && <NutritionProgressSection log={log} />}

      {analysis && <InsightPanel analysis={analysis} insightTitle={insightTitle} />}

      {backendOnline && (
        <section className="grid gap-6 lg:grid-cols-3">
          <MealPlanSection
            mealPlan={mealPlan}
            hasMeals={hasMeals}
            markMsg={markMsg}
            marking={marking}
            eatenTypes={eatenTypes}
            expandedMeal={expandedMeal}
            familyData={familyData}
            todayMembers={todayMembers}
            onToggleExpanded={setExpandedMeal}
            onMarkAsEaten={handleMarkAsEaten}
          />
          <TodayAtGlancePanel urgentItems={urgentItems} groceryList={groceryList} />
        </section>
      )}

      {log && (
        <LoggedMealsSection
          log={log}
          onDeleteMeal={handleDeleteMeal}
          onOpenQuickMeal={() => {
            setQuickMsg(null);
            setIsQuickOpen(true);
          }}
        />
      )}

      {backendOnline && (
        <section className="grid gap-6 lg:grid-cols-2">
          <AttendanceCard
            familyData={familyData}
            todayMembers={todayMembers}
            todayOverride={todayOverride}
            scheduleTypeLabel={todayScheduleType() === "weekday" ? "Weekday schedule" : "Weekend schedule"}
            onToggleMember={toggleTodayMember}
            onResetOverride={() => setTodayOverride(null)}
          />
          <WasteCard wasteLog={wasteLog} />
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
