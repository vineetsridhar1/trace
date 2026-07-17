import { Stack, useRouter } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";
import { createApplication, createDesign } from "@/lib/createQuickSession";

export default function ApplicationsLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerTintColor: "white",
        headerTitleStyle: { color: "white" },
        headerLargeTitleStyle: { color: "white" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Applications",
          headerLargeTitle: true,
          headerRight: () => (
            <TopBarPill
              actions={[
                {
                  id: "new-design",
                  accessibilityLabel: "Create a new design",
                  symbol: "paintbrush",
                  onPress: () => void createDesign(),
                },
                {
                  id: "new-application",
                  accessibilityLabel: "Build a new application",
                  symbol: "plus",
                  onPress: () => void createApplication(),
                },
              ]}
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
