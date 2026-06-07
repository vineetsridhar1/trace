import { AppWindow } from "lucide-react";
import { useEntityStore } from "@trace/client-core";

export function SessionApplicationRunningIndicator({ sessionGroupId }: { sessionGroupId: string }) {
  const hasRunningApplication = useEntityStore((state) =>
    Object.values(state.sessionApplicationProcesses).some(
      (process) => process.sessionGroupId === sessionGroupId && process.status === "running",
    ),
  );

  if (!hasRunningApplication) return null;

  return (
    <span
      title="Application running"
      className="inline-flex shrink-0"
      aria-label="Application running"
    >
      <AppWindow className="h-3.5 w-3.5 text-sky-500" />
    </span>
  );
}
