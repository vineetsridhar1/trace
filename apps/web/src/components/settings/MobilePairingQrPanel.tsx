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
    <div className="mt-4 grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4">
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
        {requiresReachableUrl ? (
          <>
            <label
              htmlFor="mobile-pairing-public-url"
              className="text-xs font-medium text-muted-foreground"
            >
              Reachable Trace URL
            </label>
            <div className="mt-1.5 flex min-w-0 gap-2">
              <Input
                id="mobile-pairing-public-url"
                value={publicUrl}
                onChange={(event) => onPublicUrlChange(event.target.value)}
                placeholder="http://192.168.1.20:3000 or https://your-trace.ngrok-free.app"
                className="h-8 min-w-0 flex-1 text-xs"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button size="sm" onClick={onGenerateQr} disabled={generating || !publicUrl.trim()}>
                {generating ? "Generating..." : "Generate QR"}
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" onClick={onGenerateQr} disabled={generating}>
            {generating ? "Generating..." : qrDataUrl ? "New code" : "Generate QR"}
          </Button>
        )}
        <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
          {requiresReachableUrl ? (
            isLocal ? (
              "This should be the public URL that your phone can reach. The generated QR expires in 5 minutes and can only be used once."
            ) : (
              "Your current Trace URL is localhost, which your phone cannot reach. Enter the LAN or tunnel URL for this Trace window."
            )
          ) : (
            <>
              The generated QR expires in 5 minutes and can only be used once. Mobile will connect
              to <span className="font-mono">{hostedPairingBaseUrl}</span>.
            </>
          )}
        </div>
        {qrPayload ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Expires {formatMobilePairingDate(expiresAt)}
            </span>
            <Button variant="ghost" size="xs" onClick={onCopyPayload}>
              Copy code
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
