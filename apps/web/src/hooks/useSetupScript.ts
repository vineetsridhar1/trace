import { useEffect, useRef } from "react";
import { useEntityField } from "../stores/entity";
import { useTerminalStore } from "../stores/terminal";
import type { SetupStatus } from "../stores/terminal";
import { client } from "../lib/urql";
import { CREATE_TERMINAL_MUTATION } from "../lib/mutations";
import { TerminalSocket } from "../lib/terminal-ws";

/**
 * Runs the channel's setup script automatically when the session's runtime connects.
 * Blocks terminal access (via setupStatus in terminal store) until complete.
 */
export function useSetupScript(sessionGroupId: string | null, channelId: string | null, sessionId: string | null) {
  const setupScript = useEntityField("channels", channelId ?? "", "setupScript") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId ?? "", "connection") as { state: string } | null | undefined;
  const hasStartedRef = useRef<Record<string, boolean>>({});

  const isConnected = connection?.state === "connected" || connection?.state === "degraded";
  const hasScript = Boolean(setupScript?.trim());

  useEffect(() => {
    if (!sessionGroupId || !sessionId || !channelId || !hasScript || !isConnected) return;

    // Already started or completed for this session group
    if (hasStartedRef.current[sessionGroupId]) return;
    const currentStatus = useTerminalStore.getState().setupStatus[sessionGroupId];
    if (currentStatus === "running" || currentStatus === "completed") return;

    hasStartedRef.current[sessionGroupId] = true;
    const { setSetupStatus } = useTerminalStore.getState();
    setSetupStatus(sessionGroupId, "running");

    let socket: TerminalSocket | null = null;

    (async () => {
      // Create a terminal for the setup script
      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
        .toPromise();

      if (result.error || !result.data?.createTerminal) {
        setSetupStatus(sessionGroupId, "failed", result.error?.message ?? "Failed to create terminal");
        hasStartedRef.current[sessionGroupId] = false;
        return;
      }

      const terminalId = (result.data.createTerminal as { id: string }).id;

      // Add to store so it's visible in the terminal panel
      useTerminalStore.getState().addTerminal(
        terminalId, sessionId, sessionGroupId, "connecting",
        { customName: "Setup" },
      );

      // Monitor the terminal for exit
      socket = new TerminalSocket(terminalId);

      socket.onEvent((event) => {
        switch (event.type) {
          case "ready":
            // Write the setup command
            socket!.write(setupScript!.trim() + "\n");
            break;
          case "exit": {
            const exitCode = event.exitCode;
            if (exitCode === 0) {
              setSetupStatus(sessionGroupId, "completed");
            } else {
              setSetupStatus(sessionGroupId, "failed", `Setup script exited with code ${exitCode}`);
            }
            useTerminalStore.getState().setTerminalStatus(terminalId, "exited");
            socket?.close();
            socket = null;
            break;
          }
          case "error":
            setSetupStatus(sessionGroupId, "failed", event.message ?? "Setup script error");
            useTerminalStore.getState().setTerminalStatus(terminalId, "exited");
            socket?.close();
            socket = null;
            break;
        }
      });

      socket.connect();
    })();

    return () => {
      if (socket) {
        socket.close();
        socket = null;
      }
    };
  }, [sessionGroupId, sessionId, channelId, hasScript, isConnected, setupScript]);
}
