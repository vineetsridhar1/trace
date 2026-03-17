import { useCallback, useState } from "react";
import { Plus, AlertTriangle, FolderOpen } from "lucide-react";
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
import { Input } from "../ui/input";
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
import { RuntimeSelector, CLOUD_RUNTIME_ID } from "../session/RuntimeSelector";
import type { RuntimeInfo } from "../session/RuntimeSelector";
import { cn } from "../../lib/utils";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>("claude_code");
  const [model, setModel] = useState<string | undefined>(getDefaultModel("claude_code"));
  const [runtimeInstanceId, setRuntimeInstanceId] = useState<string | undefined>(undefined);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [repoId, setRepoId] = useState<string | undefined>(undefined);
  const [branch, setBranch] = useState("");
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

  const handleRuntimeChange = useCallback((id: string | undefined, info: RuntimeInfo | null) => {
    setRuntimeInstanceId(id);
    setRuntimeInfo(info);
    // Reset repo selection when runtime changes — availability may differ
    setRepoId(undefined);
    setBranch("");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const wrappedPrompt = wrapPrompt(mode, prompt.trim());

      const isCloud = runtimeInstanceId === CLOUD_RUNTIME_ID;
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool,
            model: model ?? undefined,
            hosting: isCloud ? "cloud" : undefined,
            runtimeInstanceId: isCloud ? undefined : (runtimeInstanceId ?? undefined),
            channelId,
            repoId: repoId ?? undefined,
            branch: branch.trim() || undefined,
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
        setBranch("");
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
      setBranch("");
      setRuntimeInstanceId(undefined);
      setRuntimeInfo(null);
    }
  };

  // Determine if the selected runtime is a device bridge (local)
  const isDeviceBridge = runtimeInfo?.hostingMode === "local";
  const isCloud = !runtimeInstanceId || runtimeInstanceId === CLOUD_RUNTIME_ID;

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
                  onChange={handleRuntimeChange}
                />
              </div>
              {repoIds.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    Repository
                  </label>
                  <Select value={repoId ?? "__none__"} onValueChange={(v) => { if (v) { setRepoId(v === "__none__" ? undefined : v); setBranch(""); } }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No repo</SelectItem>
                      {repoIds.map((id) => (
                        <RepoOption
                          key={id}
                          id={id}
                          isDeviceBridge={isDeviceBridge}
                          registeredRepoIds={runtimeInfo?.registeredRepoIds}
                        />
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

            {/* Branch selector — shown when a repo is selected */}
            {repoId && (
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Branch
                </label>
                <BranchInput repoId={repoId} value={branch} onChange={setBranch} />
              </div>
            )}

            {/* Warning when repo is not linked on device bridge */}
            {repoId && isDeviceBridge && runtimeInfo?.registeredRepoIds && !runtimeInfo.registeredRepoIds.includes(repoId) && (
              <RepoNotLinkedWarning repoId={repoId} />
            )}

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
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
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
            <Button type="submit" disabled={!prompt.trim() || creating}>
              {creating ? "Starting..." : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RepoOption({ id, isDeviceBridge, registeredRepoIds }: { id: string; isDeviceBridge: boolean; registeredRepoIds?: string[] }) {
  const name = useEntityField("repos", id, "name");
  const isLinked = !isDeviceBridge || !registeredRepoIds || registeredRepoIds.includes(id);

  return (
    <SelectItem value={id}>
      <span className="flex items-center gap-1.5">
        {name ?? id}
        {!isLinked && (
          <span className="flex items-center gap-0.5 text-xs text-amber-500">
            <AlertTriangle size={10} />
            not linked
          </span>
        )}
      </span>
    </SelectItem>
  );
}

function BranchInput({ repoId, value, onChange }: { repoId: string; value: string; onChange: (v: string) => void }) {
  const defaultBranch = useEntityField("repos", repoId, "defaultBranch");

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={defaultBranch ?? "main"}
    />
  );
}

function RepoNotLinkedWarning({ repoId }: { repoId: string }) {
  const name = useEntityField("repos", repoId, "name");
  const isElectron = typeof window.trace?.pickFolder === "function";

  const handleLink = async () => {
    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath) return;
    const folderPath = await window.trace.pickFolder();
    if (!folderPath) return;
    await window.trace.saveRepoPath(repoId, folderPath);
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-amber-200">
          <span className="font-medium">{name}</span> is not linked on this device.
        </p>
        {isElectron && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5"
            onClick={handleLink}
          >
            <FolderOpen size={12} />
            Choose folder to link
          </Button>
        )}
      </div>
    </div>
  );
}
