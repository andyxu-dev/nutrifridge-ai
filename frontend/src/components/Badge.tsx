type Variant =
  | "green" | "red" | "orange" | "yellow" | "blue"
  | "gray" | "sky" | "amber" | "purple" | "indigo";

const STYLES: Record<Variant, string> = {
  green:  "bg-green-100 text-green-700 border border-green-200",
  red:    "bg-red-100 text-red-700 border border-red-200",
  orange: "bg-orange-100 text-orange-700 border border-orange-200",
  yellow: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  blue:   "bg-blue-100 text-blue-700 border border-blue-200",
  gray:   "bg-gray-100 text-gray-600 border border-gray-200",
  sky:    "bg-sky-100 text-sky-700 border border-sky-200",
  amber:  "bg-amber-100 text-amber-700 border border-amber-200",
  purple: "bg-purple-100 text-purple-700 border border-purple-200",
  indigo: "bg-indigo-100 text-indigo-700 border border-indigo-200",
};

export default function Badge({
  children,
  variant = "gray",
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
