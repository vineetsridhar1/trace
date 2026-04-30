import { type LocalBridgeSummary, runtimeRepoNames } from "./agent-environment-utils";
import { ANY_LOCAL_RUNTIME, type AgentEnvironmentDraft } from "./agent-environment-form-types";

type Props = {
  draft: AgentEnvironmentDraft;
  localBridges: LocalBridgeSummary[];
};

export function AgentEnvironmentLocalFields({ draft, localBridges }: Props) {
  const runtime =
    draft.runtimeSelection === ANY_LOCAL_RUNTIME
      ? null
      : localBridges.find((bridge) => bridge.id === draft.runtimeSelection);

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3">
      <div className="text-xs font-medium text-muted-foreground">Local bridge</div>
      <div className="mt-2 rounded-md bg-surface-elevated px-3 py-2">
        <div className="text-xs font-medium text-foreground">
          {runtime?.label ??
            (draft.runtimeSelection === ANY_LOCAL_RUNTIME
              ? "Any accessible local bridge"
              : draft.runtimeSelection)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {runtime ? runtimeRepoNames(runtime) : "Detected by the desktop bridge"}
        </div>
      </div>
    </div>
  );
}
