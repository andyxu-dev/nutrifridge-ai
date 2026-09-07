import Link from "next/link";

import type { GroceryList, UrgentItem } from "./types";

const RISK_STYLES: Record<string, string> = {
  expired: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${RISK_STYLES[risk] ?? RISK_STYLES.unknown}`}>
      {risk}
    </span>
  );
}

export default function TodayAtGlancePanel({
  urgentItems,
  groceryList,
}: {
  urgentItems: UrgentItem[];
  groceryList: GroceryList | null;
}) {
  return (
    <aside className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Today at a glance</p>
          <h2 className="text-lg font-semibold text-gray-950">What needs attention</h2>
        </div>
        <Link href="/inventory" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
          Inventory
        </Link>
      </div>

      <div className="space-y-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Urgent ingredients</h3>
            {urgentItems.length > 0 && (
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">{urgentItems.length}</span>
            )}
          </div>
          {urgentItems.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">No urgent ingredients today.</p>
          ) : (
            <div className="space-y-2">
              {urgentItems.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.quantity} {item.unit} in {item.zone}</p>
                  </div>
                  <RiskBadge risk={item.expiration_risk} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Grocery preview</h3>
            <Link href="/grocery-list" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Full list</Link>
          </div>
          {groceryList?.recommended_to_buy.length ? (
            <div className="space-y-2">
              {groceryList.recommended_to_buy.slice(0, 4).map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="truncate text-xs text-gray-400">{item.reason}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low}`}>
                    {item.priority}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">No grocery gaps surfaced yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
