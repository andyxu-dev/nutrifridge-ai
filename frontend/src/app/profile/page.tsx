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

function label(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function optionLabel(field: string, value: string) {
  return SELECT_LABELS[field]?.[value] ?? label(value);
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
          name: profile.name ?? "",
          height_cm: String(profile.height_cm ?? ""),
          weight_kg: String(profile.weight_kg ?? ""),
          age: String(profile.age ?? ""),
          sex: profile.sex ?? "male",
          activity_level: profile.activity_level ?? "moderate",
          goal: profile.goal ?? "fat_loss",
          dietary_preference: profile.dietary_preference ?? "",
          cuisine_preference: profile.cuisine_preference ?? "no_preference",
          cooking_time_preference: profile.cooking_time_preference ?? "flexible",
          diet_style: profile.diet_style ?? "no_preference",
          disliked_foods: (profile.disliked_foods ?? []).join(", "),
          preferred_foods: (profile.preferred_foods ?? []).join(", "),
        });
      }
    });
    fetchNutritionTarget().then(setNutrition);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
        name: form.name,
        height_cm: parseFloat(form.height_cm),
        weight_kg: parseFloat(form.weight_kg),
        age: parseInt(form.age),
        sex: form.sex,
        activity_level: form.activity_level,
        goal: form.goal,
        dietary_preference: form.dietary_preference || null,
        cuisine_preference: form.cuisine_preference || null,
        cooking_time_preference: form.cooking_time_preference || null,
        diet_style: form.diet_style || null,
        disliked_foods: parseFoodList(form.disliked_foods),
        preferred_foods: parseFoodList(form.preferred_foods),
      };

      if (hasProfile) {
        await updateProfile(data);
      } else {
        await createProfile(data);
        setHasProfile(true);
      }

      const target = await fetchNutritionTarget();
      setNutrition(target);
      setMessage({ type: "success", text: "Profile saved successfully!" });
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-gray-500 mt-1">Set your body metrics, fitness goal, and food preferences for personalised recommendations.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">

        {/* ── Basic info ──────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Body Metrics</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Your name"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(["height_cm", "weight_kg", "age"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label(field)}</label>
                  <input
                    name={field}
                    type="number"
                    step="any"
                    value={form[field]}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder={field === "age" ? "24" : field === "height_cm" ? "175" : "70"}
                  />
                </div>
              ))}
            </div>
            {(["sex", "activity_level", "goal"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label(field)}</label>
                <select
                  name={field}
                  value={form[field]}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {SELECT_FIELDS[field].map((opt) => (
                    <option key={opt} value={opt}>{label(opt)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* ── Food Preferences ─────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Food Preferences</h3>
          <div className="space-y-4">
            {(["cuisine_preference", "cooking_time_preference", "diet_style"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label(field)}</label>
                <select
                  name={field}
                  value={form[field]}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {SELECT_FIELDS[field].map((opt) => (
                    <option key={opt} value={opt}>{optionLabel(field, opt)}</option>
                  ))}
                </select>
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Foods
                <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
              </label>
              <input
                name="preferred_foods"
                value={form.preferred_foods}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. chicken breast, eggs, salmon"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Disliked Foods
                <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
              </label>
              <input
                name="disliked_foods"
                value={form.disliked_foods}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. mushroom, liver, tofu"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Other Dietary Notes (optional)</label>
              <input
                name="dietary_preference"
                value={form.dietary_preference}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. vegetarian, gluten-free, halal"
              />
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? "Saving…" : hasProfile ? "Update Profile" : "Create Profile"}
        </button>
      </form>

      {/* Nutrition Target Result */}
      {nutrition && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Your Daily Nutrition Targets</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Calories", value: nutrition.calories, unit: "kcal", color: "text-green-600" },
              { label: "Protein", value: nutrition.protein_g, unit: "g", color: "text-blue-600" },
              { label: "Carbs", value: nutrition.carbs_g, unit: "g", color: "text-yellow-600" },
              { label: "Fat", value: nutrition.fat_g, unit: "g", color: "text-red-500" },
              { label: "BMR", value: nutrition.bmr, unit: "kcal", color: "text-gray-500" },
              { label: "TDEE", value: nutrition.tdee, unit: "kcal", color: "text-gray-500" },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-4 text-center">
                <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${item.color}`}>{item.label}</div>
                <div className="text-2xl font-bold text-gray-900">{item.value}</div>
                <div className="text-xs text-gray-400">{item.unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
