import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, TerminalSquare, X } from "lucide-react";
import {
  CHANNEL_TERMINALS_QUERY,
  CREATE_CHANNEL_TERMINAL_MUTATION,
  DESTROY_TERMINAL_MUTATION,
} from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import type { Terminal } from "@trace/gql";
import { Button } from "../ui/button";
import { TerminalInstance } from "../session/TerminalInstance";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { parseRunScripts, type ConnectionRepoEntry } from "../../hooks/useConnections";
import { useTerminalStore, type TerminalEntry } from "../../stores/terminal";
export function ConnectionsRepoTerminals({ bridgeRuntimeId, entry }: { bridgeRuntimeId: string; entry: ConnectionRepoEntry }) {
  const scopeKey = `connection:${bridgeRuntimeId}:${entry.repo.id}`;
  const scripts = useMemo(() => parseRunScripts(entry.runScripts), [entry.runScripts]);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const terminals = useTerminalStore(
    useShallow((state) =>
      Object.values(state.terminals).filter((terminal) => terminal.sessionGroupId === scopeKey),
    ),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (activeId && terminals.some((terminal) => terminal.id === activeId)) return;
    setActiveId(terminals[0]?.id ?? null);
  }, [activeId, terminals]);
  const createTerminal = useCallback(
    async (script?: { name: string; command: string }) => {
      const result = await client
        .mutation(CREATE_CHANNEL_TERMINAL_MUTATION, {
          channelId: entry.channel.id,
          bridgeRuntimeId,
          cols: 80,
          rows: 24,
        })
        .toPromise();
      if (result.error) {
        console.error("[connections] failed to create terminal", result.error.message);
        return;
      }
      const terminal = result.data?.createChannelTerminal as Terminal | undefined;
      if (!terminal) return;
      addTerminal(terminal.id, entry.channel.id, scopeKey, "connecting", {
        customName: script?.name,
        initialCommand: script?.command,
      });
      setActiveId(terminal.id);
    },
    [addTerminal, bridgeRuntimeId, entry.channel.id, scopeKey],
  );
  const destroyTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      const result = await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
      if (result.error)
        console.error("[connections] failed to destroy terminal", result.error.message);
    },
    [removeTerminal],
  );
  useEffect(() => {
    let cancelled = false;
    void client
      .query(CHANNEL_TERMINALS_QUERY, {
        channelId: entry.channel.id,
        bridgeRuntimeId,
      })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const existing = result.data?.channelTerminals as Terminal[] | undefined;
        for (const terminal of existing ?? []) {
          if (!useTerminalStore.getState().terminals[terminal.id]) {
            addTerminal(terminal.id, entry.channel.id, scopeKey, "active");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [addTerminal, bridgeRuntimeId, entry.channel.id, scopeKey]);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#0a0a0a]">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-deep px-2 py-1.5">
        <TerminalSquare size={14} className="mr-1 text-muted-foreground" />
        {terminals.map((terminal: TerminalEntry, index: number) => (
          <button
            key={terminal.id}
            type="button"
            onClick={() => setActiveId(terminal.id)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs",
              activeId === terminal.id
                ? "bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {terminal.customName ?? `Terminal ${index + 1}`}
            <X
              size={12}
              className="opacity-60 hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                void destroyTerminal(terminal.id);
              }}
            />
          </button>
        ))}
        <Button size="xs" variant="ghost" onClick={() => void createTerminal()}>
          <Plus size={13} />
          New terminal
        </Button>
        {scripts.map((script) => (
          <Button
            key={script.name}
            size="xs"
            variant="secondary"
            onClick={() => void createTerminal(script)}
          >
            {script.name}
          </Button>
        ))}
      </div>
      <div className="relative h-80">
        {terminals.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No terminals
          </div>
        ) : (
          terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={cn("absolute inset-0", activeId === terminal.id ? "visible" : "invisible")}
            >
              <TerminalInstance terminalId={terminal.id} visible={activeId === terminal.id} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
