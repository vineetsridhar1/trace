import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { NoOrgWelcome } from "@/components/onboarding/NoOrgWelcome";
import { AppConnectivityBanner } from "@/components/navigation/AppConnectivityBanner";
import { useHydrate } from "@/hooks/useHydrate";
import { useMyBridges } from "@/hooks/useMyBridges";
import { useRegisterPushToken } from "@/lib/notifications";

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const hasOrg = useAuthStore((s: AuthState) => s.orgMemberships.length > 0);
  useHydrate(activeOrgId);
  useMyBridges(activeOrgId);
  useRegisterPushToken();

  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!hasOrg) return <NoOrgWelcome />;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sessions" options={{ headerShown: false }} />
      </Stack>
      <AppConnectivityBanner />
    </View>
  );
}
