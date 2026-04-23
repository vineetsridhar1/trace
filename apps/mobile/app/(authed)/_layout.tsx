import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useHydrate } from "@/hooks/useHydrate";
import { useMyBridges } from "@/hooks/useMyBridges";

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  useHydrate(activeOrgId);
  useMyBridges(activeOrgId);

  if (!user) return <Redirect href="/(auth)/sign-in" />;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sessions" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
