import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import {
  Avatar,
  ListRow,
  Screen,
  Text,
} from "@/components/design-system";
import { recreateClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.1";
const BUILD_NUMBER = Constants.nativeBuildVersion ?? "dev";

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const activeOrg = memberships.find((membership) => membership.organizationId === activeOrgId);
  const userName = user?.name ?? user?.email ?? "Trace user";
  const userEmail = user?.email ?? "Signed in";

  function openOrgSwitcher() {
    router.push("/sheets/org-switcher");
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "You will need to sign in again on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void handleSignOut();
        },
      },
    ]);
  }

  async function handleSignOut() {
    useEntityStore.getState().reset();
    useMobileUIStore.getState().reset();
    await logout();
    recreateClient();
    router.replace("/(auth)/sign-in");
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { padding: theme.spacing.lg },
        ]}
      >
        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <ListRow
            title={userName}
            subtitle={userEmail}
            leading={<Avatar name={userName} uri={user?.avatarUrl} size="lg" />}
            separator={false}
          />
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <ListRow
            title="Active organization"
            subtitle={activeOrg?.organization.name ?? "No active organization"}
            disclosureIndicator
            onPress={openOrgSwitcher}
            separator={__DEV__}
          />
          {__DEV__ ? (
            <ListRow
              title="Design System"
              subtitle="Developer preview"
              disclosureIndicator
              onPress={() => router.push("/(dev)/design-system")}
              separator={false}
            />
          ) : null}
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <ListRow
            title="Sign out"
            destructive
            onPress={confirmSignOut}
            separator={false}
          />
        </View>

        <Text variant="caption1" color="dimForeground" align="center">
          Version {APP_VERSION} ({BUILD_NUMBER})
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  section: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
