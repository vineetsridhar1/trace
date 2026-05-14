import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import type { BarcodeScanningResult } from "expo-camera";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button, Screen, TraceLoader, Text } from "@/components/design-system";
import {
  activateHostedConnection,
  activatePairedLocalConnection,
  getHostedApiUrl,
  getOrCreateLocalInstallId,
} from "@/lib/connection-target";
import { haptic } from "@/lib/haptics";
import { recreateClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

type PairingPayload = {
  v: number;
  kind: "trace-mobile-pair";
  mode: "hosted" | "local";
  baseUrl: string;
  pairingToken: string;
  expiresAt?: string;
};

type CameraPermissionStatus = "checking" | "granted" | "denied" | "unsupported";
type CameraModule = typeof import("expo-camera");

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.1";
const CAMERA_UNAVAILABLE_MESSAGE =
  "Camera scanning is not available in this build or on this device. Rebuild the local dev client or install the latest TestFlight build, or paste the pairing code below.";
const INVALID_QR_MESSAGE = "That QR code is not a valid Trace pairing code.";
const EXPIRED_QR_MESSAGE = "That pairing code is invalid or expired. Generate a new QR code in Trace.";
const UNREACHABLE_QR_MESSAGE =
  "This phone could not reach the Trace server in that QR code. Generate a new code from a reachable Trace URL.";

function loadCameraModule(): CameraModule | null {
  try {
    // `expo-camera` evaluates native modules at import time. Keep this guarded so stale native
    // builds can still render the manual pairing fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-camera") as CameraModule;
  } catch (error) {
    console.warn("[pair] expo-camera unavailable", error);
    return null;
  }
}

const cameraModule = loadCameraModule();
const CameraView = cameraModule?.CameraView ?? null;

function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.endsWith(".local")) return true;
  if (normalized === "::1") return false;
  if (
    normalized.includes(":") &&
    (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"))
  ) {
    return true;
  }

  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

function parsePairingPayload(raw: string): PairingPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Pairing code is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Pairing code is invalid");
  }

  const payload = parsed as Partial<PairingPayload>;
  if (payload.kind !== "trace-mobile-pair" || payload.v !== 1) {
    throw new Error("This QR code is not a Trace pairing code");
  }
  if (payload.mode !== "hosted" && payload.mode !== "local") {
    throw new Error("Pairing code is missing a valid mode");
  }
  if (typeof payload.baseUrl !== "string") {
    throw new Error("Pairing code is missing a valid host URL");
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(payload.baseUrl);
  } catch {
    throw new Error("Pairing code is missing a valid host URL");
  }
  const localHttp =
    payload.mode === "local" &&
    baseUrl.protocol === "http:" &&
    isLocalNetworkHostname(baseUrl.hostname) &&
    !isLoopbackHostname(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !localHttp) {
    throw new Error("Pairing code is missing a valid host URL");
  }
  if (typeof payload.pairingToken !== "string" || payload.pairingToken.trim().length < 16) {
    throw new Error("Pairing code is missing a valid token");
  }
  return {
    v: 1,
    kind: "trace-mobile-pair",
    mode: payload.mode,
    baseUrl: baseUrl.toString().replace(/\/+$/, ""),
    pairingToken: payload.pairingToken.trim(),
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
  };
}

function getPairingErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Pairing failed";
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("not valid json") ||
    message.includes("pairing code is invalid") ||
    message.includes("not a trace pairing code") ||
    message.includes("missing a valid") ||
    message.includes("missing the trace server url")
  ) {
    return INVALID_QR_MESSAGE;
  }

  if (message.includes("invalid or expired") || message.includes("expired")) {
    return EXPIRED_QR_MESSAGE;
  }

  if (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  ) {
    return UNREACHABLE_QR_MESSAGE;
  }

  return error.message;
}

