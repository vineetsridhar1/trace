import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button, Screen, Text } from "@/components/design-system";
import {
  activatePairedLocalConnection,
  getOrCreateLocalInstallId,
} from "@/lib/connection-target";
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

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.1";

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
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);

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
      setCameraEnabled(false);
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

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (submitting || !cameraEnabled) return;
    setManualCode(result.data);
    setCameraEnabled(false);
    void pairFromPayload(result.data);
  }

  return (
    <Screen background="background">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
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
          {permission?.granted && cameraEnabled ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={submitting ? undefined : handleBarcodeScanned}
            />
          ) : (
            <View style={[styles.cameraFallback, { backgroundColor: theme.colors.surface }]}>
              {permission === null ? (
                <ActivityIndicator color={theme.colors.foreground} />
              ) : permission.granted ? (
                <Text variant="callout" color="mutedForeground" align="center">
                  Camera paused. Enable it again to rescan.
                </Text>
              ) : (
                <Text variant="callout" color="mutedForeground" align="center">
                  Camera access is required for scanning, but you can still paste the pairing code.
                </Text>
              )}
            </View>
          )}

          <View style={styles.cardActions}>
            {!permission?.granted ? (
              <Button
                title="Enable camera"
                variant="secondary"
                onPress={() => {
                  void requestPermission();
                }}
                disabled={submitting}
              />
            ) : (
              <Button
                title={cameraEnabled ? "Pause camera" : "Resume camera"}
                variant="secondary"
                onPress={() => setCameraEnabled((value) => !value)}
                disabled={submitting}
              />
            )}
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
      </ScrollView>
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
