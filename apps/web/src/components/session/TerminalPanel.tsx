import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pin, Plus, X, TerminalSquare } from "lucide-react";
import {
  useSessionGroupTerminals,
  useTerminalStore,
  type TerminalEntry,
} from "../../stores/terminal";
import { useEntityField } from "@trace/client-core";
import { TerminalInstance } from "./TerminalInstance";
import { client } from "../../lib/urql";
import {
  SESSION_TERMINALS_QUERY,
  DESTROY_TERMINAL_MUTATION,
} from "@trace/client-core";
import { cn } from "../../lib/utils";
import type { Terminal } from "@trace/gql";
import { useUIStore } from "../../stores/ui";
import { PinnedTerminalNotice } from "./PinnedTerminalNotice";
import { requestSessionTerminal } from "../../lib/terminal-creation";

export function TerminalPanel({
  sessionId,
  onClose,
  fill = false,
}: {
  sessionId: string;
  onClose: () => void;
  fill?: boolean;
}) {
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const pinnedTerminalIds = useTerminalStore((s) => s.pinnedTerminalIds);
  const pinTerminal = useTerminalStore((s) => s.pinTerminal);
  const unpinTerminal = useTerminalStore((s) => s.unpinTerminal);
  const mainActiveTerminalId = useUIStore((s) => s.activeTerminalId);
  const setMainActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setMainActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const pendingCreationIntentRef = useRef<string | null>(null);
  const groupTerminals = useSessionGroupTerminals(sessionGroupId ?? "");

  const terminals = useMemo(
    () => (sessionGroupId ? groupTerminals : []),
    [groupTerminals, sessionGroupId],
  );

  useEffect(() => {
    const pendingIntentId = pendingCreationIntentRef.current;
    const createdTerminal = pendingIntentId
      ? terminals.find((terminal: TerminalEntry) => terminal.creationIntentId === pendingIntentId)
      : undefined;
    if (createdTerminal) {
      pendingCreationIntentRef.current = null;
      setActiveTerminalId(createdTerminal.id);
      return;
    }
    if (activeTerminalId && terminals.some((terminal) => terminal.id === activeTerminalId)) return;
    setActiveTerminalId(terminals[0]?.id ?? null);
  }, [activeTerminalId, terminals]);

  const createNewTerminal = useCallback(async () => {
    if (!sessionGroupId) return;
    const request = requestSessionTerminal({ sessionId });
    pendingCreationIntentRef.current = request.clientMutationId;
    try {
      await request.completion;
    } catch (error) {
      if (pendingCreationIntentRef.current === request.clientMutationId) {
        pendingCreationIntentRef.current = null;
      }
      console.error(
        "[terminal] failed to create terminal:",
        error instanceof Error ? error.message : error,
      );
    }
  }, [sessionGroupId, sessionId]);

  const destroyTerminal = useCallback(
    async (terminalId: string) => {
      const result = await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
      if (result.error) {
        console.error("[terminal] failed to destroy terminal:", result.error.message);
      }
    },
    [],
  );

  const togglePinnedTerminal = useCallback(
    (terminal: TerminalEntry) => {
      if (pinnedTerminalIds[terminal.id]) {
        unpinTerminal(terminal.id);
        if (mainActiveTerminalId === terminal.id) setMainActiveTerminalId(null);
        return;
      }

      pinTerminal(terminal.id);
      setMainActiveSessionId(terminal.sessionId);
      setMainActiveTerminalId(terminal.id);
    },
    [
      mainActiveTerminalId,
      pinTerminal,
      pinnedTerminalIds,
      setMainActiveSessionId,
      setMainActiveTerminalId,
      unpinTerminal,
    ],
  );

  const hasTriggeredInit = useRef(false);
  useEffect(() => {
    if (hasTriggeredInit.current || !sessionGroupId) return;
    hasTriggeredInit.current = true;

    (async () => {
      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();

      if (result.error) {
        console.warn("[terminal] failed to query existing terminals:", result.error.message);
      }

      const existing = result.data?.sessionTerminals as Terminal[] | undefined;
      if (existing && existing.length > 0) {
        for (const terminal of existing) {
          if (!useTerminalStore.getState().terminals[terminal.id]) {
            addTerminal(terminal.id, terminal.sessionId, sessionGroupId, "active");
          }
        }
        setActiveTerminalId(existing[0]?.id ?? null);
        return;
      }

      createNewTerminal();
    })();
  }, [addTerminal, createNewTerminal, sessionGroupId, sessionId]);

  const selectedTerminalId = activeTerminalId ?? terminals[0]?.id ?? null;
  const pinnedSidebarTerminal = useMemo(
    () =>
      selectedTerminalId && pinnedTerminalIds[selectedTerminalId]
        ? terminals.find((terminal) => terminal.id === selectedTerminalId)
        : undefined,
    [pinnedTerminalIds, selectedTerminalId, terminals],
  );
  const activeMainTerminal = useMemo(
    () =>
      mainActiveTerminalId && pinnedTerminalIds[mainActiveTerminalId]
        ? terminals.find((terminal) => terminal.id === mainActiveTerminalId)
        : undefined,
    [mainActiveTerminalId, pinnedTerminalIds, terminals],
  );
  const terminalInMainPanel = activeMainTerminal ?? pinnedSidebarTerminal;

  const openMainTerminal = useCallback(() => {
    if (!terminalInMainPanel) return;
    setMainActiveSessionId(terminalInMainPanel.sessionId);
    setMainActiveTerminalId(terminalInMainPanel.id);
    onClose();
  }, [onClose, setMainActiveSessionId, setMainActiveTerminalId, terminalInMainPanel]);

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        fill ? "h-full min-h-0" : "border-t border-border",
      )}
      style={fill ? undefined : { height: 300 }}
    >
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-surface-deep px-2 py-1">
        <TerminalSquare size={14} className="mr-1.5 text-muted-foreground" />

        {terminals.map((terminal: TerminalEntry, index: number) => (
          <div
            key={terminal.id}
            className={cn(
              "flex items-center rounded text-xs transition-colors",
              activeTerminalId === terminal.id
                ? "bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (mainActiveTerminalId) setMainActiveTerminalId(null);
                setActiveTerminalId(terminal.id);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5"
            >
              <span>{terminal.customName ?? `Terminal ${index + 1}`}</span>
              {terminal.status === "exited" && (
                <span className="text-[10px] text-muted-foreground">(exited)</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => togglePinnedTerminal(terminal)}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded transition-colors",
                pinnedTerminalIds[terminal.id]
                  ? "text-foreground"
                  : "text-muted-foreground opacity-50 hover:opacity-100",
              )}
              title={pinnedTerminalIds[terminal.id] ? "Unpin from main tabs" : "Pin to main tabs"}
              aria-label={
                pinnedTerminalIds[terminal.id] ? "Unpin from main tabs" : "Pin to main tabs"
              }
              aria-pressed={Boolean(pinnedTerminalIds[terminal.id])}
            >
              <Pin size={11} className={pinnedTerminalIds[terminal.id] ? "fill-current" : ""} />
            </button>
            <button
              type="button"
              onClick={() => destroyTerminal(terminal.id)}
              className="flex h-5 w-5 items-center justify-center rounded opacity-50 transition-opacity hover:opacity-100"
              title="Close terminal"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <button
          onClick={createNewTerminal}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="New terminal"
        >
          <Plus size={12} />
        </button>

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Close terminal panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {terminalInMainPanel ? (
          <PinnedTerminalNotice onOpen={openMainTerminal} />
        ) : (
          terminals.map((terminal: TerminalEntry) => (
            <div
              key={terminal.id}
              className={cn(
                "absolute inset-0",
                selectedTerminalId === terminal.id ? "visible" : "invisible",
              )}
            >
              <TerminalInstance
                terminalId={terminal.id}
                visible={selectedTerminalId === terminal.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
