import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useConnectionStore, type ConnectionState } from "../stores/connection";
import { CircleDot } from "lucide-react";

type DesktopBridgeStatus = Awaited<ReturnType<NonNullable<Window["trace"]>["getBridgeStatus"]>>;

const isElectron = typeof window.trace?.getBridgeStatus === "function";

export function ConnectionStatus() {
  const [status, setStatus] = useState<DesktopBridgeStatus | null>(null);
  const connected = useConnectionStore((s: ConnectionState) => s.connected);

  useEffect(() => {
    if (!isElectron || !window.trace?.getBridgeStatus || !window.trace?.onBridgeStatus) return;

    let cancelled = false;
    window.trace.getBridgeStatus().then((nextStatus) => {
      if (!cancelled) setStatus(nextStatus);
    });

    const unsubscribe = window.trace.onBridgeStatus((nextStatus) => {
      setStatus(nextStatus);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const bridgeStatus = isElectron ? (status ?? "connecting") : null;

  let health: "healthy" | "degraded" | "down" = "healthy";
  if (!connected && isElectron && bridgeStatus === "disconnected") {
    health = "down";
  } else if (!connected || bridgeStatus === "connecting" || bridgeStatus === "disconnected") {
    health = "degraded";
  }

  const indicatorClass =
    health === "healthy" ? "text-green-500" : health === "down" ? "text-red-500" : "text-yellow-500";

  const summaryLabel = !isElectron
    ? connected
      ? "Client Connected"
      : "Client Disconnected"
    : health === "healthy"
      ? "All Connections Healthy"
      : health === "down"
        ? "All Connections Down"
        : "Connection Degraded";

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={`ml-auto flex h-8 items-center rounded-md px-1.5 ${indicatorClass}`}
        aria-label={summaryLabel}
      >
        <CircleDot className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent className="flex min-w-44 flex-col items-start gap-1.5 px-3 py-2">
        <div className="font-medium">{summaryLabel}</div>
        <div className="flex w-full items-center justify-between gap-4">
          <span>Client</span>
          <span>{connected ? "connected" : "disconnected"}</span>
        </div>
        {bridgeStatus && (
          <div className="flex w-full items-center justify-between gap-4">
            <span>Bridge</span>
            <span>{bridgeStatus}</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
