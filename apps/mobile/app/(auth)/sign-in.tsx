import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { API_URL, isApiUrlConfigured } from "@/lib/env";
import { haptic } from "@/lib/haptics";

const REDIRECT_URL = "trace://auth/callback";
const TERMS_URL = "https://trace.app/terms";
const PRIVACY_URL = "https://trace.app/privacy";

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
  const signInWithToken = useAuthStore((s: AuthState) => s.signInWithToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (loading) return;
    setError(null);
    if (!isApiUrlConfigured()) {
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
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_URL}/auth/github?origin=trace-mobile`,
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
        <Pressable
          accessibilityRole="button"
          onPress={handleSignIn}
          disabled={loading}
          style={({ pressed }) => [
            styles.button,
            (pressed || loading) && styles.buttonPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Continue with GitHub</Text>
          )}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={12}>
          <Text style={styles.footerLink}>Terms</Text>
        </Pressable>
        <Text style={styles.footerSep}>·</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={12}>
          <Text style={styles.footerLink}>Privacy</Text>
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
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  footerLink: {
    color: "#888",
    fontSize: 13,
  },
  footerSep: {
    color: "#444",
    fontSize: 13,
  },
});
