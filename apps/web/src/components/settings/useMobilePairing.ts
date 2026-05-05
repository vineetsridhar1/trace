import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import * as QRCode from "qrcode";
import { toast } from "sonner";
import { isLocalMode } from "../../lib/runtime-mode";
import {
  isLoopbackPairingUrl,
  normalizePairingPublicUrl,
  type MobileDevice,
} from "./mobile-pairing-utils";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const PUBLIC_URL_KEY = "trace_mobile_pairing_public_url";
export const hostedPairingBaseUrl =
  API_URL.trim().length > 0 ? API_URL.replace(/\/+$/, "") : window.location.origin;
export const requiresReachablePairingUrl =
  isLocalMode || isLoopbackPairingUrl(hostedPairingBaseUrl);

export function useMobilePairing() {
  const [publicUrl, setPublicUrl] = useState(() => localStorage.getItem(PUBLIC_URL_KEY) ?? "");
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const response = await fetch(`${API_URL}/auth/mobile/devices`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        devices?: MobileDevice[];
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
        console.error("[mobile-pairing] qr generation failed", error);
        if (!cancelled) {
          setQrDataUrl(null);
          toast.error("Failed to render pairing QR");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  async function generateQr() {
    let normalizedUrl = hostedPairingBaseUrl;
    if (requiresReachablePairingUrl) {
      try {
        normalizedUrl = normalizePairingPublicUrl(publicUrl);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enter a valid public URL");
        return;
      }
    }

    setGenerating(true);
    try {
      const response = await fetch(`${API_URL}/auth/mobile/pairing-token`, {
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

      if (requiresReachablePairingUrl) {
        localStorage.setItem(PUBLIC_URL_KEY, normalizedUrl);
        setPublicUrl(normalizedUrl);
      }
      setExpiresAt(body.expiresAt ?? null);
      setQrPayload(
        JSON.stringify({
          v: 1,
          kind: "trace-mobile-pair",
          mode: isLocalMode ? "local" : "hosted",
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

  async function copyPayload() {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(qrPayload);
      toast.success("Pairing code copied");
    } catch {
      toast.error("Failed to copy pairing code");
    }
  }

  async function revokeDevice(deviceId: string) {
    setRevokingId(deviceId);
    try {
      const response = await fetch(`${API_URL}/auth/mobile/devices/${deviceId}`, {
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

  return {
    publicUrl,
    setPublicUrl,
    devices,
    loadingDevices,
    generating,
    qrPayload,
    qrDataUrl,
    expiresAt,
    revokingId,
    loadDevices,
    generateQr,
    copyPayload,
    revokeDevice,
  };
}
