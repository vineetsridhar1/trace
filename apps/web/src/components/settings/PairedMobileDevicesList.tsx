import { ShieldX, Smartphone } from "lucide-react";
import { Button } from "../ui/button";
import {
  formatMobilePairingDate,
  mobileDeviceLabel,
  type MobileDevice,
} from "./mobile-pairing-utils";

type PairedMobileDevicesListProps = {
  devices: MobileDevice[];
  loading: boolean;
  revokingId: string | null;
  onRevoke: (deviceId: string) => void;
};

export function PairedMobileDevicesList({
  devices,
  loading,
  revokingId,
  onRevoke,
}: PairedMobileDevicesListProps) {
  return (
    <div className="mt-4 min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone size={15} className="text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">Paired devices</div>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading paired devices...</div>
      ) : devices.length === 0 ? (
        <div className="text-sm text-muted-foreground">No mobile devices are paired yet.</div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface-deep p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {mobileDeviceLabel(device)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Paired {formatMobilePairingDate(device.createdAt)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last seen {formatMobilePairingDate(device.lastSeenAt)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {device.platform ?? "mobile"} {device.appVersion ? `· ${device.appVersion}` : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => onRevoke(device.id)}
                disabled={revokingId === device.id}
              >
                <ShieldX size={14} />
                {revokingId === device.id ? "Revoking..." : "Revoke"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