export default function PairScreen() {
  const router = useRouter();
  const theme = useTheme();
  const signInWithToken = useAuthStore((s: AuthState) => s.signInWithToken);
  const scanningRef = useRef(false);
  const lastScannedQrRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionStatus>(
    cameraModule ? "checking" : "unsupported",
  );
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const cameraSupported = CameraView !== null && cameraPermission !== "unsupported";
  const cameraGranted = cameraPermission === "granted";

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraModule || !CameraView) {
      setCameraPermission("unsupported");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        if (Platform.OS === "web") {
          const available = await CameraView.isAvailableAsync();
          if (!available) {
            if (!cancelled) {
              setCameraPermission("unsupported");
            }
            return;
          }
        }

        const result = await cameraModule.Camera.getCameraPermissionsAsync();
        if (result.granted) {
          if (!cancelled) {
            setCameraPermission("granted");
          }
          return;
        }

        if (result.status === "undetermined") {
          const requestResult = await cameraModule.Camera.requestCameraPermissionsAsync();
          if (!cancelled) {
            setCameraPermission(requestResult.granted ? "granted" : "denied");
          }
          return;
        }

        if (!cancelled) {
          setCameraPermission("denied");
        }
      } catch {
        if (!cancelled) {
          setCameraPermission("unsupported");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3600);
  }

  async function pairFromPayload(raw: string, options?: { showToastOnError?: boolean }) {
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = parsePairingPayload(raw);
      const baseUrl = payload.baseUrl || getHostedApiUrl();
      if (!baseUrl) {
        throw new Error("Pairing code is missing the Trace server URL");
      }
      const response = await fetch(`${baseUrl}/auth/mobile/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingToken: payload.pairingToken,
          installId: getOrCreateLocalInstallId(),
          deviceName: Constants.deviceName ?? `Trace ${Platform.OS}`,
          platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : undefined,
          appVersion: APP_VERSION,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };
      if (!response.ok || typeof body.token !== "string") {
        throw new Error(body.error ?? "Pairing failed");
      }

      if (payload.mode === "local") {
        activatePairedLocalConnection(baseUrl);
      } else {
        activateHostedConnection(baseUrl);
      }
      recreateClient();
      await signInWithToken(body.token);
      void haptic.success();
    } catch (pairError) {
      const message = getPairingErrorMessage(pairError);
      setError(message);
      if (options?.showToastOnError) {
        showToast(message);
      }
      void haptic.error();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaste() {
    const raw = await Clipboard.getStringAsync();
    if (!raw.trim()) {
      setError("Clipboard does not contain a pairing code");
      void haptic.error();
      return;
    }
    setManualCode(raw);
    await pairFromPayload(raw);
  }

  async function handleEnableCamera() {
    if (!cameraModule) {
      setCameraPermission("unsupported");
      setError(CAMERA_UNAVAILABLE_MESSAGE);
      void haptic.error();
      return;
    }

    try {
      const result = await cameraModule.Camera.requestCameraPermissionsAsync();
      setCameraPermission(result.granted ? "granted" : "denied");
      if (!result.granted) {
        setError(
          "Camera access is required for scanning, but you can still paste the pairing code.",
        );
        void haptic.error();
      }
    } catch {
      setCameraPermission("unsupported");
      setError(CAMERA_UNAVAILABLE_MESSAGE);
      void haptic.error();
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const qrData = result.data.trim();
    if (!qrData || submitting || scanningRef.current || lastScannedQrRef.current === qrData) {
      return;
    }

    lastScannedQrRef.current = qrData;
    scanningRef.current = true;
    setManualCode(qrData);
    void pairFromPayload(qrData, { showToastOnError: true }).finally(() => {
      scanningRef.current = false;
    });
  }

  return (
    <Screen background="background">
      <KeyboardAwareScrollView
        bottomOffset={theme.spacing.lg}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
        ]}
        extraKeyboardSpace={theme.spacing.lg}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text variant="subheadline" color="mutedForeground">
              Back
            </Text>
          </Pressable>
          <Text variant="title2" color="foreground">
            Pair mobile app
          </Text>
          <Text variant="body" color="mutedForeground">
            Scan the QR code from Trace on web or desktop, or paste the raw pairing JSON below.
          </Text>
        </View>

        {toastMessage ? (
          <View
            pointerEvents="none"
            accessibilityRole="alert"
            style={[
              styles.toast,
              {
                backgroundColor: theme.colors.destructiveMuted,
                borderColor: alpha(theme.colors.destructive, 0.35),
              },
            ]}
          >
            <Text variant="footnote" color="destructive" align="center">
              {toastMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
            },
          ]}
        >
          {cameraSupported && cameraGranted ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={submitting ? undefined : handleBarcodeScanned}
            />
          ) : (
            <View style={[styles.cameraFallback, { backgroundColor: theme.colors.surface }]}>
              {cameraPermission === "checking" ? (
                <TraceLoader size="large" color="foreground" />
              ) : cameraPermission === "unsupported" ? (
                <Text variant="callout" color="mutedForeground" align="center">
                  {CAMERA_UNAVAILABLE_MESSAGE}
                </Text>
              ) : (
                <Text variant="callout" color="mutedForeground" align="center">
                  Camera access is required for scanning, but you can still paste the pairing code.
                </Text>
              )}
            </View>
          )}

          <View style={styles.cardActions}>
            {cameraSupported && !cameraGranted ? (
              <Button
                title="Enable camera"
                variant="secondary"
                onPress={() => {
                  void handleEnableCamera();
                }}
                disabled={submitting}
              />
            ) : null}
            <Button
              title="Paste from clipboard"
              variant="ghost"
              onPress={() => {
                void handlePaste();
              }}
              disabled={submitting}
            />
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
            },
          ]}
        >
          <Text variant="subheadline" color="foreground">
            Pairing code
          </Text>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder='{"kind":"trace-mobile-pair",...}'
            placeholderTextColor={theme.colors.dimForeground}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            style={[
              styles.input,
              {
                color: theme.colors.foreground,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderMuted,
              },
            ]}
          />
          <Button
            title="Pair from code"
            onPress={() => {
              void pairFromPayload(manualCode);
            }}
            disabled={submitting || manualCode.trim().length === 0}
            loading={submitting}
          />
          {error ? (
            <Text variant="footnote" color="destructive">
              {error}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  toast: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 16,
    gap: 14,
  },
  camera: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  cameraFallback: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  cardActions: {
    gap: 10,
  },
  input: {
    minHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    textAlignVertical: "top",
    fontSize: 14,
  },
});
