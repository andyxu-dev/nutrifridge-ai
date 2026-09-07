import type { Dispatch, FormEvent, SetStateAction } from "react";

import type { QuickForm, QuickFormKey } from "./types";

function formatMealType(mealType: string) {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

export default function QuickMealModal({
  isOpen,
  quickForm,
  quickSaving,
  quickMsg,
  onClose,
  onSubmit,
  setQuickForm,
}: {
  isOpen: boolean;
  quickForm: QuickForm;
  quickSaving: boolean;
  quickMsg: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  setQuickForm: Dispatch<SetStateAction<QuickForm>>;
}) {
  if (!isOpen) return null;

  const macroFields: { key: QuickFormKey; label: string }[] = [
    { key: "calories", label: "Calories" },
    { key: "protein_g", label: "Protein" },
    { key: "carbs_g", label: "Carbs" },
    { key: "fat_g", label: "Fat" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Manual meal</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950">Log a meal</h2>
            <p className="mt-1 text-sm text-gray-500">Track food eaten outside your recommended plan.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-200"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Type</span>
              <select
                value={quickForm.meal_type}
                onChange={(e) => setQuickForm((p) => ({ ...p, meal_type: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              >
                {["breakfast", "lunch", "dinner", "snack"].map((type) => (
                  <option key={type} value={type}>{formatMealType(type)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Name</span>
              <input
                required
                value={quickForm.meal_name}
                onChange={(e) => setQuickForm((p) => ({ ...p, meal_name: e.target.value }))}
                placeholder="Protein bowl, latte, leftovers..."
                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {macroFields.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quickForm[key]}
                  onChange={(e) => setQuickForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Notes</span>
            <textarea
              value={quickForm.notes}
              onChange={(e) => setQuickForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional context"
              rows={3}
              className="w-full resize-none rounded-2xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          {quickMsg && (
            <p className={`rounded-2xl px-4 py-3 text-sm ${quickMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {quickMsg.text}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={quickSaving}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {quickSaving ? "Logging..." : "Log meal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
