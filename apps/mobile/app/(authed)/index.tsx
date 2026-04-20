import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  useAuthStore,
  useEntityIds,
  type AuthState,
} from "@trace/client-core";
import { OrgSwitcherSheet } from "@/components/auth/OrgSwitcherSheet";

export default function AuthedHome() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const channelIds = useEntityIds("channels");
  const sessionIds = useEntityIds("sessions");
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeOrg = memberships.find((m) => m.organizationId === activeOrgId);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trace Mobile</Text>
      {user && <Text style={styles.subtle}>Signed in as {user.name}</Text>}

      <Pressable
        accessibilityRole="button"
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [styles.orgPill, pressed && styles.pressed]}
      >
        <Text style={styles.orgPillText}>{activeOrg?.organization.name ?? "No org"}</Text>
      </Pressable>

      <View style={styles.stats}>
        <Text style={styles.stat}>Channels: {channelIds.length}</Text>
        <Text style={styles.stat}>Sessions: {sessionIds.length}</Text>
      </View>

      <OrgSwitcherSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 16,
    paddingHorizontal: 24,
  },
  heading: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
  },
  subtle: {
    color: "#888",
    fontSize: 14,
  },
  orgPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#161616",
  },
  orgPillText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.7,
  },
  stats: {
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  stat: {
    color: "#666",
    fontSize: 13,
  },
});
