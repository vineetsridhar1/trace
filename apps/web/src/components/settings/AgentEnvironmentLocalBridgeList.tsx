import { GitBranch, Laptop } from "lucide-react";
import { cn } from "../../lib/utils";
import { type LocalBridgeSummary, runtimeRepoNames } from "./agent-environment-utils";

type Props = {
  localBridges: LocalBridgeSummary[];
};

export function AgentEnvironmentLocalBridgeList({ localBridges }: Props) {
  return (
    <section className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Local Bridges</h3>
        <p className="text-xs text-muted-foreground">
          Local environments are created automatically when desktop bridges connect.
        </p>
      </div>

      {localBridges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          No local bridges are connected for this organization.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {localBridges.map((bridge) => (
            <div key={bridge.id} className="rounded-lg border border-border bg-surface-deep p-3">
              <div className="flex items-start gap-3">
                <Laptop size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-medium text-foreground">
                      {bridge.label}
                    </h4>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        bridge.connected
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {bridge.connected ? "Connected" : "Offline"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <GitBranch size={12} className="mt-0.5 shrink-0" />
                    <span>{runtimeRepoNames(bridge)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
