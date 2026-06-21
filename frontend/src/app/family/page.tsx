"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchFamily,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  fetchFamilyMealPlan,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────

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

type FamilyPlan = {
  selected_members: FamilyMemberData[];
  individual_adjusted_targets: Record<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  combined_household_targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  meals: FamilyMeal[];
  conflict_notes: string[];
  health_and_allergy_notes: string[];
  recommendation_summary: string;
};

type FamilyMeal = {
  name: string;
  meal_type: string;
  cuisine?: string;
  cooking_time_minutes?: number;
  estimated_macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  per_member_allocations?: PerMemberAllocation[];
  instructions?: string[];
  ingredients?: unknown[];
  score?: number;
};

type PerMemberAllocation = {
  member_key: string;
  member_name: string;
  estimated_macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  portion_guidance: string;
  reason: string;
};

type FamilyData = {
  household: unknown;
  primary_member: FamilyMemberData;
  additional_members: FamilyMemberData[];
};

// ── Constants ─────────────────────────────────────────────────────────────

const HEALTH_CONDITIONS = [
  "fatty_liver", "diabetes", "prediabetes", "high_cholesterol",
  "hypertension", "kidney_disease", "lactose_intolerance",
  "gluten_sensitivity", "gout", "celiac",
];

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700",
  lunch:     "bg-green-100 text-green-700",
  dinner:    "bg-blue-100 text-blue-700",
  snack:     "bg-purple-100 text-purple-700",
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

// ── Helper components ─────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────

