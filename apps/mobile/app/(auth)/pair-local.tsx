import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import type { BarcodeScanningResult } from "expo-camera";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button, Screen, Text } from "@/components/design-system";
import { activatePairedLocalConnection, getOrCreateLocalInstallId } from "@/lib/connection-target";
import { haptic } from "@/lib/haptics";
import { recreateClient } from "@/lib/urql";
import { useTheme } from "@/theme";

type PairingPayload = {
  v: number;
  kind: "trace-local-pair";
  baseUrl: string;
  pairingToken: string;
  expiresAt?: string;
};

type CameraPermissionStatus = "checking" | "granted" | "denied" | "unsupported";
type CameraModule = typeof import("expo-camera");

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.1";
const CAMERA_UNAVAILABLE_MESSAGE =
  "Camera scanning is not available in this build or on this device. Rebuild the local dev client or install the latest TestFlight build, or paste the pairing code below.";

function loadCameraModule(): CameraModule | null {
  try {
    // `expo-camera` evaluates native modules at import time. Keep this guarded so stale native
    // builds can still render the manual pairing fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-camera") as CameraModule;
  } catch (error) {
    console.warn("[pair-local] expo-camera unavailable", error);
    return null;
  }
}

const cameraModule = loadCameraModule();
const CameraView = cameraModule?.CameraView ?? null;

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
  if (payload.kind !== "trace-local-pair" || payload.v !== 1) {
    throw new Error("This QR code is not a Trace local pairing code");
  }
  if (typeof payload.baseUrl !== "string" || !/^https?:\/\//.test(payload.baseUrl)) {
    throw new Error("Pairing code is missing a valid host URL");
  }
  if (typeof payload.pairingToken !== "string" || payload.pairingToken.trim().length < 16) {
    throw new Error("Pairing code is missing a valid token");
  }
  return {
    v: 1,
    kind: "trace-local-pair",
    baseUrl: payload.baseUrl.replace(/\/+$/, ""),
    pairingToken: payload.pairingToken.trim(),
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
  };
}

export default function PairLocalScreen() {
  const router = useRouter();
  const theme = useTheme();
  const signInWithToken = useAuthStore((s: AuthState) => s.signInWithToken);
  const scanningRef = useRef(false);
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionStatus>(
    cameraModule ? "checking" : "unsupported",
  );
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const cameraSupported = CameraView !== null && cameraPermission !== "unsupported";
  const cameraGranted = cameraPermission === "granted";

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

  async function pairFromPayload(raw: string) {
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = parsePairingPayload(raw);
      const response = await fetch(`${payload.baseUrl}/auth/local-mobile/pair`, {
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

      activatePairedLocalConnection(payload.baseUrl);
      recreateClient();
      await signInWithToken(body.token);
      void haptic.success();
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : "Pairing failed");
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
    if (submitting || scanningRef.current || cameraPaused) return;
    scanningRef.current = true;
    setCameraPaused(true);
    setManualCode(result.data);
    void pairFromPayload(result.data).finally(() => {
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
            Pair with local session
          </Text>
          <Text variant="body" color="mutedForeground">
            Scan the QR code from your local Trace app, or paste the raw pairing JSON below.
          </Text>
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
          {cameraSupported && cameraGranted ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={submitting || cameraPaused ? undefined : handleBarcodeScanned}
            />
          ) : (
            <View style={[styles.cameraFallback, { backgroundColor: theme.colors.surface }]}>
              {cameraPermission === "checking" ? (
                <ActivityIndicator color={theme.colors.foreground} />
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
            {cameraSupported && cameraGranted && cameraPaused ? (
              <Button
                title="Scan again"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setCameraPaused(false);
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
            placeholder='{"kind":"trace-local-pair",...}'
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
