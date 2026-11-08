import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import type { ListenerStatus } from "@/lib/types";

const styles: Record<ListenerStatus, string> = {
  running: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  stopped: "bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-500/15",
  error: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
};

const dots: Record<ListenerStatus, string> = {
  running: "bg-emerald-500 animate-pulse",
  stopped: "bg-stone-400",
  error: "bg-rose-500",
};

export function StatusBadge({ status }: { status: ListenerStatus }) {
  const { dict } = useI18n();
  const labels: Record<ListenerStatus, string> = {
    running: dict.statusRunning,
    stopped: dict.statusStopped,
    error: dict.statusError,
  };

  return (
    <span className={cn("badge", styles[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[status])} />
      {labels[status]}
    </span>
  );
}