export default function FamilyPage() {
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<FamilyPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMemberData | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [allergiesText, setAllergiesText] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

  // Load family on mount; restore selections from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("familySelections");
    if (stored) {
      try { setSelectedKeys(JSON.parse(stored)); } catch { /* ignore */ }
    }
    fetchFamily().then((data) => {
      if (data) setFamilyData(data as FamilyData);
      setLoading(false);
    });
  }, []);

  // Persist selections
  useEffect(() => {
    localStorage.setItem("familySelections", JSON.stringify(selectedKeys));
  }, [selectedKeys]);

  const allMembers: FamilyMemberData[] = familyData
    ? [familyData.primary_member, ...familyData.additional_members]
    : [];

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleGeneratePlan = async () => {
    if (selectedKeys.length === 0) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    try {
      const data = await fetchFamilyMealPlan(selectedKeys);
      setPlan(data as FamilyPlan);
    } catch (err) {
      setPlanError(String(err));
    } finally {
      setPlanLoading(false);
    }
  };

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
      const data = await fetchFamily();
      if (data) setFamilyData(data as FamilyData);
    } catch (err) {
      setFormError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this family member?")) return;
    try {
      await deleteFamilyMember(id);
      const data = await fetchFamily();
      if (data) setFamilyData(data as FamilyData);
    } catch { /* ignore */ }
  };

  const refreshFamily = useCallback(async () => {
    const data = await fetchFamily();
    if (data) setFamilyData(data as FamilyData);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Family Planning</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage household members and generate family-aware meal plans.
        </p>
      </div>

      {/* ── Who is Eating Today? ──────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Who is Eating Today?</h2>
          <p className="text-xs text-gray-400 mt-0.5">Select members to include in the family meal plan</p>
        </div>

        {allMembers.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No family members found. <Link href="/profile" className="text-green-600 underline">Set up your profile</Link> first, then add family members below.
          </div>
        ) : (
          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {allMembers.map((member) => {
              const selected = selectedKeys.includes(member.member_key);
              return (
                <button
                  key={member.member_key}
                  type="button"
                  onClick={() => toggleKey(member.member_key)}
                  className={`text-left rounded-xl border p-3.5 transition-all ${
                    selected
                      ? "border-green-400 bg-green-50 ring-1 ring-green-300"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0 ${
                      selected ? "bg-green-500 border-green-500 text-white" : "border-gray-300 bg-white"
                    }`}>
                      {selected ? "✓" : ""}
                    </span>
                    <span className="font-semibold text-gray-900 text-sm">{member.name}</span>
                    {member.member_key === "primary" && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">You</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 ml-6">
                    {member.goal && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                        {member.goal.replace(/_/g, " ")}
                      </span>
                    )}
                    {member.diet_style && member.diet_style !== "no_preference" && (
                      <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full capitalize">
                        {member.diet_style.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleGeneratePlan}
            disabled={selectedKeys.length === 0 || planLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
          >
            {planLoading ? "Generating…" : "Generate Family Meal Plan"}
          </button>
          {selectedKeys.length > 0 && (
            <span className="text-xs text-gray-400">{selectedKeys.length} member{selectedKeys.length !== 1 ? "s" : ""} selected</span>
          )}
          {selectedKeys.length === 0 && (
            <span className="text-xs text-gray-400">Select at least one member</span>
          )}
        </div>
      </section>

      {/* ── Plan Error ───────────────────────────────────────────────── */}
      {planError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          {planError}
        </div>
      )}

      {/* ── Family Meal Plan Results ──────────────────────────────────── */}
      {plan && (
        <section className="space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Family Meal Plan</h2>

          {/* Summary */}
          {plan.recommendation_summary && (
            <p className="text-sm text-gray-600 italic bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              {plan.recommendation_summary}
            </p>
          )}

          {/* Conflict notes */}
          {plan.conflict_notes.length > 0 && (
            <div className="space-y-2">
              {plan.conflict_notes.map((note, i) => (
                <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-orange-800">
                  <span className="shrink-0 font-bold">⚠</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Health/allergy notes */}
          {plan.health_and_allergy_notes.length > 0 && (
            <div className="space-y-2">
              {plan.health_and_allergy_notes.map((note, i) => (
                <div key={i} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-blue-800">
                  <span className="shrink-0">ℹ</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Individual targets */}
          {Object.keys(plan.individual_adjusted_targets).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700 text-sm">Individual Adjusted Targets</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Member</th>
                      <th className="px-4 py-3 text-center">Calories</th>
                      <th className="px-4 py-3 text-center">Protein</th>
                      <th className="px-4 py-3 text-center">Carbs</th>
                      <th className="px-4 py-3 text-center">Fat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {plan.selected_members.map((m) => {
                      const t = plan.individual_adjusted_targets[m.member_key];
                      return t ? (
                        <tr key={m.member_key} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{t.calories} kcal</td>
                          <td className="px-4 py-3 text-center text-blue-600">{t.protein_g}g</td>
                          <td className="px-4 py-3 text-center text-yellow-600">{t.carbs_g}g</td>
                          <td className="px-4 py-3 text-center text-red-500">{t.fat_g}g</td>
                        </tr>
                      ) : null;
                    })}
                    {/* Combined household row */}
                    <tr className="bg-green-50 font-semibold">
                      <td className="px-4 py-3 text-green-800">Combined Household</td>
                      <td className="px-4 py-3 text-center text-green-700">{plan.combined_household_targets.calories} kcal</td>
                      <td className="px-4 py-3 text-center text-green-700">{plan.combined_household_targets.protein_g}g</td>
                      <td className="px-4 py-3 text-center text-green-700">{plan.combined_household_targets.carbs_g}g</td>
                      <td className="px-4 py-3 text-center text-green-700">{plan.combined_household_targets.fat_g}g</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Meals */}
          {plan.meals.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Recommended Meals</h3>
              {plan.meals.map((meal, idx) => {
                const mealKey = `${meal.meal_type}-${idx}`;
                const expanded = expandedMeal === mealKey;
                const mealTypeColor = MEAL_TYPE_COLORS[meal.meal_type] ?? "bg-gray-100 text-gray-600";
                return (
                  <div key={mealKey} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${mealTypeColor}`}>
                          {meal.meal_type}
                        </span>
                        {meal.cuisine && (
                          <span className="text-xs text-gray-400">{meal.cuisine}</span>
                        )}
                        {meal.cooking_time_minutes && (
                          <span className="text-xs text-gray-400">· {meal.cooking_time_minutes} min</span>
                        )}
                      </div>
                      {meal.score != null && (
                        <span className="text-xs font-medium text-gray-400">Score: {meal.score}/100</span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-gray-900 mb-3">{meal.name}</h3>

                    {/* Combined macros */}
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-1.5">Combined household macros</p>
                      <MacroPills macros={meal.estimated_macros} />
                    </div>

                    {/* Per-member allocations */}
                    {meal.per_member_allocations && meal.per_member_allocations.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Per-Member Portions</p>
                        {meal.per_member_allocations.map((alloc) => (
                          <div key={alloc.member_key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="font-medium text-sm text-gray-800">{alloc.member_name}</span>
                              <span className="text-xs text-gray-500 text-right">{alloc.portion_guidance}</span>
                            </div>
                            <MacroPills macros={alloc.estimated_macros} />
                            {alloc.reason && (
                              <p className="text-xs text-gray-400 mt-1.5 italic">{alloc.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Instructions toggle */}
                    {meal.instructions && meal.instructions.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpandedMeal(expanded ? null : mealKey)}
                          className="text-xs text-green-600 hover:text-green-800 font-semibold flex items-center gap-1 mb-2 transition-colors"
                        >
                          {expanded ? "▲ Hide" : "▼ Show"} cooking instructions
                        </button>
                        {expanded && (
                          <ol className="space-y-1.5 pl-4 list-decimal marker:text-green-500">
                            {meal.instructions.map((step, i) => (
                              <li key={i} className="text-xs text-gray-600 leading-relaxed pl-1">{step}</li>
                            ))}
                          </ol>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Family Members ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Family Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Additional household members (your own profile is managed in Profile settings)</p>
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
            <p className="text-sm text-gray-400">Add family members to generate household meal plans.</p>
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
                    <p className="text-xs text-orange-600 mt-1">
                      Allergies: {member.allergies.join(", ")}
                    </p>
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

      {/* ── Add / Edit Member Form ────────────────────────────────────── */}
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

            {/* Basic info */}
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
                    ["sedentary", "Sedentary"],
                    ["light", "Light"],
                    ["moderate", "Moderate"],
                    ["active", "Active"],
                    ["very_active", "Very Active"],
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
                    ["high_protein", "High Protein"],
                    ["balanced", "Balanced"],
                    ["low_carb", "Low Carb"],
                    ["low_fat", "Low Fat"],
                    ["no_preference", "No Preference"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Numbers */}
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

            {/* Health conditions */}
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

            {/* Allergies + avoid */}
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

            {/* Active toggle */}
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
