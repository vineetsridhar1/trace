import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";

export default function AuthLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  if (user) return <Redirect href="/(authed)/(tabs)/(home)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
