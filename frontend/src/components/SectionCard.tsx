export default function SectionCard({
  title,
  subtitle,
  badge,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-semibold text-gray-800 truncate">{title}</h2>
          {badge}
        </div>
        <div className="shrink-0 ml-2">{action}</div>
      </div>
      {subtitle && (
        <p className="px-5 pt-3 text-xs text-gray-400">{subtitle}</p>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
