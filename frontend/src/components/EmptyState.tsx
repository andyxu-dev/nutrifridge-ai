export default function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <span className="text-4xl mb-3 select-none">{icon}</span>
      <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 mb-4 max-w-sm leading-relaxed">{description}</p>
      )}
      {action}
    </div>
  );
}
