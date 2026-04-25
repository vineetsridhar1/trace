import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import { QrCode, RefreshCw, ShieldX, Smartphone } from "lucide-react";
import * as QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const PUBLIC_URL_KEY = "trace_local_mobile_public_url";

type LocalMobileDevice = {
  id: string;
  installId: string;
  deviceName?: string | null;
  platform?: "ios" | "android" | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function normalizePublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error("Public URL must start with http:// or https://");
  }
  return trimmed.replace(/\/+$/, "");
}

function deviceLabel(device: LocalMobileDevice): string {
  if (device.deviceName?.trim()) return device.deviceName;
  if (device.platform === "ios") return "iPhone";
  if (device.platform === "android") return "Android device";
  return `Install ${device.installId.slice(0, 8)}`;
}

export function LocalMobilePairingSection() {
  const [publicUrl, setPublicUrl] = useState(() => localStorage.getItem(PUBLIC_URL_KEY) ?? "");
  const [devices, setDevices] = useState<LocalMobileDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const response = await fetch(`${API_URL}/auth/local-mobile/devices`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        devices?: LocalMobileDevice[];
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load paired devices");
      }
      setDevices(body.devices ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load paired devices");
    } finally {
      setLoadingDevices(false);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    if (!qrPayload) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(qrPayload, { margin: 1, width: 320 })
      .then((next) => {
        if (!cancelled) setQrDataUrl(next);
      })
      .catch((error: unknown) => {
        console.error("[local-mobile-pairing] qr generation failed", error);
        if (!cancelled) {
          setQrDataUrl(null);
          toast.error("Failed to render pairing QR");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  async function handleGenerateQr() {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizePublicUrl(publicUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enter a valid public URL");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch(`${API_URL}/auth/local-mobile/pairing-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        pairingToken?: string;
        expiresAt?: string;
      };
      if (!response.ok || typeof body.pairingToken !== "string") {
        throw new Error(body.error ?? "Failed to create pairing code");
      }

      localStorage.setItem(PUBLIC_URL_KEY, normalizedUrl);
      setPublicUrl(normalizedUrl);
      setExpiresAt(body.expiresAt ?? null);
      setQrPayload(
        JSON.stringify({
          v: 1,
          kind: "trace-local-pair",
          baseUrl: normalizedUrl,
          pairingToken: body.pairingToken,
          expiresAt: body.expiresAt ?? undefined,
        }),
      );
      toast.success("Pairing QR ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create pairing code");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyPayload() {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(qrPayload);
      toast.success("Pairing code copied");
    } catch {
      toast.error("Failed to copy pairing code");
    }
  }

  async function handleRevoke(deviceId: string) {
    setRevokingId(deviceId);
    try {
      const response = await fetch(`${API_URL}/auth/local-mobile/devices/${deviceId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to revoke paired device");
      }
      toast.success("Paired device revoked");
      await loadDevices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke paired device");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-deep p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Mobile Pairing</h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Paste your public ngrok URL, generate a one-time QR code, and pair exactly one phone at
            a time without exposing open signup on the tunnel.
          </p>
        </div>
        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => {
            void loadDevices();
          }}
          disabled={loadingDevices}
        >
          <RefreshCw size={14} />
          Refresh Devices
        </Button>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="local-mobile-public-url"
              className="text-sm font-medium text-foreground"
            >
              Public server URL
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                id="local-mobile-public-url"
                value={publicUrl}
                onChange={(event) => setPublicUrl(event.target.value)}
                placeholder="https://your-trace.ngrok-free.app"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button
                className="w-full md:w-auto"
                onClick={handleGenerateQr}
                disabled={generating || !publicUrl.trim()}
              >
                {generating ? "Generating..." : "Generate QR"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This should be the public URL that your phone can reach. The generated QR expires in 5
              minutes and can only be used once.
            </p>
          </div>

          {qrPayload ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-foreground">Pairing payload</div>
                  <div className="text-xs text-muted-foreground">
                    Expires {formatDate(expiresAt)}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => void handleCopyPayload()}>
                  Copy JSON
                </Button>
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-surface px-3 py-2 text-xs text-muted-foreground">
                {qrPayload}
              </pre>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-3 flex items-center gap-2">
              <Smartphone size={15} className="text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">Paired devices</div>
            </div>
            {loadingDevices ? (
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
                        {deviceLabel(device)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Paired {formatDate(device.createdAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last seen {formatDate(device.lastSeenAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {device.platform ?? "mobile"}{" "}
                        {device.appVersion ? `· ${device.appVersion}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => void handleRevoke(device.id)}
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
        </div>

        <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border bg-background p-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Trace local mobile pairing QR code"
              className="h-auto w-full max-w-72 rounded-lg bg-white p-3"
            />
          ) : (
            <div className="max-w-56 text-center text-sm text-muted-foreground">
              Generate a pairing code to show the QR here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
