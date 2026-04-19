import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useHydrate } from "@/hooks/useHydrate";

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);

  useHydrate(activeOrgId);

  if (!user) return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
