import { useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import {
  QUEUE_SESSION_MESSAGE_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { SessionApplicationProcess } from "@trace/gql";
import { toast } from "sonner";
import { client } from "../../../lib/urql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { buildPreviewFixPrompt } from "./preview-recovery";
import { RESTART_PROCESS_MUTATION } from "./session-applications-operations";

type RecoveryAction = "ai" | "retry";

export function PreviewRecoveryActions({
  className,
  process,
  sessionGroupId,
  sessionId,
  onRetried,
}: {
  className?: string;
  process: SessionApplicationProcess;
  sessionGroupId: string;
  sessionId: string | null;
  onRetried?: () => void | Promise<void>;
}) {
  const agentStatus = useEntityField("sessions", sessionId ?? "", "agentStatus") as
    | string
    | undefined;
  const [action, setAction] = useState<RecoveryAction | null>(null);

  const retry = async () => {
    setAction("retry");
    try {
      const result = await client
        .mutation(RESTART_PROCESS_MUTATION, {
          sessionGroupId,
          appConfigId: process.appConfigId,
          processConfigId: process.processConfigId,
        })
        .toPromise();
      if (result.error) throw result.error;
      await onRetried?.();
      toast.success("Restarting live preview");
    } catch (error) {
      toast.error("Failed to restart preview", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAction(null);
    }
  };

  const fixWithAi = async () => {
    if (!sessionId) return;
    setAction("ai");
    try {
      const mutation =
        agentStatus === "active" ? QUEUE_SESSION_MESSAGE_MUTATION : SEND_SESSION_MESSAGE_MUTATION;
      const result = await client
        .mutation(mutation, {
          sessionId,
          text: buildPreviewFixPrompt(process),
        })
        .toPromise();
      if (result.error) throw result.error;
      toast.success(agentStatus === "active" ? "AI fix queued" : "AI is investigating the preview");
    } catch (error) {
      toast.error("Failed to ask AI to fix the preview", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAction(null);
    }
  };

  return (
    <div
      className={cn(
        "z-20 flex max-w-md flex-col gap-3 rounded-lg border border-border bg-background/95 p-4 shadow-xl backdrop-blur",
        className,
      )}
      role="alert"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Live preview stopped</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Trace couldn&apos;t keep the preview running.
        </p>
        {process.lastError ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-destructive">
            {process.lastError}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void fixWithAi()} disabled={!sessionId || action !== null}>
          <Sparkles className="size-3.5" />
          Fix with AI
        </Button>
        <Button size="sm" variant="outline" onClick={() => void retry()} disabled={action !== null}>
          <RotateCw className={cn("size-3.5", action === "retry" && "animate-spin")} />
          Retry
        </Button>
      </div>
    </div>
  );
}
