"use client";

import { useState, useEffect } from "react";
import { fetchProfile, createProfile, updateProfile, fetchNutritionTarget } from "@/lib/api";

type NutritionTarget = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  bmr: number;
  tdee: number;
};

const defaultForm = {
  name: "",
  height_cm: "",
  weight_kg: "",
  age: "",
  sex: "male",
  activity_level: "moderate",
  goal: "fat_loss",
  dietary_preference: "",
  cuisine_preference: "no_preference",
  cooking_time_preference: "flexible",
  diet_style: "no_preference",
  disliked_foods: "",
  preferred_foods: "",
};

const SELECT_FIELDS: Record<string, string[]> = {
  sex: ["male", "female", "other"],
  activity_level: ["sedentary", "light", "moderate", "active", "very_active"],
  goal: ["fat_loss", "maintenance", "muscle_gain"],
  cuisine_preference: ["no_preference", "chinese", "western", "mixed"],
  cooking_time_preference: ["flexible", "quick_15_min", "normal_30_min"],
  diet_style: ["no_preference", "high_protein", "balanced", "low_carb", "low_fat"],
};

const SELECT_LABELS: Record<string, Record<string, string>> = {
  sex: { male: "Male", female: "Female", other: "Other" },
  activity_level: {
    sedentary: "Sedentary (desk job, no exercise)",
    light: "Light (1-3 days/week)",
    moderate: "Moderate (3-5 days/week)",
    active: "Active (6-7 days/week)",
    very_active: "Very Active (2× daily)",
  },
  goal: {
    fat_loss: "Fat Loss (−400 kcal deficit)",
    maintenance: "Maintenance",
    muscle_gain: "Muscle Gain (+300 kcal surplus)",
  },
  cuisine_preference: {
    no_preference: "No Preference",
    chinese: "Chinese",
    western: "Western",
    mixed: "Mixed (both)",
  },
  cooking_time_preference: {
    flexible: "Flexible (any time)",
    quick_15_min: "Quick (≤15 min)",
    normal_30_min: "Normal (≤30 min)",
  },
  diet_style: {
    no_preference: "No Preference",
    high_protein: "High Protein",
    balanced: "Balanced",
    low_carb: "Low Carb",
    low_fat: "Low Fat",
  },
};

const GOAL_EMOJI: Record<string, string> = {
  fat_loss: "🔥",
  maintenance: "⚖️",
  muscle_gain: "💪",
};

