import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  useAuthStore,
  useEntityIds,
  type AuthState,
} from "@trace/client-core";

export default function AuthedHome() {
  const router = useRouter();
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const channelIds = useEntityIds("channels");
  const sessionIds = useEntityIds("sessions");

  const activeOrg = memberships.find((m) => m.organizationId === activeOrgId);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.heading}>Trace Mobile</Text>
      {user && <Text style={styles.subtle}>Signed in as {user.name}</Text>}
      <Text style={styles.subtle}>{activeOrg?.organization.name ?? "No org"}</Text>

      <View style={styles.stats}>
        <Text style={styles.stat}>Channels: {channelIds.length}</Text>
        <Text style={styles.stat}>Sessions: {sessionIds.length}</Text>
      </View>

      {__DEV__ && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(dev)/design-system")}
          style={({ pressed }) => [styles.devButton, pressed && styles.pressed]}
        >
          <Text style={styles.devButtonText}>Design System</Text>
        </Pressable>
      )}

      {Array.from({ length: 30 }).map((_, i) => (
        <View key={i} style={styles.filler}>
          <Text style={styles.fillerText}>Scroll filler row {i + 1}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 160,
  },
  filler: {
    alignSelf: "stretch",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  fillerText: {
    color: "#888",
    fontSize: 14,
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
  devButton: {
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  devButtonText: {
    color: "#888",
    fontSize: 12,
    fontFamily: "Menlo",
  },
});
