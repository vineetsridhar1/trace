import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { formatMobilePairingDate } from "./mobile-pairing-utils";

type MobilePairingQrPanelProps = {
  publicUrl: string;
  hostedPairingBaseUrl: string;
  isLocal: boolean;
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
  generating,
  qrPayload,
  qrDataUrl,
  expiresAt,
  onPublicUrlChange,
  onGenerateQr,
  onCopyPayload,
}: MobilePairingQrPanelProps) {
  return (
    <div className="mt-4 grid min-w-0 gap-4">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          {isLocal ? (
            <>
              <label
                htmlFor="mobile-pairing-public-url"
                className="text-sm font-medium text-foreground"
              >
                Public server URL
              </label>
              <div className="flex min-w-0 flex-col gap-3 md:flex-row">
                <Input
                  id="mobile-pairing-public-url"
                  value={publicUrl}
                  onChange={(event) => onPublicUrlChange(event.target.value)}
                  placeholder="https://your-trace.ngrok-free.app"
                  className="min-w-0 flex-1"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  className="w-full md:w-auto"
                  onClick={onGenerateQr}
                  disabled={generating || !publicUrl.trim()}
                >
                  {generating ? "Generating..." : "Generate QR"}
                </Button>
              </div>
            </>
          ) : (
            <Button className="w-full md:w-auto" onClick={onGenerateQr} disabled={generating}>
              {generating ? "Generating..." : "Generate QR"}
            </Button>
          )}
          <div className="text-xs text-muted-foreground">
            {isLocal ? (
              "This should be the public URL that your phone can reach. The generated QR expires in 5 minutes and can only be used once."
            ) : (
              <>
                The generated QR expires in 5 minutes and can only be used once. Mobile will connect
                to <span className="font-mono">{hostedPairingBaseUrl}</span>.
              </>
            )}
          </div>
        </div>

        {qrPayload ? (
          <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">Pairing payload</div>
                <div className="text-xs text-muted-foreground">
                  Expires {formatMobilePairingDate(expiresAt)}
                </div>
              </div>
              <Button variant="secondary" onClick={onCopyPayload}>
                Copy JSON
              </Button>
            </div>
            <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface px-3 py-2 text-xs text-muted-foreground">
              {qrPayload}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-64 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background p-4">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Trace mobile pairing QR code"
            className="box-border h-auto w-full max-w-[min(18rem,100%)] rounded-lg bg-white p-3"
          />
        ) : (
          <div className="max-w-56 text-center text-sm text-muted-foreground">
            Generate a pairing code to show the QR here.
          </div>
        )}
      </div>
    </div>
  );
}
