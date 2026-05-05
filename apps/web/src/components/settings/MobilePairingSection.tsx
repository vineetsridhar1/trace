import { QrCode, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { isLocalMode } from "../../lib/runtime-mode";
import { MobilePairingQrPanel } from "./MobilePairingQrPanel";
import { PairedMobileDevicesList } from "./PairedMobileDevicesList";
import { hostedPairingBaseUrl, useMobilePairing } from "./useMobilePairing";

export function MobilePairingSection() {
  const pairing = useMobilePairing();

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-deep p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Mobile Pairing</h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Generate a one-time QR code from this signed-in account, then scan it from the mobile
            app to pair exactly one phone.
          </p>
        </div>
        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => {
            void pairing.loadDevices();
          }}
          disabled={pairing.loadingDevices}
        >
          <RefreshCw size={14} />
          Refresh Devices
        </Button>
      </div>

      <MobilePairingQrPanel
        publicUrl={pairing.publicUrl}
        hostedPairingBaseUrl={hostedPairingBaseUrl}
        isLocal={isLocalMode}
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
