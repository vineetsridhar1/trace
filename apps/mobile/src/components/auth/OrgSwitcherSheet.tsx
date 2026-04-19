import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type OrgMembership,
} from "@trace/client-core";
import { recreateClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";

export interface OrgSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  onSignOut?: () => void;
}

export function OrgSwitcherSheet({ visible, onClose, onSignOut }: OrgSwitcherSheetProps) {
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s: AuthState) => s.setActiveOrg);
  const logout = useAuthStore((s: AuthState) => s.logout);

  function handleSelect(orgId: string) {
    if (orgId === activeOrgId) {
      onClose();
      return;
    }
    // Tear down the entity store so we don't show stale entities for the
    // previous org during the brief window before the new org's data lands.
    useEntityStore.getState().reset();
    useMobileUIStore.getState().reset();
    setActiveOrg(orgId);
    // Rebuild the urql client so the WS handshake re-sends X-Organization-Id
    // and any active subscription is torn down + restarted by useHydrate.
    recreateClient();
    onClose();
  }

  async function handleSignOut() {
    onClose();
    useEntityStore.getState().reset();
    useMobileUIStore.getState().reset();
    await logout();
    recreateClient();
    onSignOut?.();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.handle} />
        <Text style={styles.title}>Switch organization</Text>

        <View style={styles.list}>
          {memberships.map((m: OrgMembership) => {
            const active = m.organizationId === activeOrgId;
            return (
              <Pressable
                key={m.organizationId}
                onPress={() => handleSelect(m.organizationId)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowName}>{m.organization.name}</Text>
                {active && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  list: {
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#161616",
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    color: "#fff",
    fontSize: 15,
  },
  check: {
    color: "#7c5cff",
    fontSize: 18,
  },
  signOut: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#161616",
  },
  signOutText: {
    color: "#ff6b6b",
    fontSize: 15,
    fontWeight: "500",
  },
});
