import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { formatMobilePairingDate } from "./mobile-pairing-utils";

type MobilePairingQrPanelProps = {
  publicUrl: string;
  hostedPairingBaseUrl: string;
  isLocal: boolean;
  requiresReachableUrl: boolean;
  generating: boolean;
  qrPayload: string | null;
  qrDataUrl: string | null;
  expiresAt: string | null;
  onPublicUrlChange: (value: string) => void;
  onGenerateQr: () => void;
  onCopyPayload: () => void;
};

export function MobilePairingQrPanel({
  publicUrl,
  hostedPairingBaseUrl,
  isLocal,
  requiresReachableUrl,
  generating,
  qrPayload,
  qrDataUrl,
  expiresAt,
  onPublicUrlChange,
  onGenerateQr,
  onCopyPayload,
}: MobilePairingQrPanelProps) {
  return (
    <div className="mt-4 min-w-0">
      {requiresReachableUrl ? (
        <div className="mb-4">
          <div className="flex items-end gap-2">
            <label htmlFor="mobile-pairing-public-url" className="min-w-0 flex-1">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Reachable Trace URL
              </span>
              <Input
                id="mobile-pairing-public-url"
                value={publicUrl}
                onChange={(event) => onPublicUrlChange(event.target.value)}
                placeholder="http://192.168.1.20:3000"
                className="h-8 w-full text-xs"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <Button size="sm" onClick={onGenerateQr} disabled={generating || !publicUrl.trim()}>
              {generating ? "Generating..." : qrDataUrl ? "New code" : "Generate QR"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {isLocal
              ? "Use a LAN or tunnel URL your phone can reach."
              : "Localhost cannot be reached from your phone. Enter a LAN or tunnel URL."}
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-start gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-2">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Trace mobile pairing QR code"
              className="h-full w-full rounded bg-white p-1"
            />
          ) : (
            <span className="text-center text-[11px] leading-4 text-muted-foreground">
              QR appears here
            </span>
          )}
        </div>
        <div className="min-w-0">
          {!requiresReachableUrl ? (
            <Button size="sm" onClick={onGenerateQr} disabled={generating}>
              {generating ? "Generating..." : qrDataUrl ? "New code" : "Generate QR"}
            </Button>
          ) : null}
          <p className="text-[11px] leading-4 text-muted-foreground">
            {qrDataUrl
              ? `Code expires ${formatMobilePairingDate(expiresAt)} and can only be used once.`
              : "Generate a one-time pairing code, then scan it with the Trace mobile app."}
          </p>
          {!requiresReachableUrl ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              Connects to <span className="font-mono">{hostedPairingBaseUrl}</span>
            </p>
          ) : null}
          {qrPayload ? (
            <Button variant="ghost" size="xs" onClick={onCopyPayload} className="mt-2">
              Copy pairing code
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
