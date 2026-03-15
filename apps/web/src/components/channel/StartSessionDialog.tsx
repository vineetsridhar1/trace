import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import { useAuthStore } from "../../stores/auth";
import { useEntityIds, useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION, RUN_SESSION_MUTATION } from "../../lib/mutations";
import {
  type InteractionMode,
  MODE_CYCLE,
  MODE_CONFIG,
  wrapPrompt,
} from "../session/interactionModes";
import { getModelsForTool, getDefaultModel } from "../session/modelOptions";
import { RuntimeSelector } from "../session/RuntimeSelector";
import { cn } from "../../lib/utils";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>("claude_code");
  const [model, setModel] = useState<string | undefined>(getDefaultModel("claude_code"));
  const [runtimeInstanceId, setRuntimeInstanceId] = useState<string | undefined>(undefined);
  const [repoId, setRepoId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<InteractionMode>("code");
  const modelOptions = getModelsForTool(tool);
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const repoIds = useEntityIds("repos");

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const wrappedPrompt = wrapPrompt(mode, prompt.trim());

      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool,
            model: model ?? undefined,
            runtimeInstanceId: runtimeInstanceId ?? undefined,
            channelId,
            repoId: repoId ?? undefined,
            prompt: prompt.trim(),
          },
        })
        .toPromise();

      const sessionId = result.data?.startSession?.id;
      if (sessionId) {
        await client.mutation(RUN_SESSION_MUTATION, {
          id: sessionId,
          prompt: wrappedPrompt,
          interactionMode: mode === "code" ? undefined : mode,
        }).toPromise();
        setPrompt("");
        setMode("code");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setRepoId(undefined);
      setRuntimeInstanceId(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
        title="Start session"
      >
        <Plus size={16} />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Start Session</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Coding tool
                </label>
                <Select value={tool} onValueChange={(v) => { if (v) { setTool(v); setModel(getDefaultModel(v)); } }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude_code">Claude Code</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modelOptions.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    Model
                  </label>
                  <Select value={model ?? ""} onValueChange={(v) => { if (v) setModel(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Runtime
                </label>
                <RuntimeSelector
                  tool={tool}
                  open={open}
                  value={runtimeInstanceId}
                  onChange={setRuntimeInstanceId}
                />
              </div>
              {repoIds.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    Repository
                  </label>
                  <Select value={repoId ?? "__none__"} onValueChange={(v) => { if (v) setRepoId(v === "__none__" ? undefined : v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No repo</SelectItem>
                      {repoIds.map((id) => (
                        <RepoOption key={id} id={id} />
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Mode
                </label>
                <button
                  type="button"
                  onClick={cycleMode}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                    modeConfig.style,
                  )}
                >
                  <ModeIcon size={14} className="shrink-0" />
                  {modeConfig.label}
                </button>
              </div>
            </div>
            <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              What should the agent work on?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Fix the login bug on the signup page..."
              autoFocus
              rows={4}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) {
                  handleSubmit(e);
                }
              }}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Press {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to submit
            </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!prompt.trim() || creating || !runtimeInstanceId}>
              {creating ? "Starting..." : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RepoOption({ id }: { id: string }) {
  const name = useEntityField("repos", id, "name");
  return <SelectItem value={id}>{name ?? id}</SelectItem>;
}
