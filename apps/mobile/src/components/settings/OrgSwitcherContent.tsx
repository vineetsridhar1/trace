import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type OrgMembership,
} from "@trace/client-core";
import { ListRow, Text } from "@/components/design-system";
import { recreateClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { CreateOrganizationForm } from "./CreateOrganizationForm";

function formatRole(role: OrgMembership["role"]): string {
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}

export function OrgSwitcherContent() {
  const router = useRouter();
  const theme = useTheme();
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s: AuthState) => s.setActiveOrg);

  function handleSelect(orgId: string) {
    if (orgId !== activeOrgId) {
      setActiveOrg(orgId);
      recreateClient();
      useEntityStore.getState().reset();
      useMobileUIStore.getState().reset();
    }
    router.back();
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Switch organization</Text>
        <Text variant="footnote" color="mutedForeground">
          Pick the workspace to load for this session.
        </Text>
      </View>

      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {memberships.map((membership, index) => {
          const active = membership.organizationId === activeOrgId;
          return (
            <ListRow
              key={membership.organizationId}
              title={membership.organization.name}
              subtitle={formatRole(membership.role)}
              trailing={
                active ? (
                  <SymbolView
                    name="checkmark"
                    size={16}
                    tintColor={theme.colors.accent}
                  />
                ) : undefined
              }
              onPress={() => handleSelect(membership.organizationId)}
              haptic={active ? "none" : "selection"}
              separator={index < memberships.length - 1}
            />
          );
        })}
      </View>

      <View
        style={[
          styles.createSection,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Text variant="subheadline" color="foreground">
          New organization
        </Text>
        <Text variant="footnote" color="mutedForeground">
          Create a separate workspace and switch to it immediately.
        </Text>
        <CreateOrganizationForm onCreated={() => router.back()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    gap: 4,
  },
  list: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  createSection: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
  },
});
