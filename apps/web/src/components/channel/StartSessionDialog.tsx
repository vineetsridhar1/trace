import { useState } from "react";
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
import { gql } from "@urql/core";

const START_SESSION_MUTATION = gql`
  mutation StartSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
    }
  }
`;

const RUN_SESSION_MUTATION = gql`
  mutation RunSession($id: ID!, $prompt: String) {
    runSession(id: $id, prompt: $prompt) {
      id
    }
  }
`;

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>("claude_code");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool,
            hosting: "cloud",
            channelId,
            prompt: prompt.trim(),
          },
        })
        .toPromise();

      const sessionId = result.data?.startSession?.id;
      if (sessionId) {
        await client.mutation(RUN_SESSION_MUTATION, { id: sessionId, prompt: prompt.trim() }).toPromise();
        setPrompt("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

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
            <div>
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
