import { Stack, useRouter } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";

export default function ChannelsLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Channels",
          headerLargeTitle: true,
          headerTitleStyle: { color: "white" },
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
      <Stack.Screen
        name="[id]"
        options={{
          title: "Channel",
          headerBackTitle: "Channels",
        }}
      />
      <Stack.Screen
        name="[id]/merged-archived"
        options={{
          title: "Merged & Archived",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
