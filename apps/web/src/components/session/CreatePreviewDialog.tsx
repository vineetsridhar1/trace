import { useState } from "react";
import { Loader2 } from "lucide-react";
import { CREATE_PREVIEW_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
} from "../ui/responsive-dialog";

type Visibility = "org" | "public";

export function CreatePreviewDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [port, setPort] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("org");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const parsedPort = Number(port);
    if (!command.trim()) {
      setError("Command is required.");
      return;
    }
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError("Port must be between 1 and 65535.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await client
      .mutation(CREATE_PREVIEW_MUTATION, {
        input: {
          sessionId,
          command: command.trim(),
          cwd: cwd.trim() || null,
          port: parsedPort,
          visibility,
        },
      })
      .toPromise();
    setSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create preview</DialogTitle>
          <DialogDescription>Run a server process and expose its HTTP port.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Command</span>
            <Input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="pnpm dev"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-[1fr_104px] gap-3">
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Working directory</span>
              <Input
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder="apps/web"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Port</span>
              <Input
                value={port}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
                placeholder="3000"
              />
            </label>
          </div>
          <div className="flex rounded-lg border border-border p-1">
            <button
              type="button"
              className={`h-7 flex-1 rounded-md text-sm transition-colors ${
                visibility === "org"
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setVisibility("org")}
            >
              Org
            </button>
            <button
              type="button"
              className={`h-7 flex-1 rounded-md text-sm transition-colors ${
                visibility === "public"
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setVisibility("public")}
            >
              Public
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
