import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useAuthStore, type AuthState } from "@trace/client-core";
import {
  activateHostedConnection,
  getHostedApiUrl,
  getPairedLocalApiUrl,
  hasHostedApiUrlConfigured,
} from "@/lib/connection-target";
import { haptic } from "@/lib/haptics";
import { recreateClient } from "@/lib/urql";

const REDIRECT_URL = "trace://auth/callback";

function tokenFromCallback(rawUrl: string): string | null {
  try {
    const parsed = ExpoLinking.parse(rawUrl);
    const token = parsed.queryParams?.token;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

export default function SignInScreen() {
  const router = useRouter();
  const signInWithToken = useAuthStore((s: AuthState) => s.signInWithToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairedLocalUrl = getPairedLocalApiUrl();

  async function handleSignIn() {
    if (loading) return;
    setError(null);
    if (!hasHostedApiUrlConfigured()) {
      // Validation fails before the request even goes out — fire only the
      // error haptic so the user doesn't feel a confusing tap+error pair.
      setError(
        "EXPO_PUBLIC_API_URL is not configured. Restart Metro with " +
          "EXPO_PUBLIC_API_URL=http://<host>:4000.",
      );
      void haptic.error();
      return;
    }
    void haptic.light();
    setLoading(true);
    try {
      activateHostedConnection();
      recreateClient();
      const result = await WebBrowser.openAuthSessionAsync(
        `${getHostedApiUrl()}/auth/github?origin=trace-mobile`,
        REDIRECT_URL,
      );
      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") return;
        setError("Sign-in did not complete. Please try again.");
        void haptic.error();
        return;
      }
      const token = tokenFromCallback(result.url);
      if (!token) {
        setError("Sign-in returned no token. Please try again.");
        void haptic.error();
        return;
      }
      await signInWithToken(token);
      void haptic.success();
    } catch (err) {
      console.error("[sign-in] failed", err);
      setError("Something went wrong. Please try again.");
      void haptic.error();
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.wordmark}>trace</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with GitHub"
            onPress={handleSignIn}
            disabled={loading}
            style={({ pressed }) => [styles.button, (pressed || loading) && styles.buttonPressed]}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Continue with GitHub</Text>
            )}
          </Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pair with local session"
          onPress={() => router.push("/pair-local")}
          disabled={loading}
          hitSlop={12}
          style={({ pressed }) => [styles.footerAction, (pressed || loading) && styles.buttonPressed]}
        >
          <Text style={styles.footerActionText}>Pair with local session</Text>
          <Text style={styles.footerHint}>
            {pairedLocalUrl ? `Saved host: ${pairedLocalUrl}` : "Scan a QR code from local Trace"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  actions: {
    width: "100%",
    alignItems: "center",
  },
  wordmark: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  button: {
    backgroundColor: "#fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    minWidth: 240,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#ff6b6b",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  footer: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 8,
  },
  footerAction: {
    alignItems: "center",
    gap: 4,
  },
  footerActionText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
  },
  footerHint: {
    color: "#666",
    fontSize: 11,
    textAlign: "center",
  },
});
