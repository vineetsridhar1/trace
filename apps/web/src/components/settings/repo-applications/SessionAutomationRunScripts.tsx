import { Plus, Terminal, Trash2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { RunScript } from "./useSessionAutomationDraft";

export function SessionAutomationRunScripts({
  scripts,
  focusedProcessId,
  onAdd,
  onRemove,
  onUpdate,
}: {
  scripts: RunScript[];
  focusedProcessId: string | null;
  onAdd: () => void;
  onRemove: (script: RunScript) => void;
  onUpdate: (script: RunScript, field: "name" | "command", value: string) => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Run scripts
          <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-[10px] font-medium">
            {scripts.length} of 10
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={scripts.length >= 10}
        >
          <Plus size={14} />
          Add run script
        </Button>
      </div>
      {scripts.length ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[160px_1fr_32px] gap-2 px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Name</span>
            <span>Command</span>
            <span />
          </div>
          {scripts.map((script) => (
            <div
              key={`${script.applicationId}:${script.processId}`}
              className="grid grid-cols-[160px_1fr_32px] items-center gap-2"
            >
              <Input
                autoFocus={focusedProcessId === script.processId}
                value={script.name}
                placeholder="Name"
                onChange={(event) => onUpdate(script, "name", event.target.value)}
                className="h-9 bg-background text-[13px]"
              />
              <Input
                value={script.command}
                placeholder="Command to run"
                onChange={(event) => onUpdate(script, "command", event.target.value)}
                className="h-9 bg-background font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${script.name || "run script"}`}
                onClick={() => onRemove(script)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          No run scripts configured.
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
        <Terminal size={12} className="shrink-0" />
        Each run script opens as a named terminal from the session&apos;s Run button.
      </p>
    </section>
  );
}
