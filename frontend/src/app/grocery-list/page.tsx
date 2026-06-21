"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGroceryList, fetchFamily, fetchFamilyGroceryList } from "@/lib/api";

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

type FamilyMemberSimple = {
  id?: number;
  member_key: string;
  name: string;
};

type FamilyData = {
  primary_member: FamilyMemberSimple;
  additional_members: FamilyMemberSimple[];
};

type FamilyGroceryList = {
  recommended_to_buy: GroceryItem[];
  avoid_buying: { name: string; reason: string }[];
  use_first: { name: string; reason: string }[];
  household_nutrition_summary: string;
  member_specific_notes: Record<string, string>;
  conflict_notes: string[];
  inventory_summary?: {
    total_items: number;
    urgent_count: number;
    medium_risk_count: number;
    low_stock_count: number;
    categories_present: string[];
  };
};

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

export default function GroceryListPage() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode toggle: personal vs family
  const [mode, setMode] = useState<"personal" | "family">("personal");

  // Family state
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [familySelections, setFamilySelections] = useState<string[]>([]);
  const [daysAtHome, setDaysAtHome] = useState<Record<string, number>>({});
  const [familyList, setFamilyList] = useState<FamilyGroceryList | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroceryList()
      .then((data) => {
        if (!data) setError("Could not load grocery list.");
        else setList(data);
      })
      .catch(() => setError("Backend not reachable."))
      .finally(() => setLoading(false));
    // Load family data
    fetchFamily().then((fd) => {
      if (fd) {
        setFamilyData(fd as FamilyData);
        // Restore selections from localStorage
        const stored = localStorage.getItem("familySelections");
        if (stored) {
          try {
            const keys = JSON.parse(stored) as string[];
            setFamilySelections(keys);
            // init daysAtHome to 7 for each key
            const d: Record<string, number> = {};
            keys.forEach((k: string) => { d[k] = 7; });
            setDaysAtHome(d);
          } catch { /* ignore */ }
        }
      }
    });
  }, []);

  const allFamilyMembers: FamilyMemberSimple[] = familyData
    ? [familyData.primary_member, ...familyData.additional_members]
    : [];

  const toggleFamilyMember = (key: string) => {
    setFamilySelections((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem("familySelections", JSON.stringify(next));
      // init days at home
      if (!prev.includes(key)) {
        setDaysAtHome((d) => ({ ...d, [key]: d[key] ?? 7 }));
      }
      return next;
    });
  };

  const handleGenerateFamilyList = async () => {
    if (familySelections.length === 0) return;
    setFamilyLoading(true);
    setFamilyError(null);
    try {
      const data = await fetchFamilyGroceryList(familySelections, daysAtHome);
      setFamilyList(data as FamilyGroceryList);
    } catch (err) {
      setFamilyError(String(err));
    } finally {
      setFamilyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-2xl w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Grocery List</h1>
        </div>
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
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Grocery List</h1>
          <p className="text-gray-500 text-sm mt-1">
            Personalised recommendations based on your inventory, nutrition targets, and food preferences.
          </p>
        </div>
        {/* Mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-sm font-semibold shrink-0">
          <button
            onClick={() => setMode("personal")}
            className={`px-4 py-2 rounded-md transition-colors ${mode === "personal" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            Personal
          </button>
          <button
            onClick={() => setMode("family")}
            className={`px-4 py-2 rounded-md transition-colors ${mode === "family" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            Family
          </button>
        </div>
      </div>

      {/* ── Family Mode ────────────────────────────────────────────────── */}
      {mode === "family" && (
        <div className="space-y-5">
          {/* Member selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">Select Household Members</h2>
            {allFamilyMembers.length === 0 ? (
              <p className="text-sm text-gray-400">
                No family members found. <Link href="/family" className="text-green-600 underline">Add members in Family</Link> first.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {allFamilyMembers.map((member) => {
                    const sel = familySelections.includes(member.member_key);
                    return (
                      <div key={member.member_key} className={`rounded-xl border p-3 transition-all ${sel ? "border-green-400 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
                        <button
                          type="button"
                          onClick={() => toggleFamilyMember(member.member_key)}
                          className="flex items-center gap-2 w-full text-left mb-2"
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0 ${sel ? "bg-green-500 border-green-500 text-white" : "border-gray-300 bg-white"}`}>
                            {sel ? "✓" : ""}
                          </span>
                          <span className="font-medium text-sm text-gray-900">{member.name}</span>
                          {member.member_key === "primary" && (
                            <span className="text-xs text-gray-400">(you)</span>
                          )}
                        </button>
                        {sel && (
                          <div className="ml-6">
                            <label className="text-xs text-gray-500 block mb-1">Days at home this week</label>
                            <input
                              type="number" min="0" max="7"
                              value={daysAtHome[member.member_key] ?? 7}
                              onChange={(e) => setDaysAtHome((d) => ({ ...d, [member.member_key]: parseInt(e.target.value) || 0 }))}
                              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleGenerateFamilyList}
                  disabled={familySelections.length === 0 || familyLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
                >
                  {familyLoading ? "Generating…" : "Generate Family List"}
                </button>
              </div>
            )}
          </div>

          {familyError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">{familyError}</div>
          )}

          {familyList && (
            <div className="space-y-5">
              {/* Household summary */}
              {familyList.household_nutrition_summary && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-sm text-blue-800">
                  <p className="font-semibold mb-1">Nutrition Summary</p>
                  <p>{familyList.household_nutrition_summary}</p>
                </div>
              )}

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
                {/* Recommended to buy */}
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
                    <div className="p-6 text-center text-sm text-gray-400">Nothing urgent to use first.</div>
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
              {familyList.member_specific_notes && Object.keys(familyList.member_specific_notes).length > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h2 className="font-semibold text-gray-700 text-sm mb-3">Member-Specific Notes</h2>
                  <div className="space-y-2">
                    {Object.entries(familyList.member_specific_notes).map(([key, note]) => {
                      const member = allFamilyMembers.find((m) => m.member_key === key);
                      return (
                        <div key={key} className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
                          <p className="font-semibold text-gray-800 mb-0.5">{member?.name ?? key}</p>
                          <p className="text-gray-600">{note}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Personal Mode ─────────────────────────────────────────────── */}
      {mode === "personal" && <>

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
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 font-medium underline">
          ← Back to Dashboard
        </Link>
      </div>

      </>}
    </div>
  );
}
