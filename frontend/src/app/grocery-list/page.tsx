"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchGroceryList,
  fetchFamily,
  fetchFamilyGroceryList,
  fetchFamilySchedule,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type HouseholdNutritionSummary = {
  combined_weekly_targets: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  individual_weekly_needs: Record<
    string,
    {
      name: string;
      days_at_home: number;
      weekly_calories: number;
      weekly_protein_g: number;
      weekly_carbs_g: number;
      weekly_fat_g: number;
    }
  >;
  all_excluded_foods: string[];
};

type FamilyGroceryList = {
  recommended_to_buy: GroceryItem[];
  avoid_buying: { name: string; reason: string }[];
  use_first: { name: string; reason: string }[];
  household_nutrition_summary: HouseholdNutritionSummary;
  member_specific_notes: string[];
  conflict_notes: string[];
  inventory_summary?: {
    total_items: number;
    urgent_count: number;
    medium_risk_count: number;
    low_stock_count: number;
    categories_present: string[];
  };
};

type MemberSimple = {
  member_key: string;
  name: string;
};

type Schedule = Record<string, Record<string, string[]>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:    "bg-gray-100 text-gray-600 border border-gray-200",
};

const CATEGORY_EMOJI: Record<string, string> = {
  meat:      "🥩",
  vegetable: "🥦",
  fruit:     "🍎",
  dairy:     "🥛",
  grain:     "🌾",
  snack:     "🥜",
  condiment: "🫙",
  other:     "🍳",
};

function computeDaysAtHome(
  schedule: Schedule,
  holidayMode: boolean,
): Record<string, number> {
  const days: Record<string, number> = {};
  const scheduleTypes = holidayMode
    ? (["weekend_holiday"] as const)
    : (["weekday", "weekend_holiday"] as const);
  const multipliers = holidayMode
    ? { weekend_holiday: 7 }
    : { weekday: 5, weekend_holiday: 2 };

  for (const st of scheduleTypes) {
    const meals = schedule[st] ?? {};
    const mult = multipliers[st as keyof typeof multipliers] ?? 0;
    for (const keys of Object.values(meals)) {
      for (const k of keys) {
        days[k] = (days[k] ?? 0) + mult;
      }
    }
  }
  // cap at 7
  for (const k of Object.keys(days)) {
    days[k] = Math.min(days[k], 7);
  }
  return days;
}

