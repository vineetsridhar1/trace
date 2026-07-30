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
        <h3 className="text-sm font-semibold text-foreground">Local bridges</h3>
        <p className="text-xs text-muted-foreground">
          Desktop apps connected under members' accounts. Manage sharing under Devices &amp; access.
        </p>
      </div>

      {localBridges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          No local bridges are connected for this organization.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {localBridges.map((bridge) => (
            <div key={bridge.id} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex items-start gap-3">
                <Laptop size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-medium text-foreground">{bridge.label}</h4>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        bridge.connected
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-border bg-surface-deep text-muted-foreground",
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
