import { Redirect } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";

export default function RootIndex() {
  const user = useAuthStore((s: AuthState) => s.user);
  return <Redirect href={user ? "/(authed)/(tabs)/(home)" : "/(auth)/sign-in"} />;
}
