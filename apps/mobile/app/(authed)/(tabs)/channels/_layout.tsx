import { Stack, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { IconButton } from "@/components/design-system";
import { TopBarPill } from "@/components/navigation/TopBarPill";

export default function ChannelsLayout() {
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
          title: "Channels",
          headerLargeTitle: true,
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                symbol="magnifyingglass"
                accessibilityLabel="Browse channels"
                onPress={() => router.push("/sheets/browse-channels")}
              />
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
            </View>
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

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
