import { Trash2 } from "lucide-react";
import type { RepoRunScript } from "@trace/gql";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { AutomationSection } from "./SessionAutomationSetupScripts";

export function SessionAutomationRunScripts({
  scripts,
  onAdd,
  onRemove,
  onUpdate,
}: {
  scripts: RepoRunScript[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RepoRunScript>) => void;
}) {
  return (
    <AutomationSection
      title="Run scripts"
      description="Named commands members open as terminals from the session's Run button. For processes Trace should supervise, use an application."
      actionLabel="Add run script"
      onAdd={onAdd}
    >
      <div className="rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="space-y-2">
          <div className="grid grid-cols-[220px_1fr_32px] gap-2 px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Name</span>
            <span>Command</span>
            <span />
          </div>
          {scripts.map((script) => (
            <div key={script.id} className="grid grid-cols-[220px_1fr_32px] items-center gap-2">
              <Input
                value={script.name}
                placeholder="Name"
                onChange={(event) => onUpdate(script.id, { name: event.target.value })}
                className="h-9 bg-background text-[13px]"
              />
              <Input
                value={script.command}
                placeholder="Command to run"
                onChange={(event) => onUpdate(script.id, { command: event.target.value })}
                className="h-9 bg-background font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${script.name || "run script"}`}
                onClick={() => onRemove(script.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          {!scripts.length ? (
            <p className="py-5 text-center text-xs text-muted-foreground">
              No run scripts configured.
            </p>
          ) : null}
        </div>
      </div>
    </AutomationSection>
  );
}
