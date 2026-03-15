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
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION, RUN_SESSION_MUTATION } from "../../lib/mutations";
import {
  type InteractionMode,
  MODE_CYCLE,
  MODE_CONFIG,
  wrapPrompt,
} from "../session/interactionModes";
import { cn } from "../../lib/utils";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>("claude_code");
  const [hosting, setHosting] = useState<string>("local");
  const [mode, setMode] = useState<InteractionMode>("code");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

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
            hosting,
            channelId,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Coding tool
                </label>
                <Select value={tool} onValueChange={(v) => { if (v) setTool(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude_code">Claude Code</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                    <SelectItem value="cursor">Cursor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Hosting
                </label>
                <Select value={hosting} onValueChange={(v) => { if (v) setHosting(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <Button type="submit" disabled={!prompt.trim() || creating}>
              {creating ? "Starting..." : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
