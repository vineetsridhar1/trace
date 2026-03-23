import { useCallback, useState } from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { Plus } from "lucide-react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";
import { Button } from "../ui/button";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION, RUN_SESSION_MUTATION } from "../../lib/mutations";
import { type InteractionMode, MODE_CYCLE, wrapPrompt } from "../session/interactionModes";
import { getDefaultModel } from "../session/modelOptions";
import { CLOUD_RUNTIME_ID } from "../session/RuntimeSelector";
import type { RuntimeInfo } from "../session/RuntimeSelector";
import { usePreferencesStore } from "../../stores/preferences";
import { useEntityField } from "../../stores/entity";
import { SessionFormFields } from "./SessionFormFields";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const prefTool = usePreferencesStore((s) => s.defaultTool);
  const prefModel = usePreferencesStore((s) => s.defaultModel);

  const initialTool = prefTool ?? "claude_code";
  const initialModel = prefModel ?? getDefaultModel(initialTool);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>(initialTool);
  const [model, setModel] = useState<string | undefined>(initialModel);
  const [runtimeInstanceId, setRuntimeInstanceId] = useState<string | undefined>(undefined);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [repoId, setRepoId] = useState<string | undefined>(undefined);
  const [branch, setBranch] = useState("");
  const [mode, setMode] = useState<InteractionMode>("code");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const channelRepo = useEntityField("channels", channelId, "repo") as { id: string; name: string } | null | undefined;
  const channelRepoId = channelRepo?.id ?? undefined;
  const isMobile = useIsMobile();

  const cycleMode = useCallback(() => {
    setMode((prev) => MODE_CYCLE[(MODE_CYCLE.indexOf(prev) + 1) % MODE_CYCLE.length]);
  }, []);

  const handleToolChange = useCallback((v: string) => {
    setTool(v);
    setModel(getDefaultModel(v));
  }, []);

  const handleRuntimeChange = useCallback((id: string | undefined, info: RuntimeInfo | null) => {
    setRuntimeInstanceId(id);
    setRuntimeInfo(info);
    setRepoId(undefined);
    setBranch("");
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      const resetTool = prefTool ?? "claude_code";
      setTool(resetTool);
      setModel(prefModel ?? getDefaultModel(resetTool));
      setRepoId(undefined);
      setBranch("");
      setRuntimeInstanceId(undefined);
      setRuntimeInfo(null);
    }
  };

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
            repoId: channelRepoId ?? repoId ?? undefined,
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
            <SessionFormFields
              tool={tool}
              model={model}
              runtimeInstanceId={runtimeInstanceId}
              runtimeInfo={runtimeInfo}
              repoId={repoId}
              branch={branch}
              mode={mode}
              dialogOpen={open}
              channelRepoId={channelRepoId}
              onToolChange={handleToolChange}
              onModelChange={setModel}
              onRuntimeChange={handleRuntimeChange}
              onRepoChange={setRepoId}
              onBranchChange={setBranch}
              onModeChange={cycleMode}
            />
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">What should the agent work on?</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Fix the login bug on the signup page..."
                autoFocus={!isMobile}
                rows={4}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(e); }}
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
