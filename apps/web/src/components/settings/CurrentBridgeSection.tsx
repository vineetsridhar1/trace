import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

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
      toast.success("Bridge renamed");
      await onRenamed?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename bridge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4 rounded-lg border border-border bg-surface-deep p-4">
      <div className="mb-3 flex items-center gap-2">
        <Laptop size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">This Bridge</h2>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-sm text-muted-foreground" htmlFor="bridge-name">
            Bridge name
          </label>
          <Input
            id="bridge-name"
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
        </div>
        <div className="flex items-end">
          <Button onClick={() => void saveLabel()} disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        Instance ID: {bridgeInfo?.instanceId ?? "Loading..."}
      </p>
    </section>
  );
}
