const VALUE_COLORS = {
  green:  "text-green-600",
  blue:   "text-blue-600",
  yellow: "text-yellow-600",
  red:    "text-red-500",
  orange: "text-orange-500",
  gray:   "text-gray-700",
};

export default function StatCard({
  label,
  value,
  unit,
  sub,
  color = "gray",
}: {
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  color?: keyof typeof VALUE_COLORS;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{label}</div>
      <div className={`text-3xl font-bold ${VALUE_COLORS[color]}`}>{value}</div>
      {unit && <div className="text-xs text-gray-400 mt-1">{unit}</div>}
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
