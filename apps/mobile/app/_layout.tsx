import "@/lib/platform-mobile";
import "@/lib/event-bindings";

import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useRegisterPushToken } from "@/hooks/useRegisterPushToken";

export default function RootLayout() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const loading = useAuthStore((s: AuthState) => s.loading);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useRegisterPushToken();

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
      <Stack screenOptions={{ headerShown: false }} />
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
