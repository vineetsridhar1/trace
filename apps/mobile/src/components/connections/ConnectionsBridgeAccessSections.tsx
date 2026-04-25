import { StyleSheet, View } from "react-native";
import { Button, ListRow, Text } from "@/components/design-system";
import { describeBridgeAccessScope, formatCapabilities } from "@/lib/bridge-access";
import { useTheme } from "@/theme";
import type {
  ConnectionAccessGrant,
  ConnectionAccessRequest,
  ConnectionUser,
} from "@/hooks/useConnections";

function userLabel(u: ConnectionUser): string {
  return u.name ?? u.email ?? "Unknown user";
}

export function ConnectionsBridgeAccessSections({
  requests,
  grants,
  pendingActionId,
  onReviewRequest,
  onDeny,
  onManageGrant,
}: {
  requests: ConnectionAccessRequest[];
  grants: ConnectionAccessGrant[];
  pendingActionId: string | null;
  onReviewRequest: (request: ConnectionAccessRequest) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onManageGrant: (grant: ConnectionAccessGrant) => void;
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
                {describeBridgeAccessScope(request.scopeType, request.sessionGroup)}
              </Text>
              <Text variant="caption1" color="dimForeground" numberOfLines={1}>
                {formatCapabilities(request.requestedCapabilities)}
              </Text>
              <View style={styles.actionRow}>
                <Button
                  title="Review"
                  size="sm"
                  disabled={pendingActionId === request.id}
                  onPress={() => onReviewRequest(request)}
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
              subtitle={`${describeBridgeAccessScope(
                grant.scopeType,
                grant.sessionGroup,
              )} - ${formatCapabilities(grant.capabilities)}`}
              trailing={
                <Button
                  title="Manage"
                  size="sm"
                  variant="secondary"
                  disabled={pendingActionId === grant.id}
                  onPress={() => onManageGrant(grant)}
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
