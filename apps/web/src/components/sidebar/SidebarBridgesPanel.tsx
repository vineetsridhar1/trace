import { useState } from "react";
import { ChevronRight, Laptop } from "lucide-react";
import { useMyBridges, type MyBridgeSummary, type SyncedCheckoutSummary } from "../../hooks/useMyBridges";
import { cn } from "../../lib/utils";

interface CheckoutRowItem {
  bridge: MyBridgeSummary;
  checkout: SyncedCheckoutSummary;
}

export function SidebarBridgesPanel() {
  const { bridges } = useMyBridges();
  const [collapsed, setCollapsed] = useState(false);

  const items: CheckoutRowItem[] = [];
  for (const bridge of bridges) {
    if (!bridge.connected) continue;
    for (const checkout of bridge.linkedCheckouts) {
      items.push({ bridge, checkout });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="px-2 py-1.5">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1 px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 transition-transform duration-200", !collapsed && "rotate-90")}
        />
        <span className="truncate">Syncing</span>
        <span className="ml-1 text-[10px] text-muted-foreground/60">{items.length}</span>
      </button>
      {!collapsed && (
        <div className="mt-1 space-y-0.5">
          {items.map((item) => (
            <CheckoutRow key={`${item.bridge.id}:${item.checkout.repoId}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckoutRow({ item }: { item: CheckoutRowItem }) {
  const { bridge, checkout } = item;
  const branchLabel = checkout.branch ?? "Syncing";

  return (
    <div
      className="flex items-center gap-2 px-1 py-1"
      title={`${checkout.sessionGroup.name} synced on ${bridge.label}`}
    >
      <Laptop size={14} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate font-medium text-foreground">{bridge.label}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="truncate text-foreground">{checkout.sessionGroup.name}</span>
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{branchLabel}</div>
      </div>
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
        aria-label="Syncing"
      />
    </div>
  );
}
