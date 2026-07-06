"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchFamily,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  fetchFamilyMealPlan,
  fetchFamilySchedule,
  updateFamilySchedule,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type FamilyMemberData = {
  id?: number;
  member_key: string;
  name: string;
  relationship_label?: string;
  goal?: string;
  activity_level?: string;
  sex?: string;
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  health_conditions: string[];
  allergies: string[];
  strict_avoid_foods: string[];
  diet_style?: string;
  macro_strategy?: string;
  is_active: boolean;
  source?: string;
};

type FamilyData = {
  household: unknown;
  primary_member: FamilyMemberData;
  additional_members: FamilyMemberData[];
};

type PlanIngredient = {
  inventory_item_id: number;
  name: string;
  quantity_used: number;
  unit: string;
  reason: string;
  expiration_risk: string;
};

type PerMemberAllocation = {
  member_key: string;
  member_name: string;
  estimated_macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  portion_guidance: string;
  reason: string;
};

type FamilyMeal = {
  name: string;
  meal_type: string;
  estimated_macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  ingredients?: PlanIngredient[];
  per_member_allocations?: PerMemberAllocation[];
};

type FamilyPlan = {
  selected_members: FamilyMemberData[];
  individual_adjusted_targets: Record<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  combined_household_targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  meals: FamilyMeal[];
  conflict_notes: string[];
  health_and_allergy_notes: string[];
  recommendation_summary: string;
};

type Schedule = Record<string, Record<string, string[]>>;

// Eaten tracking: key is "{meal_type}-{ingredient_name}"
type EatenState = {
  [key: string]: { logId?: number; loading: boolean };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SCHEDULE_TYPES = ["weekday", "weekend_holiday"] as const;
const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const SCHEDULE_LABELS: Record<string, string> = {
  weekday: "Weekdays (Mon–Fri)",
  weekend_holiday: "Weekends & Holidays",
};
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const HEALTH_CONDITIONS = [
  "fatty_liver", "diabetes", "prediabetes", "high_cholesterol",
  "hypertension", "kidney_disease", "lactose_intolerance",
  "gluten_sensitivity", "gout", "celiac",
];

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700",
  lunch:     "bg-green-100 text-green-700",
  dinner:    "bg-blue-100 text-blue-700",
};

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border border-red-200",
  high:    "bg-orange-100 text-orange-700 border border-orange-200",
  medium:  "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:     "bg-green-100 text-green-700 border border-green-200",
  unknown: "bg-gray-100 text-gray-600 border border-gray-200",
};

const defaultForm: Omit<FamilyMemberData, "id" | "member_key" | "source"> = {
  name: "",
  relationship_label: "spouse",
  goal: "maintenance",
  activity_level: "moderate",
  sex: "male",
  age: undefined,
  weight_kg: undefined,
  height_cm: undefined,
  health_conditions: [],
  allergies: [],
  strict_avoid_foods: [],
  diet_style: "no_preference",
  macro_strategy: "",
  is_active: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function MacroPills({ macros }: { macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number } }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{macros.calories} kcal</span>
      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{macros.protein_g}g P</span>
      <span className="bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full">{macros.carbs_g}g C</span>
      <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{macros.fat_g}g F</span>
    </div>
  );
}

function todayScheduleType(): "weekday" | "weekend_holiday" {
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6 ? "weekend_holiday" : "weekday";
}

