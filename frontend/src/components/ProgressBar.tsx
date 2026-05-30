const BAR_COLORS: Record<string, string> = {
  green:  "bg-green-500",
  blue:   "bg-blue-500",
  yellow: "bg-yellow-400",
  red:    "bg-red-400",
  orange: "bg-orange-400",
};

export default function ProgressBar({
  value,
  max,
  color = "green",
  label,
  unit = "",
  showPct = false,
}: {
  value: number;
  max: number;
  color?: string;
  label?: string;
  unit?: string;
  showPct?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const isOver = value > max;
  const barColor = isOver ? "bg-red-400" : (BAR_COLORS[color] ?? "bg-green-500");

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{label}</span>
          <span>
            {Math.round(value)}{unit} / {max}{unit}
          </span>
        </div>
      )}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showPct && (
        <div className={`text-right text-xs mt-0.5 ${isOver ? "text-red-500" : "text-gray-400"}`}>
          {pct}%
        </div>
      )}
    </div>
  );
}