function optionLabel(field: string, value: string) {
  return SELECT_LABELS[field]?.[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfilePage() {
  const [form, setForm] = useState(defaultForm);
  const [hasProfile, setHasProfile] = useState(false);
  const [nutrition, setNutrition] = useState<NutritionTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProfile().then((profile) => {
      if (profile) {
        setHasProfile(true);
        setForm({
          name:                    profile.name ?? "",
          height_cm:               String(profile.height_cm ?? ""),
          weight_kg:               String(profile.weight_kg ?? ""),
          age:                     String(profile.age ?? ""),
          sex:                     profile.sex ?? "male",
          activity_level:          profile.activity_level ?? "moderate",
          goal:                    profile.goal ?? "fat_loss",
          dietary_preference:      profile.dietary_preference ?? "",
          cuisine_preference:      profile.cuisine_preference ?? "no_preference",
          cooking_time_preference: profile.cooking_time_preference ?? "flexible",
          diet_style:              profile.diet_style ?? "no_preference",
          disliked_foods:          (profile.disliked_foods ?? []).join(", "),
          preferred_foods:         (profile.preferred_foods ?? []).join(", "),
        });
      }
    });
    fetchNutritionTarget().then(setNutrition);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const parseFoodList = (raw: string) =>
        raw.split(",").map((s) => s.trim()).filter(Boolean);

      const data = {
        name:                    form.name,
        height_cm:               parseFloat(form.height_cm),
        weight_kg:               parseFloat(form.weight_kg),
        age:                     parseInt(form.age),
        sex:                     form.sex,
        activity_level:          form.activity_level,
        goal:                    form.goal,
        dietary_preference:      form.dietary_preference || null,
        cuisine_preference:      form.cuisine_preference || null,
        cooking_time_preference: form.cooking_time_preference || null,
        diet_style:              form.diet_style || null,
        disliked_foods:          parseFoodList(form.disliked_foods),
        preferred_foods:         parseFoodList(form.preferred_foods),
      };

      if (hasProfile) {
        await updateProfile(data);
      } else {
        await createProfile(data);
        setHasProfile(true);
      }

      const target = await fetchNutritionTarget();
      setNutrition(target);
      setMessage({ type: "success", text: "Profile saved! Your nutrition targets have been updated." });
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-gray-500 text-sm mt-1">
          Set your body metrics, fitness goal, and food preferences for personalised meal plans and nutrition targets.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* ── Body Metrics ────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">📏</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Body Metrics</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
              <input
                name="name" value={form.name} onChange={handleChange} required
                placeholder="e.g. Alex"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(["height_cm", "weight_kg", "age"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {fieldLabel(field)}
                  </label>
                  <div className="relative">
                    <input
                      name={field} type="number" step="any"
                      value={form[field]} onChange={handleChange} required
                      placeholder={field === "age" ? "24" : field === "height_cm" ? "175" : "70"}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["sex", "activity_level", "goal"] as const).map((field) => (
                <div key={field} className={field === "activity_level" ? "sm:col-span-2" : ""}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {fieldLabel(field)}
                    {field === "goal" && form.goal && (
                      <span className="ml-1">{GOAL_EMOJI[form.goal]}</span>
                    )}
                  </label>
                  <select
                    name={field} value={form[field]} onChange={handleChange}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                  >
                    {SELECT_FIELDS[field].map((opt) => (
                      <option key={opt} value={opt}>{optionLabel(field, opt)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 mx-6" />

        {/* ── Food Preferences ──────────────────────────────── */}
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">🍽</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Food Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["cuisine_preference", "cooking_time_preference", "diet_style"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {fieldLabel(field)}
                  </label>
                  <select
                    name={field} value={form[field]} onChange={handleChange}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                  >
                    {SELECT_FIELDS[field].map((opt) => (
                      <option key={opt} value={opt}>{optionLabel(field, opt)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Preferred Foods
                <span className="text-gray-400 font-normal ml-1 text-xs">(comma-separated)</span>
              </label>
              <input
                name="preferred_foods" value={form.preferred_foods} onChange={handleChange}
                placeholder="e.g. chicken breast, eggs, salmon"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">These will be prioritised in meal recommendations.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Disliked Foods
                <span className="text-gray-400 font-normal ml-1 text-xs">(comma-separated)</span>
              </label>
              <input
                name="disliked_foods" value={form.disliked_foods} onChange={handleChange}
                placeholder="e.g. mushroom, liver, tofu"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Meals containing these ingredients receive a score penalty.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Other Dietary Notes
                <span className="text-gray-400 font-normal ml-1 text-xs">(optional)</span>
              </label>
              <input
                name="dietary_preference" value={form.dietary_preference} onChange={handleChange}
                placeholder="e.g. vegetarian, gluten-free, halal"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* ── Save area ──────────────────────────────────────── */}
        <div className="px-6 pb-6 space-y-3">
          {message && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit" disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm shadow-sm"
          >
            {saving ? "Saving…" : hasProfile ? "Update Profile" : "Create Profile"}
          </button>
        </div>
      </form>

      {/* Nutrition Target Result */}
      {nutrition && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">🎯</span>
            <h2 className="text-base font-semibold text-gray-800">Your Daily Nutrition Targets</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Calories",  value: nutrition.calories, unit: "kcal", color: "bg-green-50 border-green-200", text: "text-green-700", sub: "bg-green-600" },
              { label: "Protein",   value: nutrition.protein_g, unit: "g",   color: "bg-blue-50 border-blue-200",   text: "text-blue-700",  sub: "bg-blue-500" },
              { label: "Carbs",     value: nutrition.carbs_g,   unit: "g",   color: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", sub: "bg-yellow-400" },
              { label: "Fat",       value: nutrition.fat_g,     unit: "g",   color: "bg-red-50 border-red-200",     text: "text-red-600",   sub: "bg-red-400" },
              { label: "BMR",       value: nutrition.bmr,       unit: "kcal", color: "bg-gray-50 border-gray-200",  text: "text-gray-600",  sub: "bg-gray-300" },
              { label: "TDEE",      value: nutrition.tdee,      unit: "kcal", color: "bg-gray-50 border-gray-200",  text: "text-gray-600",  sub: "bg-gray-300" },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border p-4 text-center ${item.color}`}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${item.text}`}>{item.label}</div>
                <div className="text-2xl font-bold text-gray-900">{item.value}</div>
                <div className={`text-xs mt-1 ${item.text} opacity-70`}>{item.unit}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            Calculated using Mifflin-St Jeor BMR formula · Activity multiplier applied to TDEE · Goal adjustment applied to calories
          </p>
        </div>
      )}

      {!nutrition && hasProfile && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-800 text-sm">
          Could not load nutrition targets. Make sure the backend is running.
        </div>
      )}
    </div>
  );
}
