import { Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { TopBarPill } from "@/components/navigation/TopBarPill";
import { useTheme } from "@/theme";

export default function ChannelsLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const theme = useTheme();

  // Force the native nav bar to render with the app's dark palette so it
  // doesn't flash light-mode chrome over dark content.
  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.background },
    headerLargeStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.foreground,
    headerTitleStyle: { color: theme.colors.foreground },
    headerLargeTitleStyle: { color: theme.colors.foreground },
    headerShadowVisible: false,
  } as const;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: "Channels",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          // DIAGNOSTIC: search bar back, but with hideWhenScrolling=false to
          // test whether the scroll-observation the search controller sets up
          // for pull-to-reveal is what's breaking tab-bar .bottom binding.
          headerSearchBarOptions: {
            placeholder: "Search channels",
            hideWhenScrolling: false,
          },
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