function collectTodayMembers(schedule: Schedule): string[] {
  const st = todayScheduleType();
  const keys = new Set<string>();
  for (const mkeys of Object.values(schedule[st] ?? {})) {
    mkeys.forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FamilyPage() {
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);

  // Schedule state
  const [schedule, setSchedule] = useState<Schedule>({});
  const [scheduleTab, setScheduleTab] = useState<"weekday" | "weekend_holiday">("weekday");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Household Food Plan state
  const [plan, setPlan] = useState<FamilyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [eatenState, setEatenState] = useState<EatenState>({});
  const [expandedAlloc, setExpandedAlloc] = useState<string | null>(null);

  // Member CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMemberData | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [allergiesText, setAllergiesText] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

  const allMembers: FamilyMemberData[] = familyData
    ? [familyData.primary_member, ...familyData.additional_members]
    : [];

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([fetchFamily(), fetchFamilySchedule()]).then(([fd, sched]) => {
      if (fd) setFamilyData(fd as FamilyData);
      if (sched) setSchedule(sched as Schedule);
      setLoading(false);
    });
  }, []);

  // Auto-generate food plan when schedule loads and has members for today
  useEffect(() => {
    if (loading) return;
    const todayKeys = collectTodayMembers(schedule);
    if (todayKeys.length === 0) return;
    generatePlan(todayKeys);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, schedule]);

  // ── Schedule helpers ───────────────────────────────────────────────────────

  function toggleScheduleMember(st: string, mt: string, key: string) {
    setSchedule((prev) => {
      const current = (prev[st]?.[mt] ?? []) as string[];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      return { ...prev, [st]: { ...(prev[st] ?? {}), [mt]: next } };
    });
    setScheduleSaved(false);
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    try {
      await updateFamilySchedule({ schedule });
      setScheduleSaved(true);
      // Re-generate plan for today
      const todayKeys = collectTodayMembers(schedule);
      if (todayKeys.length > 0) generatePlan(todayKeys);
    } catch { /* ignore */ } finally {
      setScheduleSaving(false);
    }
  }

  // ── Food plan ──────────────────────────────────────────────────────────────

  async function generatePlan(memberKeys: string[]) {
    if (memberKeys.length === 0) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    setEatenState({});
    try {
      const data = await fetchFamilyMealPlan(memberKeys);
      setPlan(data as FamilyPlan);
    } catch (err) {
      setPlanError(String(err));
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleEaten(meal: FamilyMeal, ing: PlanIngredient) {
    const key = `${meal.meal_type}-${ing.inventory_item_id}`;
    if (eatenState[key]) return; // already eaten
    setEatenState((prev) => ({ ...prev, [key]: { loading: true } }));
    try {
      const { logMeal } = await import("@/lib/api");
      const result = await logMeal({
        meal_type: meal.meal_type,
        meal_name: ing.name,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        ingredients_used: [{
          inventory_item_id: ing.inventory_item_id,
          name: ing.name,
          quantity_used: ing.quantity_used,
          unit: ing.unit,
        }],
      });
      setEatenState((prev) => ({ ...prev, [key]: { logId: result?.id, loading: false } }));
    } catch {
      setEatenState((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleUndoEaten(key: string) {
    const entry = eatenState[key];
    if (!entry?.logId) {
      setEatenState((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    try {
      const { deleteMealLog } = await import("@/lib/api");
      await deleteMealLog(entry.logId);
    } catch { /* ignore */ } finally {
      setEatenState((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  }

  // ── Member CRUD ────────────────────────────────────────────────────────────

  const refreshFamily = useCallback(async () => {
    const data = await fetchFamily();
    if (data) setFamilyData(data as FamilyData);
  }, []);

  const openAddForm = () => {
    setEditingMember(null);
    setForm(defaultForm);
    setAllergiesText("");
    setAvoidText("");
    setFormError(null);
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const openEditForm = (member: FamilyMemberData) => {
    setEditingMember(member);
    setForm({
      name: member.name,
      relationship_label: member.relationship_label ?? "spouse",
      goal: member.goal ?? "maintenance",
      activity_level: member.activity_level ?? "moderate",
      sex: member.sex ?? "male",
      age: member.age,
      weight_kg: member.weight_kg,
      height_cm: member.height_cm,
      health_conditions: member.health_conditions ?? [],
      allergies: member.allergies ?? [],
      strict_avoid_foods: member.strict_avoid_foods ?? [],
      diet_style: member.diet_style ?? "no_preference",
      macro_strategy: member.macro_strategy ?? "",
      is_active: member.is_active,
    });
    setAllergiesText((member.allergies ?? []).join(", "));
    setAvoidText((member.strict_avoid_foods ?? []).join(", "));
    setFormError(null);
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleFormField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleHealthCondition = (cond: string) => {
    setForm((prev) => ({
      ...prev,
      health_conditions: prev.health_conditions.includes(cond)
        ? prev.health_conditions.filter((c) => c !== cond)
        : [...prev.health_conditions, cond],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      ...form,
      allergies: allergiesText.split(",").map((s) => s.trim()).filter(Boolean),
      strict_avoid_foods: avoidText.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingMember?.id != null) {
        await updateFamilyMember(editingMember.id, payload);
      } else {
        await createFamilyMember(payload);
      }
      setShowForm(false);
      setEditingMember(null);
      await refreshFamily();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this family member? They will also be removed from the meal schedule.")) return;
    try {
      await deleteFamilyMember(id);
      await refreshFamily();
      // Refresh schedule (backend already cleaned it)
      const sched = await fetchFamilySchedule();
      if (sched) setSchedule(sched as Schedule);
    } catch { /* ignore */ }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  const todayKeys = collectTodayMembers(schedule);
  const todayType = todayScheduleType();

  return (
    <div className="max-w-4xl space-y-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Family Planning</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your household meal schedule and see today&apos;s food plan.
        </p>
      </div>

      {/* ── Meal Schedule Editor ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Meal Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Set who eats at home for weekdays and weekends. Used to auto-generate the grocery list.
          </p>
        </div>

        {allMembers.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No members found. <Link href="/profile" className="text-green-600 underline">Set up your profile</Link> first.
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {SCHEDULE_TYPES.map((st) => (
                <button
                  key={st}
                  onClick={() => setScheduleTab(st)}
                  className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                    scheduleTab === st
                      ? "border-green-500 text-green-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {SCHEDULE_LABELS[st]}
                  {st === todayType && (
                    <span className="ml-2 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">Today</span>
                  )}
                </button>
              ))}
            </div>

            {/* Meal slots */}
            <div className="p-5 space-y-4">
              {MEAL_TYPES.map((mt) => {
                const selected: string[] = schedule[scheduleTab]?.[mt] ?? [];
                return (
                  <div key={mt}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {MEAL_LABELS[mt]}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {allMembers.map((m) => {
                        const sel = selected.includes(m.member_key);
                        return (
                          <button
                            key={m.member_key}
                            type="button"
                            onClick={() => toggleScheduleMember(scheduleTab, mt, m.member_key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                              sel
                                ? "bg-green-50 border-green-300 text-green-800"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              sel ? "bg-green-500 border-green-500 text-white" : "border-gray-300 bg-white"
                            }`}>
                              {sel ? "✓" : ""}
                            </span>
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 pb-5 flex items-center gap-3">
              <button
                onClick={saveSchedule}
                disabled={scheduleSaving}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
              >
                {scheduleSaving ? "Saving…" : "Save Schedule"}
              </button>
              {scheduleSaved && (
                <span className="text-xs text-green-600 font-medium">✓ Saved</span>
              )}
              <Link href="/grocery-list" className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                View grocery list →
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ── Today's Household Food Plan ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Today&apos;s Household Food Plan
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {todayType === "weekday" ? "Weekday schedule" : "Weekend / holiday schedule"}
              {todayKeys.length > 0
                ? ` · ${todayKeys.length} member${todayKeys.length !== 1 ? "s" : ""} eating today`
                : " · No members scheduled for today"}
            </p>
          </div>
          {todayKeys.length > 0 && (
            <button
              onClick={() => generatePlan(todayKeys)}
              disabled={planLoading}
              className="text-xs text-green-600 hover:text-green-800 font-semibold disabled:text-green-300"
            >
              {planLoading ? "Generating…" : "Regenerate →"}
            </button>
          )}
        </div>

        {todayKeys.length === 0 && (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
            <p className="text-gray-500 text-sm">No members scheduled to eat at home today.</p>
            <p className="text-xs text-gray-400 mt-1">Update the meal schedule above to add members.</p>
          </div>
        )}

        {planError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
            {planError}
          </div>
        )}

        {planLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {!planLoading && plan && plan.meals.length > 0 && (
          <div className="space-y-6">
            {/* Conflict notes */}
            {plan.conflict_notes.length > 0 && (
              <div className="space-y-2">
                {plan.conflict_notes.map((note, i) => (
                  <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-orange-800">
                    <span className="shrink-0 font-bold">⚠</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Group meals by type */}
            {MEAL_TYPES.filter((mt) => plan.meals.some((m) => m.meal_type === mt)).map((mt) => {
              const mealsForSlot = plan.meals.filter((m) => m.meal_type === mt);
              return (
                <div key={mt}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${MEAL_TYPE_COLORS[mt] ?? "bg-gray-100 text-gray-600"}`}>
                      {MEAL_LABELS[mt]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {(schedule[todayType]?.[mt] ?? []).length} member{(schedule[todayType]?.[mt] ?? []).length !== 1 ? "s" : ""} eating
                    </span>
                  </div>

                  {/* Food item cards (ingredients from the meal) */}
                  {mealsForSlot.flatMap((meal) =>
                    (meal.ingredients ?? []).map((ing) => {
                      const cardKey = `${meal.meal_type}-${ing.inventory_item_id}`;
                      const eaten = cardKey in eatenState;
                      const eatingNow = eatenState[cardKey]?.loading;
                      const memberAllocs = meal.per_member_allocations ?? [];

                      return (
                        <div
                          key={cardKey}
                          className={`bg-white rounded-2xl shadow-sm border p-4 mb-3 transition-all ${
                            eaten ? "border-green-200 opacity-75" : "border-gray-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-gray-900 text-sm">{ing.name}</span>
                                <span className="text-xs text-gray-500">
                                  {ing.quantity_used} {ing.unit}
                                </span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[ing.expiration_risk] ?? RISK_STYLES.unknown}`}>
                                  {ing.expiration_risk}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 italic mb-2">{ing.reason}</p>

                              {/* Per-member portions */}
                              {memberAllocs.length > 0 && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedAlloc(expandedAlloc === cardKey ? null : cardKey)}
                                    className="text-xs text-green-600 hover:text-green-800 font-semibold mb-1"
                                  >
                                    {expandedAlloc === cardKey ? "▲ Hide" : "▼ Per-member"} portions
                                  </button>
                                  {expandedAlloc === cardKey && (
                                    <div className="space-y-1.5 mt-1">
                                      {memberAllocs.map((a) => (
                                        <div key={a.member_key} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                                          <span className="font-semibold text-gray-800">{a.member_name}:</span>
                                          <span className="text-gray-500 ml-1">{a.portion_guidance}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Eaten button */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <button
                                onClick={() => handleEaten(meal, ing)}
                                disabled={eaten || eatingNow}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                                  eaten
                                    ? "bg-green-100 text-green-600 cursor-default"
                                    : eatingNow
                                    ? "bg-gray-100 text-gray-400 cursor-wait"
                                    : "bg-green-600 hover:bg-green-700 text-white"
                                }`}
                              >
                                {eaten ? "✓ Eaten" : eatingNow ? "…" : "Eaten"}
                              </button>
                              {eaten && (
                                <button
                                  onClick={() => handleUndoEaten(cardKey)}
                                  className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!planLoading && plan && plan.meals.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <span className="text-2xl block mb-2">🎉</span>
            <p className="font-semibold text-green-700">Nutrition targets met for today!</p>
          </div>
        )}
      </section>

      {/* ── Family Members ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Family Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Your profile is managed in Profile settings</p>
          </div>
          <button
            onClick={openAddForm}
            className="shrink-0 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm"
          >
            + Add Member
          </button>
        </div>

        {(familyData?.additional_members ?? []).length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="text-4xl block mb-3">👨‍👩‍👧</span>
            <p className="font-medium text-gray-600 mb-1">No additional members yet</p>
            <p className="text-sm text-gray-400">Add family members to include in household meal planning.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(familyData?.additional_members ?? []).map((member) => (
              <div key={member.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-gray-900">{member.name}</span>
                    {member.relationship_label && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                        {member.relationship_label}
                      </span>
                    )}
                    {member.goal && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">
                        {member.goal.replace(/_/g, " ")}
                      </span>
                    )}
                    {!member.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">inactive</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {member.age && <span className="text-gray-400">Age {member.age}</span>}
                    {member.sex && <span className="text-gray-400 capitalize">· {member.sex}</span>}
                    {member.diet_style && member.diet_style !== "no_preference" && (
                      <span className="text-gray-400 capitalize">· {member.diet_style.replace(/_/g, " ")}</span>
                    )}
                  </div>
                  {member.health_conditions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {member.health_conditions.map((c) => (
                        <span key={c} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full capitalize">
                          {c.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  {member.allergies.length > 0 && (
                    <p className="text-xs text-orange-600 mt-1">Allergies: {member.allergies.join(", ")}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEditForm(member)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  {member.id != null && (
                    <button
                      onClick={() => handleDelete(member.id!)}
                      className="text-xs text-red-400 hover:text-red-600 font-semibold border border-red-100 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Add / Edit Member Form ──────────────────────────────────────────── */}
      {showForm && (
        <div ref={formRef}>
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-base">
                {editingMember ? `Edit: ${editingMember.name}` : "Add Family Member"}
              </h2>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingMember(null); }}
                className="text-gray-400 hover:text-gray-600 text-sm font-medium"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => handleFormField("name", e.target.value)}
                  placeholder="e.g. Jane"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Relationship</label>
                <select
                  value={form.relationship_label ?? "spouse"}
                  onChange={(e) => handleFormField("relationship_label", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {["spouse", "parent", "child", "roommate", "other", "self"].map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal</label>
                <select
                  value={form.goal ?? "maintenance"}
                  onChange={(e) => handleFormField("goal", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {[["fat_loss", "Fat Loss"], ["muscle_gain", "Muscle Gain"], ["maintenance", "Maintenance"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sex</label>
                <select
                  value={form.sex ?? "male"}
                  onChange={(e) => handleFormField("sex", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {["male", "female", "other"].map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity Level</label>
                <select
                  value={form.activity_level ?? "moderate"}
                  onChange={(e) => handleFormField("activity_level", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {[
                    ["sedentary", "Sedentary"], ["light", "Light"], ["moderate", "Moderate"],
                    ["active", "Active"], ["very_active", "Very Active"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Diet Style</label>
                <select
                  value={form.diet_style ?? "no_preference"}
                  onChange={(e) => handleFormField("diet_style", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {[
                    ["high_protein", "High Protein"], ["balanced", "Balanced"],
                    ["low_carb", "Low Carb"], ["low_fat", "Low Fat"], ["no_preference", "No Preference"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Age</label>
                <input
                  type="number" min="1" max="120"
                  value={form.age ?? ""}
                  onChange={(e) => handleFormField("age", e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="e.g. 35"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Weight (kg)</label>
                <input
                  type="number" step="0.1" min="1"
                  value={form.weight_kg ?? ""}
                  onChange={(e) => handleFormField("weight_kg", e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="e.g. 65"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Height (cm)</label>
                <input
                  type="number" step="0.1" min="1"
                  value={form.height_cm ?? ""}
                  onChange={(e) => handleFormField("height_cm", e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="e.g. 165"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Health Conditions</label>
              <div className="flex flex-wrap gap-2">
                {HEALTH_CONDITIONS.map((cond) => {
                  const checked = form.health_conditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleHealthCondition(cond)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        checked
                          ? "bg-red-100 text-red-700 border-red-300"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {cond.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Allergies</label>
                <input
                  value={allergiesText}
                  onChange={(e) => setAllergiesText(e.target.value)}
                  placeholder="e.g. peanuts, shellfish (comma-separated)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Strict Avoid Foods</label>
                <input
                  value={avoidText}
                  onChange={(e) => setAvoidText(e.target.value)}
                  placeholder="e.g. pork, alcohol (comma-separated)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => handleFormField("is_active", e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active member (included in meal planning)</label>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
              >
                {saving ? "Saving…" : editingMember ? "Save Changes" : "Add Member"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingMember(null); refreshFamily(); }}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
