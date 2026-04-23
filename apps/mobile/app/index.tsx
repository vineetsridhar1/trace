import { Redirect } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { KeyboardProvider } from "react-native-keyboard-controller";

export default function RootIndex() {
  const user = useAuthStore((s: AuthState) => s.user);
  return (
    <KeyboardProvider>
      <Redirect href={user ? "/(authed)/(tabs)/(home)" : "/(auth)/sign-in"} />
    </KeyboardProvider>
  );
}
