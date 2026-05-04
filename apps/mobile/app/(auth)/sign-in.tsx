import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getPairedLocalApiUrl } from "@/lib/connection-target";

export default function SignInScreen() {
  const router = useRouter();
  const pairedLocalUrl = getPairedLocalApiUrl();

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.wordmark}>trace</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pair with Trace"
            onPress={() => router.push("/pair-local")}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Pair with Trace</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a pairing code"
          onPress={() => router.push("/pair-local")}
          hitSlop={12}
          style={({ pressed }) => [styles.footerAction, pressed && styles.buttonPressed]}
        >
          <Text style={styles.footerActionText}>Scan a pairing code</Text>
          <Text style={styles.footerHint}>
            {pairedLocalUrl
              ? `Saved local host: ${pairedLocalUrl}`
              : "Use Trace on web or desktop to generate a QR code"}
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
