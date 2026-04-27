import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Avatar, ListRow, Text } from "@/components/design-system";
import { handleMobileSignOut } from "@/lib/auth";
import { useTheme } from "@/theme";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.1";
const BUILD_NUMBER = Constants.nativeBuildVersion ?? "dev";

/**
 * Account / settings UI rendered inside the profile sheet. Reachable by
 * tapping the avatar in the top bar.
 */
export function AccountSheetContent() {
  const router = useRouter();
  const theme = useTheme();
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);

  const activeOrg = memberships.find((m) => m.organizationId === activeOrgId);
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

  // Mobile-only cleanup runs first while this component is still mounted —
  // `await logout()` sets user=null and triggers the auth redirect immediately.
  async function handleSignOut() {
    await handleMobileSignOut();
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
    >
      <View
        style={[
          styles.section,
          {
            backgroundColor: theme.colors.surfaceElevated,
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
            backgroundColor: theme.colors.surfaceElevated,
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
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <ListRow title="Sign out" destructive onPress={confirmSignOut} separator={false} />
      </View>

      <Text variant="caption1" color="dimForeground" align="center">
        Version {APP_VERSION} ({BUILD_NUMBER})
      </Text>
    </ScrollView>
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
