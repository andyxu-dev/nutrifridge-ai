type AlertType = "error" | "warning" | "success" | "info";

const STYLES: Record<AlertType, string> = {
  error:   "bg-red-50 border-red-200 text-red-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  success: "bg-green-50 border-green-200 text-green-700",
  info:    "bg-blue-50 border-blue-200 text-blue-800",
};

const ICONS: Record<AlertType, string> = {
  error:   "⊘",
  warning: "⚠",
  success: "✓",
  info:    "ℹ",
};

export default function AlertBanner({
  type = "info",
  title,
  children,
}: {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${STYLES[type]}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5 select-none">{ICONS[type]}</span>
        <div className="text-sm">
          {title && <p className="font-semibold mb-1">{title}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
