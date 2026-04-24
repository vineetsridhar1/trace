import { Stack, useRouter } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";

export default function HomeLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Home",
          headerLargeTitle: true,
          headerRight: () => (
            <TopBarPill
              avatar={
                user
                  ? {
                      name: user.name ?? user.email ?? "?",
                      uri: user.avatarUrl,
                      accessibilityLabel: "Account",
                      onPress: () => router.push("/sheets/account"),
                    }
                  : undefined
              }
            />
          ),
        }}
      />
    </Stack>
  );
}
