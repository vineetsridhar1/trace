import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, Plus, RotateCcw, Save, Square, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const isElectron = typeof window.trace?.getBridgeTunnelSlots === "function";

function toDraftSlots(slots: DesktopBridgeTunnelSlot[]): DesktopBridgeTunnelSlotInput[] {
  return slots.map(({ state: _state, lastError: _lastError, ...slot }) => slot);
}

function createSlotId(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function statusTone(state: DesktopBridgeTunnelState): string {
  switch (state) {
    case "running":
      return "bg-emerald-500/15 text-emerald-400";
    case "error":
      return "bg-destructive/10 text-destructive";
    case "configured":
      return "bg-sky-500/15 text-sky-400";
    case "stopped":
    default:
      return "bg-border text-muted-foreground";
  }
}

export function BridgeTunnelSettingsCard() {
  const [savedSlots, setSavedSlots] = useState<DesktopBridgeTunnelSlot[]>([]);
  const [draftSlots, setDraftSlots] = useState<DesktopBridgeTunnelSlotInput[]>([]);
  const [loading, setLoading] = useState(isElectron);
  const [saving, setSaving] = useState(false);
  const [actingSlotId, setActingSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const dirty = JSON.stringify(draftSlots) !== JSON.stringify(toDraftSlots(savedSlots));
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!isElectron) return;

    let cancelled = false;
    setLoading(true);

    void window.trace!
      .getBridgeTunnelSlots()
      .then((slots) => {
        if (cancelled) return;
        setSavedSlots(slots);
        setDraftSlots(toDraftSlots(slots));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load tunnel slots.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = window.trace!.onBridgeTunnelSlots((slots) => {
      setSavedSlots(slots);
      if (!dirtyRef.current) {
        setDraftSlots(toDraftSlots(slots));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!isElectron) return null;

  async function saveSlots() {
    setSaving(true);
    setError(null);
    try {
      const slots = await window.trace!.saveBridgeTunnelSlots(draftSlots);
      setSavedSlots(slots);
      setDraftSlots(toDraftSlots(slots));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save tunnel slots.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    slotId: string,
    action: () => Promise<DesktopBridgeTunnelActionResult>,
  ) {
    setActingSlotId(slotId);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Tunnel action failed.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Tunnel action failed.");
    } finally {
      setActingSlotId(null);
    }
  }

  const savedSlotById = new Map(savedSlots.map((slot) => [slot.id, slot]));

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-deep p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Public Tunnels</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure reusable public URLs for this Electron bridge. Manual slots power preview
            immediately; managed ngrok slots can also be started and stopped from mobile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraftSlots((current) => [
                ...current,
                {
                  id: createSlotId(),
                  label: `Tunnel ${current.length + 1}`,
                  provider: "custom",
                  mode: "manual",
                  publicUrl: "",
                  targetPort: null,
                  updatedAt: new Date().toISOString(),
                },
              ])
            }
          >
            <Plus size={14} />
            Add Slot
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDraftSlots(toDraftSlots(savedSlots))} disabled={!dirty || saving}>
            <RotateCcw size={14} />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={saveSlots} disabled={!dirty || saving}>
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-border/70 bg-surface p-4 text-sm text-muted-foreground">
          Loading tunnel slots...
        </div>
      ) : draftSlots.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-surface p-4 text-sm text-muted-foreground">
          No tunnel slots yet. Add a manual public URL or a managed ngrok slot.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {draftSlots.map((slot) => {
            const savedSlot = savedSlotById.get(slot.id) ?? null;
            const isManagedNgrok = slot.mode === "trace_managed" && slot.provider === "ngrok";
            const busy = actingSlotId === slot.id;
            return (
              <div key={slot.id} className="rounded-lg border border-border/70 bg-surface p-3">
                <div className="grid gap-3 lg:grid-cols-[1.1fr,0.9fr,0.9fr,1.4fr,0.8fr,auto]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Label
                    </label>
                    <Input
                      value={slot.label}
                      onChange={(event) =>
                        setDraftSlots((current) =>
                          current.map((candidate) =>
                            candidate.id === slot.id
                              ? {
                                  ...candidate,
                                  label: event.target.value,
                                  updatedAt: new Date().toISOString(),
                                }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Provider
                    </label>
                    <Select
                      value={slot.provider}
                      onValueChange={(value) => {
                        if (!value) return;
                        setDraftSlots((current) =>
                          current.map((candidate) =>
                            candidate.id === slot.id
                              ? {
                                  ...candidate,
                                  provider: value,
                                  mode:
                                    value === "custom" && candidate.mode === "trace_managed"
                                      ? "manual"
                                      : candidate.mode,
                                  updatedAt: new Date().toISOString(),
                                }
                              : candidate,
                          ),
                        )
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom URL</SelectItem>
                        <SelectItem value="ngrok">ngrok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Mode
                    </label>
                    <Select
                      value={slot.mode}
                      onValueChange={(value) => {
                        if (!value) return;
                        setDraftSlots((current) =>
                          current.map((candidate) =>
                            candidate.id === slot.id
                              ? {
                                  ...candidate,
                                  mode: value,
                                  provider:
                                    value === "trace_managed" ? "ngrok" : candidate.provider,
                                  updatedAt: new Date().toISOString(),
                                }
                              : candidate,
                          ),
                        )
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="trace_managed">Trace managed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Public URL
                    </label>
                    <Input
                      value={slot.publicUrl}
                      onChange={(event) =>
                        setDraftSlots((current) =>
                          current.map((candidate) =>
                            candidate.id === slot.id
                              ? {
                                  ...candidate,
                                  publicUrl: event.target.value,
                                  updatedAt: new Date().toISOString(),
                                }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="https://your-domain.ngrok.app"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Target Port
                    </label>
                    <Input
                      value={slot.targetPort == null ? "" : String(slot.targetPort)}
                      onChange={(event) =>
                        setDraftSlots((current) =>
                          current.map((candidate) =>
                            candidate.id === slot.id
                              ? {
                                  ...candidate,
                                  targetPort:
                                    event.target.value.trim() === ""
                                      ? null
                                      : Number(event.target.value),
                                  updatedAt: new Date().toISOString(),
                                }
                              : candidate,
                          ),
                        )
                      }
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="3000"
                    />
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    {isManagedNgrok ? (
                      savedSlot?.state === "running" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={dirty || busy}
                          onClick={() =>
                            void runAction(slot.id, () => window.trace!.stopBridgeTunnel(slot.id))
                          }
                        >
                          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Square size={14} />}
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={dirty || busy}
                          onClick={() =>
                            void runAction(slot.id, () => window.trace!.startBridgeTunnel(slot.id))
                          }
                        >
                          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
                          Start
                        </Button>
                      )
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDraftSlots((current) => current.filter((candidate) => candidate.id !== slot.id))
                      }
                    >
                      <Trash2 size={14} />
                      Remove
                    </Button>
                  </div>
                </div>

                {savedSlot ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(savedSlot.state)}`}
                    >
                      {savedSlot.state}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(savedSlot.updatedAt).toLocaleString()}
                    </span>
                    {savedSlot.lastError ? (
                      <span className="text-xs text-destructive">{savedSlot.lastError}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {dirty ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Save changes before starting or stopping managed tunnels.
        </p>
      ) : null}
    </div>
  );
}
