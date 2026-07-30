import { QrCode, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { isLocalMode } from "../../lib/runtime-mode";
import { MobilePairingQrPanel } from "./MobilePairingQrPanel";
import { PairedMobileDevicesList } from "./PairedMobileDevicesList";
import {
  hostedPairingBaseUrl,
  requiresReachablePairingUrl,
  useMobilePairing,
} from "./useMobilePairing";

export function MobilePairingSection() {
  const pairing = useMobilePairing();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-muted-foreground" />
            <h3 className="text-[13px] font-semibold text-foreground">Pair the mobile app</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Scan with the Trace mobile app to follow sessions from your phone.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            void pairing.loadDevices();
          }}
          disabled={pairing.loadingDevices}
        >
          <RefreshCw size={14} />
          <span className="sr-only">Refresh devices</span>
        </Button>
      </div>

      <MobilePairingQrPanel
        publicUrl={pairing.publicUrl}
        hostedPairingBaseUrl={hostedPairingBaseUrl}
        isLocal={isLocalMode}
        requiresReachableUrl={requiresReachablePairingUrl}
        generating={pairing.generating}
        qrPayload={pairing.qrPayload}
        qrDataUrl={pairing.qrDataUrl}
        expiresAt={pairing.expiresAt}
        onPublicUrlChange={pairing.setPublicUrl}
        onGenerateQr={() => {
          void pairing.generateQr();
        }}
        onCopyPayload={() => {
          void pairing.copyPayload();
        }}
      />

      <PairedMobileDevicesList
        devices={pairing.devices}
        loading={pairing.loadingDevices}
        revokingId={pairing.revokingId}
        onRevoke={(deviceId) => {
          void pairing.revokeDevice(deviceId);
        }}
      />
    </div>
  );
}
