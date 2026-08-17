import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { useTerminalStore } from "./terminal";
import { useUIStore } from "./ui";

/**
 * Terminal lifecycle events contain terminal metadata only. Terminal input and
 * output remain exclusively in the terminal relay and WebSocket transport.
 */
export function reconcileTerminalEvent(event: Event): void {
  const payload = asJsonObject(event.payload);
  if (!payload) return;

  if (event.eventType === "terminal_created") {
    const terminal = asJsonObject(payload.terminal);
    if (
      !terminal ||
      typeof terminal.id !== "string" ||
      typeof terminal.sessionId !== "string" ||
      typeof terminal.sessionGroupId !== "string"
    ) {
      return;
    }
    const terminalStore = useTerminalStore.getState();
    terminalStore.addTerminal(
      terminal.id,
      terminal.sessionId,
      terminal.sessionGroupId,
      terminal.closed === true ? "exited" : "active",
    );
    if (terminalStore.consumePinnedTerminalRequest(terminal.sessionId)) {
      useTerminalStore.getState().pinTerminal(terminal.id);
      const ui = useUIStore.getState();
      ui.setActiveSessionId(terminal.sessionId);
      ui.setActiveTerminalId(terminal.id);
    }
    return;
  }

  if (event.eventType === "terminal_destroyed" && typeof payload.terminalId === "string") {
    useTerminalStore.getState().removeTerminal(payload.terminalId);
    if (useUIStore.getState().activeTerminalId === payload.terminalId) {
      useUIStore.getState().setActiveTerminalId(null);
    }
  }
}
