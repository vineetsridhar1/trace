import { useEffect, useState } from "react";
import type { ChannelBridgeOption } from "@trace/gql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { client } from "../../lib/urql";
import {
  CHANNEL_AVAILABLE_BRIDGES_QUERY,
  CREATE_CHANNEL_TERMINAL_MUTATION,
} from "@trace/client-core";
import { useTerminalStore } from "../../stores/terminal";

export interface ChannelTerminalCreated {
  id: string;
  bridgeRuntimeId: string;
}

interface CreateChannelTerminalDialogProps {
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled command when launched from a run-script button. */
  initialCommand?: string;
  /** Name shown on the resulting terminal tab (e.g. the run-script name). */
  customName?: string;
  onCreated?: (terminal: ChannelTerminalCreated) => void;
}

export function CreateChannelTerminalDialog({
  channelId,
  open,
  onOpenChange,
  initialCommand,
  customName,
  onCreated,
}: CreateChannelTerminalDialogProps) {
  const [bridges, setBridges] = useState<ChannelBridgeOption[] | null>(null);
  const [selectedBridge, setSelectedBridge] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCommand(initialCommand ?? "");
    setError(null);
    setBridges(null);
    setSelectedBridge(null);
    let cancelled = false;
    client
      .query(CHANNEL_AVAILABLE_BRIDGES_QUERY, { channelId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result: { data?: { channelAvailableBridges?: ChannelBridgeOption[] }; error?: Error }) => {
        if (cancelled) return;
        if (result.error) {
          setError(result.error.message);
          setBridges([]);
          return;
        }
        const options = result.data?.channelAvailableBridges ?? [];
        setBridges(options);
        const ownBridge = options.find((b) => b.isOwn);
        setSelectedBridge((ownBridge ?? options[0])?.runtimeInstanceId ?? null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setBridges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, channelId, initialCommand]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBridge) return;
    setCreating(true);
    setError(null);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_TERMINAL_MUTATION, {
          input: {
            channelId,
            bridgeRuntimeId: selectedBridge,
            cols: 80,
            rows: 24,
          },
        })
        .toPromise();
      if (result.error) throw result.error;
      const created = result.data?.createChannelTerminal as
        | { id: string; bridgeRuntimeId: string }
        | undefined;
      if (!created) throw new Error("Failed to create terminal");
      useTerminalStore.getState().addTerminal({
        id: created.id,
        channelId,
        bridgeRuntimeId: created.bridgeRuntimeId,
        status: "connecting",
        customName,
        initialCommand: command.trim() || undefined,
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create terminal");
    } finally {
      setCreating(false);
    }
  }

  const noBridges = bridges !== null && bridges.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New channel terminal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Bridge</label>
              {bridges === null ? (
                <p className="text-sm text-muted-foreground">Loading available bridges…</p>
              ) : noBridges ? (
                <p className="text-sm text-muted-foreground">
                  No bridges you can use have this repo linked. Link the repo on your local
                  machine, or ask a teammate for an all-sessions bridge access grant with
                  terminal capability.
                </p>
              ) : (
                <Select
                  value={selectedBridge ?? undefined}
                  onValueChange={(value: string | null) => setSelectedBridge(value ?? null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {bridges.find((b) => b.runtimeInstanceId === selectedBridge)?.label ??
                        "Select a bridge..."}
                      {bridges.find((b) => b.runtimeInstanceId === selectedBridge)?.isOwn
                        ? " (you)"
                        : ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bridges.map((bridge) => (
                      <SelectItem key={bridge.runtimeInstanceId} value={bridge.runtimeInstanceId}>
                        {bridge.label}
                        {bridge.isOwn ? " (you)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                Initial command (optional)
              </label>
              <Input
                value={command}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                placeholder="e.g. pnpm dev"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Runs in the main worktree of the channel's repo on the selected bridge.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedBridge || creating || noBridges}>
              {creating ? "Opening…" : "Open terminal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
