import { ScrollView, StyleSheet, View } from "react-native";
import type { BridgeAccessCapability } from "@trace/gql";
import { Button, Text } from "@/components/design-system";
import type { ConnectionAccessRequest } from "@/hooks/useConnections";
import {
  describeBridgeAccessScope,
  formatCapabilities,
  normalizeBridgeAccessApprovalScope,
} from "@/lib/bridge-access";

function userLabel(request: ConnectionAccessRequest): string {
  return request.requesterUser.name ?? request.requesterUser.email ?? "Unknown user";
}

function requestedCapabilities(request: ConnectionAccessRequest): BridgeAccessCapability[] {
  return request.requestedCapabilities?.length ? [...request.requestedCapabilities] : ["session"];
}

function expirationLabel(expiresAt?: string | null): string {
  if (!expiresAt) return "No expiration requested";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Requested expiration";
  return date.toLocaleString();
}

export function ConnectionsBridgeAccessQuickReviewContent({
  request,
  pending,
  onApprove,
  onDeny,
  onConfigure,
}: {
  request: ConnectionAccessRequest;
  pending: boolean;
  onApprove: (input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onConfigure: () => void;
}) {
  const requesterLabel = userLabel(request);
  const scope = describeBridgeAccessScope(request.scopeType, request.sessionGroup);
  const approvalTarget = normalizeBridgeAccessApprovalScope(
    request.scopeType,
    request.sessionGroup,
  );
  const capabilities = requestedCapabilities(request);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="headline" color="foreground">
          Bridge access request
        </Text>
        <Text variant="footnote" color="mutedForeground">
          {requesterLabel} requested access to {scope.toLowerCase()}.
        </Text>
      </View>

      <View style={styles.details}>
        <DetailRow label="Scope" value={scope} />
        <DetailRow label="Capabilities" value={formatCapabilities(capabilities)} />
        <DetailRow label="Expiration" value={expirationLabel(request.requestedExpiresAt)} />
      </View>

      <View style={styles.footer}>
        <Button
          title="Deny"
          variant="ghost"
          size="sm"
          disabled={pending}
          onPress={() => onDeny(request)}
        />
        <Button
          title="Configure"
          variant="secondary"
          size="sm"
          disabled={pending}
          onPress={onConfigure}
        />
        <Button
          title="Approve"
          variant="primary"
          size="sm"
          disabled={pending}
          loading={pending}
          onPress={() =>
            onApprove({
              requestId: request.id,
              scopeType: approvalTarget.scopeType,
              sessionGroupId: approvalTarget.sessionGroupId,
              expiresAt: request.requestedExpiresAt ?? undefined,
              capabilities,
            })
          }
        />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="caption1" color="dimForeground" style={styles.detailLabel}>
        {label}
      </Text>
      <Text variant="subheadline" color="foreground" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingBottom: 12,
  },
  header: {
    gap: 6,
  },
  details: {
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
