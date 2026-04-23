import "@/lib/platform-mobile";
import "@/lib/event-bindings";

import { useEffect } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  markAppBackgrounded,
  markAppForegrounded,
  markAppInteractive,
} from "@/lib/perf";

export default function RootLayout() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const loading = useAuthStore((s: AuthState) => s.loading);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (loading) return;
    markAppInteractive();
  }, [loading]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        markAppBackgrounded();
      } else if (state === "active") {
        markAppForegrounded();
      }
    });
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.splash}>
          <ActivityIndicator color="#fff" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <KeyboardProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
});
