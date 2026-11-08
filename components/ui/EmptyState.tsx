export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-stone-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-stone-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
