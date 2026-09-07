import type { NutritionAnalysis } from "./types";

const STATUS_STYLE: Record<string, string> = {
  under: "bg-amber-100 text-amber-800",
  on_track: "bg-emerald-100 text-emerald-800",
  over: "bg-red-100 text-red-700",
};

export default function InsightPanel({
  analysis,
  insightTitle,
}: {
  analysis: NutritionAnalysis;
  insightTitle: string;
}) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Today's insight</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-950">{insightTitle}</h2>
        </div>
        <div>
          <p className="text-sm leading-6 text-gray-600">{analysis.summary}</p>
          {analysis.next_meal_recommendation && (
            <p className="mt-2 text-sm font-medium text-emerald-700">{analysis.next_meal_recommendation}</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.entries(analysis.macro_status) as [string, string][]).map(([key, status]) => (
          <span key={key} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>
            {key}: {status.replace("_", " ")}
          </span>
        ))}
      </div>
      {(analysis.health_notes.length > 0 || analysis.disclaimer) && (
        <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
          {analysis.health_notes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {analysis.health_notes.slice(0, 2).map((note, index) => (
                <p key={index} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {note}
                </p>
              ))}
            </div>
          )}
          {analysis.disclaimer && (
            <p className="text-xs leading-5 text-gray-400 lg:max-w-xs">{analysis.disclaimer}</p>
          )}
        </div>
      )}
    </section>
  );
}
