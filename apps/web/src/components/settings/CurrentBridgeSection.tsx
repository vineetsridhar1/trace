import { useEffect, useState } from "react";
import { Info, Laptop, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsStatusPill } from "./SettingsStatusPill";

const isElectron =
  typeof window !== "undefined" && typeof window.trace?.getBridgeInfo === "function";

interface CurrentBridgeSectionProps {
  onRenamed?: () => void | Promise<void>;
}

export function CurrentBridgeSection({ onRenamed }: CurrentBridgeSectionProps) {
  const [bridgeInfo, setBridgeInfo] = useState<DesktopBridgeInfo | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(isElectron);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.trace?.getBridgeInfo) return;

    let cancelled = false;
    setLoading(true);
    window.trace
      .getBridgeInfo()
      .then((info) => {
        if (cancelled) return;
        setBridgeInfo(info);
        setLabel(info.label);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load this bridge");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isElectron) return null;

  const trimmedLabel = label.trim();
  const canSave =
    !loading && !saving && Boolean(trimmedLabel) && trimmedLabel !== bridgeInfo?.label;

  const saveLabel = async () => {
    if (!window.trace?.setBridgeLabel || !canSave) return;

    setSaving(true);
    try {
      const nextInfo = await window.trace.setBridgeLabel(trimmedLabel);
      setBridgeInfo(nextInfo);
      setLabel(nextInfo.label);
      setEditing(false);
      toast.success("Bridge renamed");
      await onRenamed?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename bridge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <Laptop size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">
              {bridgeInfo?.label ?? "This device"}
            </p>
            <SettingsStatusPill tone="success" label="Connected" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This device · bridge running in the desktop app
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
            instance {bridgeInfo?.instanceId ?? "Loading..."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing((value) => !value)}
          disabled={loading}
        >
          <Pencil size={13} />
          Rename
        </Button>
      </div>
      {editing ? (
        <div className="mt-4 flex gap-2">
          <Input
            id="bridge-name"
            aria-label="Bridge name"
            value={label}
            maxLength={80}
            disabled={loading || saving}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveLabel();
              }
            }}
          />
          <Button onClick={() => void saveLabel()} disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      ) : null}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-background/50 px-3 py-2.5">
        <Info size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-4 text-muted-foreground">
          Sessions on this bridge run against your local checkouts. Other members need your approval
          before they can use it.
        </p>
      </div>
    </section>
  );
}
