import { StyleSheet, View } from "react-native";
import { Button, ListRow, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import type {
  ConnectionAccessGrant,
  ConnectionAccessRequest,
  ConnectionUser,
} from "@/hooks/useConnections";

function userLabel(u: ConnectionUser): string {
  return u.name ?? u.email ?? "Unknown user";
}

function describeScope(
  scopeType: "all_sessions" | "session_group",
  sessionGroup?: { name?: string | null } | null,
): string {
  if (scopeType === "session_group") {
    return sessionGroup?.name ? `Workspace: ${sessionGroup.name}` : "Single workspace";
  }
  return "All sessions";
}

export function ConnectionsBridgeAccessSections({
  requests,
  grants,
  pendingActionId,
  onApprove,
  onDeny,
  onRevoke,
}: {
  requests: ConnectionAccessRequest[];
  grants: ConnectionAccessGrant[];
  pendingActionId: string | null;
  onApprove: (request: ConnectionAccessRequest) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onRevoke: (grant: ConnectionAccessGrant) => void;
}) {
  const theme = useTheme();
  return (
    <>
      {requests.length > 0 ? (
        <View>
          <SectionLabel text="Pending requests" />
          {requests.map((request) => (
            <View
              key={request.id}
              style={[
                styles.itemBlock,
                {
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.borderMuted,
                },
              ]}
            >
              <Text variant="body" color="foreground" numberOfLines={1}>
                {userLabel(request.requesterUser)}
              </Text>
              <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
                {describeScope(request.scopeType, request.sessionGroup)}
              </Text>
              <View style={styles.actionRow}>
                <Button
                  title="Approve"
                  size="sm"
                  disabled={pendingActionId === request.id}
                  onPress={() => onApprove(request)}
                />
                <Button
                  title="Deny"
                  size="sm"
                  variant="ghost"
                  disabled={pendingActionId === request.id}
                  onPress={() => onDeny(request)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {grants.length > 0 ? (
        <View>
          <SectionLabel text="Active grants" />
          {grants.map((grant) => (
            <ListRow
              key={grant.id}
              title={userLabel(grant.granteeUser)}
              subtitle={describeScope(grant.scopeType, grant.sessionGroup)}
              trailing={
                <Button
                  title="Revoke"
                  size="sm"
                  variant="destructive"
                  disabled={pendingActionId === grant.id}
                  onPress={() => onRevoke(grant)}
                />
              }
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function SectionLabel({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: 4,
      }}
    >
      <Text
        variant="caption1"
        style={{
          color: theme.colors.dimForeground,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  itemBlock: { gap: 6 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
});
