import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
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
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (qrDataUrl) setQrOpen(true);
  }, [qrDataUrl]);

  return (
    <div className="mt-4 min-w-0">
      {requiresReachableUrl ? (
        <div className="mb-4">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
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
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              aria-label="Open pairing QR code"
              className="h-full w-full cursor-zoom-in rounded bg-white p-1"
            >
              <img src={qrDataUrl} alt="Trace mobile pairing QR code" className="h-full w-full" />
            </button>
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

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] gap-3 p-5 sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle>Scan to pair your phone</DialogTitle>
            <DialogDescription>
              Open the Trace mobile app and scan this one-time code.
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Trace mobile pairing QR code"
              className="mx-auto aspect-square w-[min(78vw,360px)] rounded-xl bg-white p-3"
            />
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            Expires {formatMobilePairingDate(expiresAt)} and can only be used once.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
