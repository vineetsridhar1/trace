import { Laptop } from "lucide-react";
import type { AttachedCheckoutInfo } from "../../stores/bridges";
import { useDesktopBridgeInfo } from "../../stores/bridges";
import { cn } from "../../lib/utils";

export function SpotlightBridgeIndicator({ attached }: { attached: AttachedCheckoutInfo }) {
  const desktopBridgeInfo = useDesktopBridgeInfo();
  const isCurrentBridge = desktopBridgeInfo?.instanceId === attached.bridgeInstanceId;
  const isOtherBridge = !!desktopBridgeInfo && !isCurrentBridge;
  const title = isCurrentBridge
    ? `Spotlighted on this bridge: ${attached.bridgeLabel}`
    : isOtherBridge
      ? `Spotlighted on another bridge: ${attached.bridgeLabel}`
      : `Spotlighted on ${attached.bridgeLabel}`;

  return (
    <span title={title} className="inline-flex shrink-0" aria-label={title}>
      <Laptop
        className={cn(
          "h-3.5 w-3.5",
          isCurrentBridge
            ? "text-emerald-500"
            : isOtherBridge
              ? "text-amber-500"
              : "text-emerald-500",
        )}
      />
    </span>
  );
}
