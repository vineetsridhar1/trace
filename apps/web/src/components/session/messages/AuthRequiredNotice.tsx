import { useCallback, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useEntityField } from "@trace/client-core";
import { getCodingToolCli } from "@trace/shared";
import { Button } from "../../ui/button";
import { useEventScopeKey } from "../EventScopeContext";
import { getToolLoginTerminal, openToolLoginTerminal } from "../../../lib/coding-tool-login";
import { formatTime } from "./utils";

/**
 * Rendered for `auth_required` session output — the coding CLI rejected the
 * run because it isn't logged in. Offers the same login flow as running the
 * CLI in a terminal, opened in the in-session terminal panel.
 */
export function AuthRequiredNotice({ timestamp }: { timestamp: string }) {
  const scopeKey = useEventScopeKey();
  const sessionId = scopeKey.startsWith("session:") ? scopeKey.slice("session:".length) : "";
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const [opening, setOpening] = useState(false);

  const toolLabel = (tool && getCodingToolCli(tool)?.label) || "The coding tool";
  const loginTerminal = tool ? getToolLoginTerminal(tool) : undefined;
  const canLogin = Boolean(loginTerminal && sessionGroupId);

  const handleLogin = useCallback(async () => {
    if (!loginTerminal || !sessionGroupId || opening) return;
    setOpening(true);
    try {
      await openToolLoginTerminal(sessionId, sessionGroupId, loginTerminal);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open login terminal");
    } finally {
      setOpening(false);
    }
  }, [loginTerminal, sessionGroupId, sessionId, opening]);

  return (
    <div className="activity-row">
      <div className="flex items-center gap-2">
        <KeyRound size={12} className="text-amber-500" />
        <span className="text-xs font-semibold text-foreground">{toolLabel} needs login</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
      </div>
      <div className="mt-1 ml-5 text-xs text-muted-foreground">
        {toolLabel} isn&apos;t signed in on this runtime, so the run couldn&apos;t start.
        {canLogin
          ? " Log in below, then resend your message."
          : " Log in from a terminal on the runtime, then resend your message."}
      </div>
      {canLogin && (
        <div className="mt-2 ml-5">
          <Button size="sm" variant="secondary" onClick={handleLogin} disabled={opening}>
            {opening ? "Opening terminal…" : "Log in"}
          </Button>
        </div>
      )}
    </div>
  );
}
