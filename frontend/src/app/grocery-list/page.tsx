"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGroceryList } from "@/lib/api";

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

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:    "bg-gray-100 text-gray-600 border border-gray-200",
};

const CATEGORY_EMOJI: Record<string, string> = {
  meat: "🥩",
  vegetable: "🥦",
  fruit: "🍎",
  dairy: "🥛",
  grain: "🌾",
  snack: "🥜",
  condiment: "🫙",
  other: "🍳",
};

export default function GroceryListPage() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroceryList()
      .then((data) => {
        if (!data) setError("Could not load grocery list. Make sure your profile and backend are running.");
        else setList(data);
      })
      .catch(() => setError("Backend not reachable."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading grocery list…</div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
          {error ?? "Something went wrong."}{" "}
          <Link href="/profile" className="underline font-medium">Set up your profile</Link> first.
        </div>
      </div>
    );
  }

  const { recommended_to_buy, avoid_buying, nutrition_gap_summary, inventory_summary } = list;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Grocery List</h1>
        <p className="text-gray-500 mt-1">
          Personalised recommendations based on your inventory, nutrition targets, and preferences.
        </p>
      </div>

      {/* ── Inventory snapshot ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Items", value: inventory_summary.total_items, color: "text-gray-700" },
          { label: "Urgent",      value: inventory_summary.urgent_count, color: "text-red-500" },
          { label: "Medium Risk", value: inventory_summary.medium_risk_count, color: "text-yellow-600" },
          { label: "Low Stock",   value: inventory_summary.low_stock_count, color: "text-blue-500" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
            <div className={`text-3xl font-bold mb-1 ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── Nutrition insight ───────────────────────────────────────── */}
      <div className={`rounded-xl p-4 border text-sm ${
        nutrition_gap_summary.protein_low_in_inventory
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-blue-50 border-blue-200 text-blue-800"
      }`}>
        <span className="font-semibold">Nutrition insight: </span>
        {nutrition_gap_summary.analysis}
        {nutrition_gap_summary.protein_low_in_inventory && (
          <span className="ml-1 font-semibold"> ⚠ Protein stock is low — restock soon.</span>
        )}
      </div>

      {/* ── Buy this week ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Recommended to Buy
          <span className="text-sm font-normal text-gray-400 ml-2">({recommended_to_buy.length} items)</span>
        </h2>
        {recommended_to_buy.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-green-700">
            Your pantry looks well stocked — no urgent purchases this week!
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {recommended_to_buy.map((item, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-4">
                <span className="text-2xl shrink-0">{CATEGORY_EMOJI[item.category] ?? "🛒"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                      {item.priority}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{item.category}</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-snug">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Use before buying more ──────────────────────────────────── */}
      {avoid_buying.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            Use Before Buying More
            <span className="text-sm font-normal text-gray-400 ml-2">({avoid_buying.length} items)</span>
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 divide-y divide-gray-100">
            {avoid_buying.map((item, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-3">
                <span className="text-orange-400 font-bold shrink-0 mt-0.5">⚠</span>
                <div>
                  <span className="font-semibold text-gray-900">{item.name}</span>
                  <p className="text-sm text-gray-500 leading-snug mt-0.5">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Categories in stock ─────────────────────────────────────── */}
      {inventory_summary.categories_present.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-600 mb-3">Currently in Stock</h2>
          <div className="flex flex-wrap gap-2">
            {inventory_summary.categories_present.map((cat) => (
              <span key={cat} className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-sm rounded-full px-3 py-1">
                {CATEGORY_EMOJI[cat] ?? "•"} {cat}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/inventory" className="text-green-600 hover:text-green-800 underline font-medium">
          Manage Inventory →
        </Link>
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 underline font-medium">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
