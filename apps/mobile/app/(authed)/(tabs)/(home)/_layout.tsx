import { Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";

export default function HomeLayout() {
  const user = useAuthStore((s: AuthState) => s.user);

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Home",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerRight: () => (
            <TopBarPill
              avatar={
                user
                  ? {
                      name: user.name ?? user.email ?? "?",
                      uri: user.avatarUrl,
                      accessibilityLabel: "Account",
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
