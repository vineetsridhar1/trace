import { useState } from "react";
import { KeyRound, RefreshCw, TerminalSquare, Wrench } from "lucide-react";
import { getCodingToolCli, type ActionRequiredArtifact } from "@trace/shared";
import {
  CREATE_TERMINAL_MUTATION,
  RETRY_SESSION_CONNECTION_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { client } from "../../../lib/urql";
import { useTerminalStore } from "../../../stores/terminal";
import { useUIStore } from "../../../stores/ui";
import { Button } from "../../ui/button";

const LOGIN_COMMANDS = {
  codex: "codex login",
  claude_code: "claude login",
  github: "gh auth login",
  pi: "pi\n/login",
} as const;

export function ActionRequiredArtifactCard({
  artifact,
  sessionId,
}: {
  artifact: ActionRequiredArtifact;
  sessionId?: string;
}) {
  const sessionGroupId = useEntityField("sessions", sessionId ?? "", "sessionGroupId") as
    | string
    | undefined;
  const setActivePage = useUIStore((state) => state.setActivePage);
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);
  const setShowTerminalPanel = useUIStore((state) => state.setShowTerminalPanel);
  const setActiveTerminalId = useUIStore((state) => state.setActiveTerminalId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const [working, setWorking] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const openApiTokens = () => {
    setSettingsInitialTab("api-keys");
    setActivePage("settings");
  };

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

  const retrySession = async () => {
    if (!sessionId) return;
    setRetrying(true);
    try {
      await client.mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId }).toPromise();
    } finally {
      setRetrying(false);
    }
  };

  const action =
    artifact.kind === "credential_required" ? (
      <Button size="sm" onClick={openApiTokens}>
        <KeyRound />
        Add {artifact.provider === "anthropic" ? "Anthropic" : "Codex"} credentials
      </Button>
    ) : artifact.kind === "login_required" ? (
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
      <div className="mt-3 flex flex-wrap gap-2">
        {action}
        {artifact.kind === "credential_required" && (
          <Button
            variant="outline"
            size="sm"
            disabled={retrying}
            onClick={() => void retrySession()}
          >
            <RefreshCw />
            {retrying ? "Retrying…" : "Retry session"}
          </Button>
        )}
      </div>
    </div>
  );
}
