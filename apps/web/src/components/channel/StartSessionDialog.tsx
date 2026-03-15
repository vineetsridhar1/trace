import { useCallback, useEffect, useState } from "react";
import { Plus, Cloud, Monitor, Loader2 } from "lucide-react";
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
import { START_SESSION_MUTATION, RUN_SESSION_MUTATION, AVAILABLE_RUNTIMES_QUERY } from "../../lib/mutations";
import {
  type InteractionMode,
  MODE_CYCLE,
  MODE_CONFIG,
  wrapPrompt,
} from "../session/interactionModes";
import { getModelsForTool, getDefaultModel } from "../session/modelOptions";
import { cn } from "../../lib/utils";

interface RuntimeInstance {
  id: string;
  label: string;
  hostingMode: string;
  supportedTools: string[];
  connected: boolean;
  sessionCount: number;
}

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

  const [runtimes, setRuntimes] = useState<RuntimeInstance[]>([]);
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);

  // Fetch available runtimes when dialog opens or tool changes
  useEffect(() => {
    if (!open) return;
    setLoadingRuntimes(true);
    client
      .query(AVAILABLE_RUNTIMES_QUERY, { tool })
      .toPromise()
      .then((result) => {
        const fetched = (result.data?.availableRuntimes ?? []) as RuntimeInstance[];
        setRuntimes(fetched);
        // Auto-select if there's exactly one connected runtime
        const connected = fetched.filter((r) => r.connected);
        if (connected.length === 1) {
          setRuntimeInstanceId(connected[0].id);
        } else if (!fetched.find((r) => r.id === runtimeInstanceId)) {
          setRuntimeInstanceId(undefined);
        }
      })
      .finally(() => setLoadingRuntimes(false));
  }, [open, tool]);

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

  const connectedRuntimes = runtimes.filter((r) => r.connected);
  const selectedRuntime = runtimes.find((r) => r.id === runtimeInstanceId);

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
                {loadingRuntimes ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : connectedRuntimes.length === 0 ? (
                  <div className="flex h-9 items-center rounded-md border border-border px-3">
                    <span className="text-sm text-muted-foreground">No runtimes available</span>
                  </div>
                ) : (
                  <Select
                    value={runtimeInstanceId ?? ""}
                    onValueChange={(v) => { if (v) setRuntimeInstanceId(v); }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select runtime...">
                        {selectedRuntime && (
                          <span className="flex items-center gap-1.5">
                            {selectedRuntime.hostingMode === "cloud" ? (
                              <Cloud size={12} className="shrink-0 text-blue-400" />
                            ) : (
                              <Monitor size={12} className="shrink-0 text-green-400" />
                            )}
                            {selectedRuntime.label}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {connectedRuntimes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          <span className="flex items-center gap-1.5">
                            {rt.hostingMode === "cloud" ? (
                              <Cloud size={12} className="shrink-0 text-blue-400" />
                            ) : (
                              <Monitor size={12} className="shrink-0 text-green-400" />
                            )}
                            {rt.label}
                            <span className="text-xs text-muted-foreground">
                              ({rt.sessionCount} session{rt.sessionCount !== 1 ? "s" : ""})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
