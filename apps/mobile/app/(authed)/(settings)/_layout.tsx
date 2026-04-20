import { Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";

export default function SettingsLayout() {
  const user = useAuthStore((s: AuthState) => s.user);

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Settings",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerRight: () => (
            <TopBarPill
              actions={[
                {
                  id: "notifications",
                  accessibilityLabel: "Notifications",
                  symbol: "bell",
                  onPress: () => {},
                },
              ]}
              avatar={
                user
                  ? {
                      name: user.name ?? user.email ?? "?",
                      uri: user.avatarUrl,
                      accessibilityLabel: "Account",
                      onPress: () => {},
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
