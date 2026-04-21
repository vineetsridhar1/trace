import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Play, Plus, TerminalSquare, X } from "lucide-react";
import type { Terminal as GqlTerminal } from "@trace/gql";
import { TerminalInstance } from "../session/TerminalInstance";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { client } from "../../lib/urql";
import {
  CHANNEL_TERMINALS_QUERY,
  DESTROY_TERMINAL_MUTATION,
  useEntityField,
} from "@trace/client-core";
import {
  useChannelTerminals,
  useTerminalStore,
  type TerminalEntry,
} from "../../stores/terminal";
import { CreateChannelTerminalDialog } from "./CreateChannelTerminalDialog";

interface RunScript {
  name: string;
  command: string;
}

export function ChannelTerminalsPanel({ channelId }: { channelId: string }) {
  const terminals = useChannelTerminals(channelId);
  const runScripts = useEntityField("channels", channelId, "runScripts") as
    | RunScript[]
    | null
    | undefined;

  const [expanded, setExpanded] = useState(false);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scriptDraft, setScriptDraft] = useState<RunScript | null>(null);

  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    client
      .query(CHANNEL_TERMINALS_QUERY, { channelId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result: { data?: { channelTerminals?: GqlTerminal[] } }) => {
        if (cancelled) return;
        const existing = result.data?.channelTerminals ?? [];
        for (const terminal of existing) {
          if (!useTerminalStore.getState().terminals[terminal.id]) {
            addTerminal({
              id: terminal.id,
              channelId,
              bridgeRuntimeId: terminal.bridgeRuntimeId,
              status: "active",
            });
          }
        }
        if (existing.length > 0) setExpanded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, addTerminal]);

  useEffect(() => {
    if (!activeTerminalId || terminals.some((t) => t.id === activeTerminalId)) return;
    setActiveTerminalId(terminals[0]?.id ?? null);
  }, [activeTerminalId, terminals]);

  const handleDestroy = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) {
        const next = terminals.find((t) => t.id !== terminalId);
        setActiveTerminalId(next?.id ?? null);
      }
      await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
    },
    [activeTerminalId, removeTerminal, terminals],
  );

  const openCreate = useCallback(() => {
    setScriptDraft(null);
    setDialogOpen(true);
  }, []);

  const openScript = useCallback((script: RunScript) => {
    setScriptDraft(script);
    setDialogOpen(true);
  }, []);

  const handleCreated = useCallback((created: { id: string }) => {
    setExpanded(true);
    setActiveTerminalId(created.id);
  }, []);

  return (
    <div className="border-b border-border bg-surface-deep">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-sm font-medium text-foreground"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <TerminalSquare size={14} className="text-muted-foreground" />
          Terminals
          {terminals.length > 0 && (
            <span className="ml-1 rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-muted-foreground">
              {terminals.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        {runScripts && runScripts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {runScripts.map((script) => (
              <Button
                key={script.name}
                size="sm"
                variant="outline"
                onClick={() => openScript(script)}
                className="h-7 gap-1 text-xs"
              >
                <Play size={12} />
                {script.name}
              </Button>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={openCreate} className="h-7 gap-1 text-xs">
          <Plus size={12} />
          New terminal
        </Button>
      </div>

      {expanded && terminals.length > 0 && (
        <div className="flex flex-col border-t border-border bg-[#0a0a0a]" style={{ height: 320 }}>
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
                  onClick={() => setActiveTerminalId(terminal.id)}
                  className="flex items-center gap-1.5 px-2 py-0.5"
                >
                  <span>{terminal.customName ?? `Terminal ${index + 1}`}</span>
                  {terminal.status === "exited" && (
                    <span className="text-[10px] text-muted-foreground">(exited)</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDestroy(terminal.id)}
                  className="flex h-5 w-5 items-center justify-center rounded opacity-50 transition-opacity hover:opacity-100"
                  title="Close terminal"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="relative flex-1 overflow-hidden">
            {terminals.map((terminal: TerminalEntry) => (
              <div
                key={terminal.id}
                className={cn(
                  "absolute inset-0",
                  activeTerminalId === terminal.id ? "visible" : "invisible",
                )}
              >
                <TerminalInstance
                  terminalId={terminal.id}
                  visible={activeTerminalId === terminal.id}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateChannelTerminalDialog
        channelId={channelId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialCommand={scriptDraft?.command}
        customName={scriptDraft?.name}
        onCreated={handleCreated}
      />
    </div>
  );
}
