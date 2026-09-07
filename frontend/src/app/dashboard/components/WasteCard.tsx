import Link from "next/link";

import type { WasteEntry } from "./types";

export default function WasteCard({ wasteLog }: { wasteLog: WasteEntry[] }) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Waste</p>
          <h2 className="text-lg font-semibold text-gray-950">Recent food waste</h2>
          <p className="mt-1 text-sm text-gray-500">
            {wasteLog.length > 0
              ? `${wasteLog.reduce((sum, entry) => sum + (entry.estimated_calories_wasted ?? 0), 0).toFixed(0)} kcal discarded recently`
              : "No discarded items logged recently"}
          </p>
        </div>
        <Link href="/inventory" className="rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100">
          Manage inventory
        </Link>
      </div>

      {wasteLog.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">Nice and tidy. Use expiring ingredients first to keep this quiet.</p>
      ) : (
        <div className="space-y-2">
          {wasteLog.slice(0, 4).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl bg-orange-50/70 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-950">{entry.item_name}</p>
                <p className="text-xs capitalize text-orange-700">{entry.reason.replace(/_/g, " ")}</p>
              </div>
              {entry.estimated_calories_wasted != null && (
                <span className="shrink-0 text-sm font-semibold text-orange-700">
                  {entry.estimated_calories_wasted.toFixed(0)} kcal
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