function collectMemberKeys(schedule: Schedule): string[] {
  const keys = new Set<string>();
  for (const meals of Object.values(schedule)) {
    for (const mkeys of Object.values(meals)) {
      mkeys.forEach((k) => keys.add(k));
    }
  }
  return Array.from(keys);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GroceryListPage() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Family + schedule state
  const [allMembers, setAllMembers] = useState<MemberSimple[]>([]);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [holidayMode, setHolidayMode] = useState(false);
  const [familyList, setFamilyList] = useState<FamilyGroceryList | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  const hasFamilySchedule =
    Object.keys(schedule).length > 0 &&
    collectMemberKeys(schedule).length > 0;

  useEffect(() => {
    fetchGroceryList()
      .then((data) => {
        if (!data) setError("Could not load grocery list.");
        else setList(data);
      })
      .catch(() => setError("Backend not reachable."))
      .finally(() => setLoading(false));

    // Load family data + schedule
    Promise.all([fetchFamily(), fetchFamilySchedule()]).then(
      ([fd, sched]) => {
        if (fd) {
          const members: MemberSimple[] = [
            fd.primary_member,
            ...(fd.additional_members ?? []),
          ];
          setAllMembers(members);
        }
        if (sched) setSchedule(sched as Schedule);
      }
    );
  }, []);

  // Auto-generate family grocery list when schedule / holidayMode changes
  useEffect(() => {
    if (!hasFamilySchedule) return;
    const memberKeys = collectMemberKeys(schedule);
    const daysAtHome = computeDaysAtHome(schedule, holidayMode);
    setFamilyLoading(true);
    setFamilyError(null);
    fetchFamilyGroceryList(memberKeys, daysAtHome)
      .then((data) => setFamilyList(data as FamilyGroceryList))
      .catch((err) => setFamilyError(String(err)))
      .finally(() => setFamilyLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, holidayMode, hasFamilySchedule]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-2xl w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Weekly Grocery List</h1>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
          <p className="font-semibold mb-1">{error ?? "Something went wrong."}</p>
          <p className="text-sm">
            Make sure the backend is running and you have{" "}
            <Link href="/profile" className="underline font-medium">set up your profile</Link>.
          </p>
        </div>
      </div>
    );
  }

  const { recommended_to_buy, avoid_buying, nutrition_gap_summary, inventory_summary } = list;

  return (
    <div className="max-w-4xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Grocery List</h1>
          <p className="text-gray-500 text-sm mt-1">
            {hasFamilySchedule
              ? "Household recommendations based on your attendance schedule."
              : "Personalised recommendations based on your inventory, nutrition targets, and food preferences."}
          </p>
        </div>
        {hasFamilySchedule && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-sm font-semibold shrink-0">
            <button
              onClick={() => setHolidayMode(false)}
              className={`px-4 py-2 rounded-md transition-colors ${!holidayMode ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
            >
              Normal Week
            </button>
            <button
              onClick={() => setHolidayMode(true)}
              className={`px-4 py-2 rounded-md transition-colors ${holidayMode ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
            >
              Holiday Week
            </button>
          </div>
        )}
      </div>

      {/* ── Household Grocery List (schedule-driven) ───────────────────── */}
      {hasFamilySchedule && (
        <div className="space-y-5">
          {familyLoading && (
            <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          )}

          {familyError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
              {familyError}
            </div>
          )}

          {!familyLoading && familyList && (
            <>
              {/* Household nutrition summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
                <h2 className="font-semibold text-blue-900 text-sm">
                  Household Weekly Nutrition{" "}
                  <span className="font-normal text-blue-600">
                    ({holidayMode ? "Holiday Week — all 7 days" : "Normal Week — weekday ×5 + weekend ×2"})
                  </span>
                </h2>

                {/* Combined targets */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Calories", value: familyList.household_nutrition_summary.combined_weekly_targets.calories, unit: "kcal" },
                    { label: "Protein",  value: familyList.household_nutrition_summary.combined_weekly_targets.protein_g, unit: "g" },
                    { label: "Carbs",    value: familyList.household_nutrition_summary.combined_weekly_targets.carbs_g, unit: "g" },
                    { label: "Fat",      value: familyList.household_nutrition_summary.combined_weekly_targets.fat_g, unit: "g" },
                  ].map((m) => (
                    <div key={m.label} className="bg-white rounded-xl p-3 text-center border border-blue-100">
                      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">{m.label}</div>
                      <div className="font-bold text-blue-900">{m.value} {m.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Per-member breakdown */}
                {Object.keys(familyList.household_nutrition_summary.individual_weekly_needs).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Per Member</p>
                    <div className="space-y-2">
                      {Object.entries(familyList.household_nutrition_summary.individual_weekly_needs).map(
                        ([key, info]) => {
                          const member = allMembers.find((m) => m.member_key === key);
                          return (
                            <div key={key} className="bg-white rounded-xl px-4 py-2.5 border border-blue-100 text-sm flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{member?.name ?? info.name}</span>
                                <span className="text-xs text-gray-400">({info.days_at_home} days)</span>
                              </div>
                              <div className="flex gap-3 text-xs text-gray-500">
                                <span className="font-medium text-gray-700">{info.weekly_calories} kcal</span>
                                <span>{info.weekly_protein_g}g P</span>
                                <span>{info.weekly_carbs_g}g C</span>
                                <span>{info.weekly_fat_g}g F</span>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* Excluded foods */}
                {familyList.household_nutrition_summary.all_excluded_foods.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">Excluded from all meals</p>
                    <div className="flex flex-wrap gap-1.5">
                      {familyList.household_nutrition_summary.all_excluded_foods.map((food) => (
                        <span key={food} className="text-xs bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-full">
                          {food}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Conflict notes */}
              {familyList.conflict_notes.length > 0 && (
                <div className="space-y-2">
                  {familyList.conflict_notes.map((note, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-orange-800">
                      <span className="shrink-0 font-bold">⚠</span>
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Buy this week */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span>
                    <h2 className="font-semibold text-gray-800 text-sm">Buy This Week</h2>
                    <span className="ml-auto text-xs text-gray-400">{familyList.recommended_to_buy.length} items</span>
                  </div>
                  {familyList.recommended_to_buy.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">Nothing to buy this week.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {familyList.recommended_to_buy.map((item, i) => (
                        <div key={i} className="px-5 py-3 flex items-start gap-3">
                          <span className="text-xl shrink-0 mt-0.5">{CATEGORY_EMOJI[item.category] ?? "🛒"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{item.name}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                                {item.priority}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Use first */}
                <section className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-orange-100 flex items-center gap-2">
                    <span className="text-orange-500 font-bold">⚡</span>
                    <h2 className="font-semibold text-gray-800 text-sm">Use First</h2>
                    <span className="ml-auto text-xs text-gray-400">{(familyList.use_first ?? []).length} items</span>
                  </div>
                  {(familyList.use_first ?? []).length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">Nothing urgent.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {(familyList.use_first ?? []).map((item, i) => (
                        <div key={i} className="px-5 py-3">
                          <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Member-specific notes */}
              {familyList.member_specific_notes.length > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h2 className="font-semibold text-gray-700 text-sm mb-3">Member-Specific Notes</h2>
                  <div className="space-y-2">
                    {familyList.member_specific_notes.map((note, i) => (
                      <p key={i} className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
                        {note}
                      </p>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Divider before personal section */}
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Your personal snapshot</p>
          </div>
        </div>
      )}

      {/* ── No schedule yet ────────────────────────────────────────────── */}
      {!hasFamilySchedule && allMembers.length > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-sm text-blue-700">
          Set up a <Link href="/family" className="underline font-semibold">meal attendance schedule</Link> to get household-wide grocery recommendations.
        </div>
      )}

      {/* ── Personal grocery list ──────────────────────────────────────── */}

      {/* Inventory snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Items",  value: inventory_summary.total_items,       color: "text-gray-900",   bg: "bg-white" },
          { label: "Urgent",       value: inventory_summary.urgent_count,       color: "text-red-600",    bg: "bg-red-50 border-red-100" },
          { label: "Medium Risk",  value: inventory_summary.medium_risk_count,  color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-100" },
          { label: "Low Stock",    value: inventory_summary.low_stock_count,    color: "text-blue-700",   bg: "bg-blue-50 border-blue-100" },
        ].map((item) => (
          <div key={item.label} className={`rounded-2xl shadow-sm border border-gray-100 p-5 text-center ${item.bg}`}>
            <div className={`text-3xl font-bold mb-1 ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Nutrition insight */}
      <div className={`rounded-2xl p-5 border text-sm flex items-start gap-3 ${
        nutrition_gap_summary.protein_low_in_inventory
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-blue-50 border-blue-200 text-blue-800"
      }`}>
        <span className="text-xl shrink-0 mt-0.5">
          {nutrition_gap_summary.protein_low_in_inventory ? "⚠" : "ℹ"}
        </span>
        <div>
          <p className="font-semibold mb-1">Nutrition Insight</p>
          <p className="leading-relaxed">{nutrition_gap_summary.analysis}</p>
          {nutrition_gap_summary.protein_low_in_inventory && (
            <p className="font-semibold mt-2">Protein stock is low — restock soon.</p>
          )}
        </div>
      </div>

      {/* Two column: Buy + Avoid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Recommended to Buy */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-green-500 font-bold text-lg">✓</span>
            <h2 className="font-semibold text-gray-800">Buy This Week</h2>
            <span className="ml-auto text-xs text-gray-400 font-medium">{recommended_to_buy.length} items</span>
          </div>

          {recommended_to_buy.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-2">🛍️</span>
              <p className="text-green-700 font-semibold">Pantry looks great!</p>
              <p className="text-sm text-gray-400 mt-1">No urgent purchases this week.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recommended_to_buy.map((item, i) => (
                <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{CATEGORY_EMOJI[item.category] ?? "🛒"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-gray-900">{item.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                        {item.priority}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{item.category}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Use Before Buying More */}
        <section className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-orange-100 flex items-center gap-2">
            <span className="text-orange-500 font-bold text-lg">⚠</span>
            <h2 className="font-semibold text-gray-800">Use Before Buying More</h2>
            <span className="ml-auto text-xs text-gray-400 font-medium">{avoid_buying.length} items</span>
          </div>

          {avoid_buying.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-2">✅</span>
              <p className="text-green-700 font-semibold">Nothing to flag!</p>
              <p className="text-sm text-gray-400 mt-1">All items are safe to restock.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {avoid_buying.map((item, i) => (
                <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                  <span className="text-orange-400 font-bold shrink-0 mt-0.5 text-lg">•</span>
                  <div>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 leading-snug mt-0.5">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Categories in stock */}
      {inventory_summary.categories_present.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Currently in Stock</h2>
          <div className="flex flex-wrap gap-2">
            {inventory_summary.categories_present.map((cat) => (
              <span
                key={cat}
                className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-sm font-medium rounded-full px-3 py-1.5"
              >
                {CATEGORY_EMOJI[cat] ?? "•"} {cat}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Footer links */}
      <div className="flex gap-6 text-sm pb-2">
        <Link href="/inventory" className="text-green-600 hover:text-green-800 font-semibold underline">
          Manage Inventory →
        </Link>
        <Link href="/family" className="text-green-600 hover:text-green-800 font-semibold underline">
          Edit Meal Schedule →
        </Link>
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 font-medium underline">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
