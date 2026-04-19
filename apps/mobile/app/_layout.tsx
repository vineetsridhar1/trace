import "@/lib/platform-mobile";
import "@/lib/event-bindings";

import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore, type AuthState } from "@trace/client-core";

export default function RootLayout() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const loading = useAuthStore((s: AuthState) => s.loading);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  if (loading) {
    return (
      <>
        <StatusBar style="light" />
        <View style={styles.splash}>
          <ActivityIndicator color="#fff" />
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
});
