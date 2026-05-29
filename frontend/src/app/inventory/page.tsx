"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchInventory, createInventoryItem, deleteInventoryItem, discardInventoryItem, searchFoods } from "@/lib/api";

type InventoryItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  zone: string;
  category: string;
  added_date: string | null;
  best_before_date: string | null;
  calories_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  notes: string | null;
  expiration_risk: string;
};

type FoodSuggestion = {
  id: number;
  name: string;
  aliases: string[];
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  category: string;
};

type DiscardState = { itemId: number; reason: string; busy: boolean } | null;

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border border-red-200",
  high:    "bg-orange-100 text-orange-700 border border-orange-200",
  medium:  "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:     "bg-green-100 text-green-700 border border-green-200",
  unknown: "bg-gray-100 text-gray-600 border border-gray-200",
};

const DISCARD_REASONS = [
  { value: "expired",       label: "Expired / Gone bad" },
  { value: "too_much",      label: "Too much / Cannot finish" },
  { value: "did_not_want",  label: "Changed mind" },
  { value: "other",         label: "Other" },
];

const defaultForm = {
  name: "",
  quantity: "",
  unit: "",
  zone: "fridge",
  category: "other",
  best_before_date: "",
  calories_per_100g: "",
  protein_per_100g: "",
  carbs_per_100g: "",
  fat_per_100g: "",
  notes: "",
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const [discarding, setDiscarding] = useState<DiscardState>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(() => fetchInventory().then(setItems), []);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, name: value }));
    setAutofilled(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length >= 2) {
      searchTimer.current = setTimeout(async () => {
        const results: FoodSuggestion[] = await searchFoods(value);
        setSuggestions(results.slice(0, 6));
        setShowSuggestions(results.length > 0);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (food: FoodSuggestion) => {
    setForm((prev) => ({
      ...prev,
      name:              food.name,
      category:          food.category,
      calories_per_100g: String(food.calories_per_100g),
      protein_per_100g:  String(food.protein_per_100g),
      carbs_per_100g:    String(food.carbs_per_100g),
      fat_per_100g:      String(food.fat_per_100g),
    }));
    setSuggestions([]);
    setShowSuggestions(false);
    setAutofilled(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createInventoryItem({
        name:              form.name,
        quantity:          parseFloat(form.quantity),
        unit:              form.unit,
        zone:              form.zone,
        category:          form.category,
        best_before_date:  form.best_before_date || null,
        calories_per_100g: form.calories_per_100g ? parseFloat(form.calories_per_100g) : null,
        protein_per_100g:  form.protein_per_100g  ? parseFloat(form.protein_per_100g)  : null,
        carbs_per_100g:    form.carbs_per_100g    ? parseFloat(form.carbs_per_100g)    : null,
        fat_per_100g:      form.fat_per_100g      ? parseFloat(form.fat_per_100g)      : null,
        notes:             form.notes || null,
      });
      setForm(defaultForm);
      setShowForm(false);
      setAutofilled(false);
      await loadItems();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this item?")) return;
    await deleteInventoryItem(id);
    await loadItems();
  };

  const handleDiscardConfirm = async () => {
    if (!discarding) return;
    setDiscarding((prev) => prev ? { ...prev, busy: true } : prev);
    try {
      await discardInventoryItem(discarding.itemId, discarding.reason);
      setDiscarding(null);
      await loadItems();
    } catch {
      setDiscarding((prev) => prev ? { ...prev, busy: false } : prev);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 mt-1">
            {items.length} item{items.length !== 1 ? "s" : ""} across fridge, freezer &amp; pantry
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(null); }}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Item"}
        </button>
      </div>

      {/* ── Add Item Form ──────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">New Inventory Item</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative" ref={suggestionsRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                name="name" value={form.name} onChange={handleNameChange}
                required autoComplete="off"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Type to search food database…"
              />
              {autofilled && (
                <span className="text-xs text-green-600 mt-0.5 block">✓ Nutrition auto-filled from database</span>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {suggestions.map((food) => (
                    <button key={food.id} type="button" onClick={() => handleSelectSuggestion(food)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex items-center justify-between gap-4 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-900 capitalize">{food.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {food.calories_per_100g} kcal · {food.protein_per_100g}g P · {food.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input name="quantity" type="number" step="any" value={form.quantity} onChange={handleChange} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                <input name="unit" value={form.unit} onChange={handleChange} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="g / lb / cups" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone *</label>
              <select name="zone" value={form.zone} onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {["fridge", "freezer", "pantry"].map((z) => (
                  <option key={z} value={z}>{z.charAt(0).toUpperCase() + z.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select name="category" value={form.category} onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {["meat","vegetable","fruit","dairy","grain","snack","condiment","other"].map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Best Before Date</label>
              <input name="best_before_date" type="date" value={form.best_before_date} onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Nutrition per 100g
              {autofilled
                ? <span className="ml-2 text-green-500 font-normal normal-case">(auto-filled — edit if needed)</span>
                : <span className="ml-2 font-normal normal-case text-gray-400">(optional — auto-filled on name match)</span>}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: "calories_per_100g", label: "Calories" },
                { name: "protein_per_100g",  label: "Protein (g)" },
                { name: "carbs_per_100g",    label: "Carbs (g)" },
                { name: "fat_per_100g",      label: "Fat (g)" },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-xs text-gray-600 mb-1">{f.label}</label>
                  <input name={f.name} type="number" step="any"
                    value={form[f.name as keyof typeof form]} onChange={handleChange}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input name="notes" value={form.notes} onChange={handleChange}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Optional notes" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
            {saving ? "Adding…" : "Add Item"}
          </button>
        </form>
      )}

      {/* ── Inventory Table ────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          No items yet. Add your first ingredient above.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Best Before</th>
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-right">Cal</th>
                <th className="px-4 py-3 text-right">P</th>
                <th className="px-4 py-3 text-right">C</th>
                <th className="px-4 py-3 text-right">F</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.name}
                    {item.notes && <span className="ml-1 text-xs text-gray-400">({item.notes})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{item.zone}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{item.category}</td>
                  <td className="px-4 py-3 text-gray-500">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-3 text-gray-500">{item.best_before_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[item.expiration_risk] ?? RISK_STYLES.unknown}`}>
                      {item.expiration_risk}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.calories_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.protein_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.carbs_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.fat_per_100g ?? "—"}</td>
                  <td className="px-4 py-3">
                    {discarding?.itemId === item.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={discarding.reason}
                          onChange={(e) => setDiscarding((prev) => prev ? { ...prev, reason: e.target.value } : prev)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                        >
                          {DISCARD_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleDiscardConfirm}
                          disabled={discarding.busy}
                          className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium px-2 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          {discarding.busy ? "…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setDiscarding(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDiscarding({ itemId: item.id, reason: "expired", busy: false })}
                          className="text-xs text-orange-500 hover:text-orange-700 font-medium transition-colors"
                        >
                          Discard
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
            Cal / P / C / F columns show values per 100g &nbsp;·&nbsp; Discard records waste events; Delete permanently removes without logging.
          </div>
        </div>
      )}
    </div>
  );
}
