import { useState } from "react";
import { TerminalSquare, Wrench } from "lucide-react";
import { getCodingToolCli, type ActionRequiredArtifact } from "@trace/shared";
import {
  CREATE_TERMINAL_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { client } from "../../../lib/urql";
import { useTerminalStore } from "../../../stores/terminal";
import { useUIStore } from "../../../stores/ui";
import { Button } from "../../ui/button";
import { CredentialRequiredArtifactActions } from "./CredentialRequiredArtifactActions";

const LOGIN_COMMANDS = {
  codex: "codex login",
  claude_code: "claude\n/login",
  github: "gh auth login",
  pi: "pi\n/login",
} as const;

export function ActionRequiredArtifactCard({
  artifact,
  sessionId,
  repeatCount = 1,
}: {
  artifact: ActionRequiredArtifact;
  sessionId?: string;
  repeatCount?: number;
}) {
  const sessionGroupId = useEntityField("sessions", sessionId ?? "", "sessionGroupId") as
    | string
    | undefined;
  const setShowTerminalPanel = useUIStore((state) => state.setShowTerminalPanel);
  const setActiveTerminalId = useUIStore((state) => state.setActiveTerminalId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const [working, setWorking] = useState(false);
  const openLoginTerminal = async () => {
    if (artifact.kind !== "login_required" || !sessionGroupId || !sessionId) return;
    setWorking(true);
    try {
      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
        .toPromise();
      const terminal = result.data?.createTerminal as { id: string } | undefined;
      if (!terminal) return;
      addTerminal(terminal.id, sessionId, sessionGroupId, "connecting", {
        customName: "Sign in",
        initialCommand: LOGIN_COMMANDS[artifact.provider],
      });
      setActiveTerminalId(terminal.id);
      setShowTerminalPanel(true);
    } finally {
      setWorking(false);
    }
  };

  const installTool = async () => {
    if (artifact.kind !== "tool_not_installed") return;
    const desktop = window.trace?.installOrUpdateCodingTool;
    if (desktop) {
      setWorking(true);
      try {
        await desktop(artifact.tool);
      } finally {
        setWorking(false);
      }
      return;
    }
    const command = getCodingToolCli(artifact.tool)?.install;
    if (command) await navigator.clipboard?.writeText(command);
  };

  const action =
    artifact.kind === "login_required" ? (
      <Button
        size="sm"
        disabled={working || !sessionGroupId}
        onClick={() => void openLoginTerminal()}
      >
        <TerminalSquare />
        {working ? "Opening terminal…" : "Open terminal and sign in"}
      </Button>
    ) : (
      <Button size="sm" disabled={working} onClick={() => void installTool()}>
        <Wrench />
        {working
          ? "Installing…"
          : window.trace?.installOrUpdateCodingTool
            ? "Install tool"
            : "Copy install command"}
      </Button>
    );

  return (
    <div className="my-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{artifact.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{artifact.description}</p>
      {repeatCount > 1 && (
        <p className="mt-1 text-xs text-muted-foreground">
          This failure repeated {repeatCount} times while the tool retried.
        </p>
      )}
      {artifact.kind === "credential_required" ? (
        <CredentialRequiredArtifactActions provider={artifact.provider} sessionId={sessionId} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">{action}</div>
      )}
    </div>
  );
}
