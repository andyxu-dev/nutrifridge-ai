"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchInventory,
  createInventoryItem,
  deleteInventoryItem,
  discardInventoryItem,
  searchFoods,
  searchInventory,
  fetchLocations,
  createLocation,
  deleteLocation,
} from "@/lib/api";

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
  location_id?: number | null;
  location_path?: string | null;
  location_name?: string | null;
};

type Location = {
  id: number;
  name: string;
  description?: string | null;
  storage_type?: string | null;
  temperature_zone?: string | null;
  parent_id?: number | null;
  path?: string | null;
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

// ── Style maps ────────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border border-red-200",
  high:    "bg-orange-100 text-orange-700 border border-orange-200",
  medium:  "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:     "bg-green-100 text-green-700 border border-green-200",
  unknown: "bg-gray-100 text-gray-500 border border-gray-200",
};

const ZONE_STYLES: Record<string, string> = {
  fridge:  "bg-blue-100 text-blue-700 border border-blue-200",
  freezer: "bg-sky-100 text-sky-700 border border-sky-200",
  pantry:  "bg-amber-100 text-amber-700 border border-amber-200",
};

const ZONE_EMOJI: Record<string, string> = {
  fridge:  "🧊",
  freezer: "❄️",
  pantry:  "🗄️",
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

const DISCARD_REASONS = [
  { value: "expired",      label: "Expired / Gone bad" },
  { value: "too_much",     label: "Too much / Cannot finish" },
  { value: "did_not_want", label: "Changed mind" },
  { value: "other",        label: "Other" },
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
  location_id: "",
};

// ── Page ──────────────────────────────────────────────────────────────────

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

  // Inventory search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const invSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Locations
  const [locations, setLocations] = useState<Location[]>([]);
  const [showLocationsSection, setShowLocationsSection] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationForm, setLocationForm] = useState({ name: "", storage_type: "fridge", temperature_zone: "refrigerated", parent_id: "" });
  const [locationSaving, setLocationSaving] = useState(false);

  const loadItems = useCallback(() => fetchInventory().then(setItems), []);

  const loadLocations = useCallback(() => fetchLocations().then(setLocations), []);

  useEffect(() => { loadItems(); loadLocations(); }, [loadItems, loadLocations]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleInventorySearch = (q: string) => {
    setSearchQuery(q);
    if (invSearchTimer.current) clearTimeout(invSearchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    invSearchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchInventory(q);
      setSearchResults(results as InventoryItem[]);
      setSearching(false);
    }, 300);
  };

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
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
        location_id:       form.location_id ? parseInt(form.location_id) : null,
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

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocationSaving(true);
    try {
      await createLocation({
        name: locationForm.name,
        storage_type: locationForm.storage_type,
        temperature_zone: locationForm.temperature_zone,
        parent_id: locationForm.parent_id ? parseInt(locationForm.parent_id) : null,
      });
      setLocationForm({ name: "", storage_type: "fridge", temperature_zone: "refrigerated", parent_id: "" });
      setShowLocationForm(false);
      await loadLocations();
    } catch { /* ignore */ } finally {
      setLocationSaving(false);
    }
  };

  const handleDeleteLocation = async (id: number) => {
    if (!confirm("Delete this location?")) return;
    try {
      await deleteLocation(id);
      await loadLocations();
    } catch { /* ignore */ }
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

  // Stats by zone
  const fridgeCount   = items.filter((i) => i.zone === "fridge").length;
  const freezerCount  = items.filter((i) => i.zone === "freezer").length;
  const pantryCount   = items.filter((i) => i.zone === "pantry").length;
  const urgentCount   = items.filter((i) => ["expired", "high"].includes(i.expiration_risk)).length;

  // Items to display (search results or all items)
  const displayedItems: InventoryItem[] = searchQuery.trim() ? searchResults : items;

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">
            {items.length} item{items.length !== 1 ? "s" : ""} · {fridgeCount} fridge · {freezerCount} freezer · {pantryCount} pantry
            {urgentCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">· {urgentCount} urgent</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(null); }}
          className="shrink-0 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm"
        >
          {showForm ? "Cancel" : "+ Add Item"}
        </button>
      </div>

      {/* ── Search Bar ────────────────────────────────────────────────── */}
      <div className="relative">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => handleInventorySearch(e.target.value)}
          placeholder="Search by food, category, or location..."
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent pl-10"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>
        )}
        {searchQuery && !searching && (
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setSearchResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          >
            ✕
          </button>
        )}
      </div>
      {searchQuery && (
        <p className="text-xs text-gray-400 -mt-3">
          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
        </p>
      )}

      {/* ── Add Item Form ──────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-700">New Inventory Item</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name + autofill */}
            <div className="relative md:col-span-2" ref={suggestionsRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                name="name" value={form.name} onChange={handleNameChange}
                required autoComplete="off"
                placeholder="Type to search the food database…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {autofilled && (
                <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                  <span>✓</span> Nutrition auto-filled — edit any field if needed
                </p>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((food) => (
                    <button
                      key={food.id} type="button"
                      onClick={() => handleSelectSuggestion(food)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 flex items-center justify-between gap-4 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-900 capitalize">{food.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {food.calories_per_100g} kcal · {food.protein_per_100g}g P · {food.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Quantity <span className="text-red-400">*</span>
                </label>
                <input
                  name="quantity" type="number" step="any" value={form.quantity}
                  onChange={handleChange} required placeholder="e.g. 500"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Unit <span className="text-red-400">*</span>
                </label>
                <input
                  name="unit" value={form.unit} onChange={handleChange} required
                  placeholder="g / lb / cups"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Zone <span className="text-red-400">*</span>
              </label>
              <select
                name="zone" value={form.zone} onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                {["fridge", "freezer", "pantry"].map((z) => (
                  <option key={z} value={z}>{ZONE_EMOJI[z]} {z.charAt(0).toUpperCase() + z.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                name="category" value={form.category} onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                {["meat", "vegetable", "fruit", "dairy", "grain", "snack", "condiment", "other"].map((c) => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Best Before */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Best Before Date</label>
              <input
                name="best_before_date" type="date" value={form.best_before_date}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input
                name="notes" value={form.notes} onChange={handleChange}
                placeholder="Optional notes"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
              <select
                name="location_id" value={form.location_id} onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                <option value="">No location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.path ?? loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Nutrition fields */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Nutrition per 100g
              {autofilled
                ? <span className="ml-2 text-green-500 font-normal normal-case">(auto-filled)</span>
                : <span className="ml-2 font-normal normal-case">(optional — auto-filled on name match)</span>}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: "calories_per_100g", label: "Calories" },
                { name: "protein_per_100g",  label: "Protein (g)" },
                { name: "carbs_per_100g",    label: "Carbs (g)" },
                { name: "fat_per_100g",      label: "Fat (g)" },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-xs text-gray-500 mb-1.5">{f.label}</label>
                  <input
                    name={f.name} type="number" step="any"
                    value={form[f.name as keyof typeof form]} onChange={handleChange}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit" disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
            >
              {saving ? "Adding…" : "Add to Inventory"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(defaultForm); setError(null); setAutofilled(false); }}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Inventory: Empty State ─────────────────────────────────────── */}
      {displayedItems.length === 0 && !searchQuery && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-5xl block mb-4">🧺</span>
          <h3 className="font-semibold text-gray-700 mb-2">Your inventory is empty</h3>
          <p className="text-sm text-gray-400 mb-5">
            Add ingredients to start tracking expiration dates and getting meal recommendations.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            + Add First Item
          </button>
        </div>
      )}

      {/* ── Inventory: Mobile Cards ────────────────────────────────────── */}
      {displayedItems.length > 0 && (
        <div className="md:hidden space-y-3">
          {displayedItems.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  {item.location_path && (
                    <p className="text-xs text-gray-400 mt-0.5">📍 {item.location_path}</p>
                  )}
                  {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-2 ${RISK_STYLES[item.expiration_risk] ?? RISK_STYLES.unknown}`}>
                  {item.expiration_risk}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ZONE_STYLES[item.zone] ?? "bg-gray-100 text-gray-600"}`}>
                  {ZONE_EMOJI[item.zone]} {item.zone}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {CATEGORY_EMOJI[item.category] ?? "•"} {item.category}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                <div>
                  <span className="text-xs text-gray-400 block">Quantity</span>
                  <span className="text-gray-700">{item.quantity} {item.unit}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Best Before</span>
                  <span className="text-gray-700">{item.best_before_date ?? "—"}</span>
                </div>
                {item.calories_per_100g != null && (
                  <div>
                    <span className="text-xs text-gray-400 block">Cal/100g</span>
                    <span className="text-gray-700">{item.calories_per_100g}</span>
                  </div>
                )}
                {item.protein_per_100g != null && (
                  <div>
                    <span className="text-xs text-gray-400 block">Protein/100g</span>
                    <span className="text-gray-700">{item.protein_per_100g}g</span>
                  </div>
                )}
              </div>

              {discarding?.itemId === item.id ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={discarding.reason}
                    onChange={(e) => setDiscarding((prev) => prev ? { ...prev, reason: e.target.value } : prev)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white"
                  >
                    {DISCARD_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleDiscardConfirm}
                    disabled={discarding.busy}
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {discarding.busy ? "…" : "Confirm Discard"}
                  </button>
                  <button onClick={() => setDiscarding(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setDiscarding({ itemId: item.id, reason: "expired", busy: false })}
                    className="text-xs text-orange-500 hover:text-orange-700 font-semibold border border-orange-200 hover:border-orange-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Discard (log waste)
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold border border-red-100 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Inventory: Desktop Table ───────────────────────────────────── */}
      {displayedItems.length > 0 && (
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Best Before</th>
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-center">Cal</th>
                <th className="px-4 py-3 text-center">P</th>
                <th className="px-4 py-3 text-center">C</th>
                <th className="px-4 py-3 text-center">F</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    {item.location_path && (
                      <p className="text-xs text-gray-400">📍 {item.location_path}</p>
                    )}
                    {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ZONE_STYLES[item.zone] ?? "bg-gray-100 text-gray-500"}`}>
                      {ZONE_EMOJI[item.zone]} {item.zone}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 capitalize">
                      {CATEGORY_EMOJI[item.category] ?? "•"} {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-3 text-gray-500">{item.best_before_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[item.expiration_risk] ?? RISK_STYLES.unknown}`}>
                      {item.expiration_risk}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.calories_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.protein_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.carbs_per_100g ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.fat_per_100g ?? "—"}</td>
                  <td className="px-4 py-3">
                    {discarding?.itemId === item.id ? (
                      <div className="flex items-center gap-2 flex-wrap min-w-[220px]">
                        <select
                          value={discarding.reason}
                          onChange={(e) => setDiscarding((prev) => prev ? { ...prev, reason: e.target.value } : prev)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white"
                        >
                          {DISCARD_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleDiscardConfirm}
                          disabled={discarding.busy}
                          className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {discarding.busy ? "…" : "Confirm"}
                        </button>
                        <button onClick={() => setDiscarding(null)} className="text-xs text-gray-400 hover:text-gray-600">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDiscarding({ itemId: item.id, reason: "expired", busy: false })}
                          className="text-xs text-orange-500 hover:text-orange-700 font-semibold transition-colors"
                        >
                          Discard
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors"
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
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            Cal / P / C / F are per 100g &nbsp;·&nbsp;
            <span className="text-orange-500">Discard</span> logs a waste event &nbsp;·&nbsp;
            <span className="text-red-400">Delete</span> removes permanently without logging
          </div>
        </div>
      )}

      {/* ── Locations Section ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLocationsSection((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 text-sm">Storage Locations</span>
            {locations.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{locations.length}</span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{showLocationsSection ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {showLocationsSection && (
          <div className="border-t border-gray-100">
            {/* Location list */}
            {locations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Path</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {locations.map((loc) => (
                      <tr key={loc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{loc.name}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-500 capitalize">{loc.storage_type ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{loc.path ?? loc.name}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleDeleteLocation(loc.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add location button/form */}
            <div className="px-5 py-4 border-t border-gray-100">
              {!showLocationForm ? (
                <button
                  onClick={() => setShowLocationForm(true)}
                  className="text-sm text-green-600 hover:text-green-800 font-semibold"
                >
                  + Add Location
                </button>
              ) : (
                <form onSubmit={handleAddLocation} className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">New Location</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-400">*</span></label>
                      <input
                        required
                        value={locationForm.name}
                        onChange={(e) => setLocationForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Top shelf"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Storage Type</label>
                      <select
                        value={locationForm.storage_type}
                        onChange={(e) => setLocationForm((p) => ({ ...p, storage_type: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        {["fridge", "freezer", "pantry", "counter", "other"].map((t) => (
                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Temperature Zone</label>
                      <select
                        value={locationForm.temperature_zone}
                        onChange={(e) => setLocationForm((p) => ({ ...p, temperature_zone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        {["refrigerated", "frozen", "room_temp", "cool_dry"].map((z) => (
                          <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Parent Location</label>
                      <select
                        value={locationForm.parent_id}
                        onChange={(e) => setLocationForm((p) => ({ ...p, parent_id: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="">None (top-level)</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.path ?? loc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={locationSaving}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      {locationSaving ? "Adding…" : "Add Location"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLocationForm(false)}
                      className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
