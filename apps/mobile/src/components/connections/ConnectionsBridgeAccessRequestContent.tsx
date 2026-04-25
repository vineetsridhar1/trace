import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import type { BridgeAccessCapability } from "@trace/gql";
import { Button, Text } from "@/components/design-system";
import type { ConnectionAccessRequest } from "@/hooks/useConnections";
import {
  describeBridgeAccessScope,
  formatCapabilities,
  getBridgeAccessApprovalExpiresAt,
  normalizeBridgeAccessApprovalScope,
  type BridgeAccessApprovalDuration,
} from "@/lib/bridge-access";
import { alpha, useTheme } from "@/theme";
import {
  ConnectionsBridgeAccessOption,
  ConnectionsBridgeAccessSectionTitle,
} from "./ConnectionsBridgeAccessSheetPrimitives";

const APPROVAL_DURATION_OPTIONS: Array<{
  id: BridgeAccessApprovalDuration;
  label: string;
}> = [
  { id: "1h", label: "1 hour" },
  { id: "3h", label: "3 hours" },
  { id: "1d", label: "1 day" },
  { id: "7d", label: "7 days" },
  { id: "never", label: "No expiration" },
];

function getInitialScopeType(request: ConnectionAccessRequest): "all_sessions" | "session_group" {
  return normalizeBridgeAccessApprovalScope(request.scopeType, request.sessionGroup).scopeType;
}

export function ConnectionsBridgeAccessRequestContent({
  request,
  pending,
  onApprove,
  onDeny,
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
}) {
  const theme = useTheme();
  const [scopeType, setScopeType] = useState<"all_sessions" | "session_group">(
    getInitialScopeType(request),
  );
  const [duration, setDuration] = useState<BridgeAccessApprovalDuration>("1d");
  const [grantTerminal, setGrantTerminal] = useState(false);

  useEffect(() => {
    setScopeType(getInitialScopeType(request));
    setDuration("1d");
    setGrantTerminal(request.requestedCapabilities?.includes("terminal") ?? false);
  }, [request]);

  const scopeOptions = useMemo(() => {
    return request.sessionGroup?.id
      ? [
          {
            id: "session_group" as const,
            title: describeBridgeAccessScope("session_group", request.sessionGroup),
          },
          {
            id: "all_sessions" as const,
            title: describeBridgeAccessScope("all_sessions"),
          },
        ]
      : [{ id: "all_sessions" as const, title: describeBridgeAccessScope("all_sessions") }];
  }, [request]);

  const capabilities: BridgeAccessCapability[] = grantTerminal
    ? ["session", "terminal"]
    : ["session"];
  const requesterLabel =
    request.requesterUser.name ?? request.requesterUser.email ?? "Unknown user";
  const missingSessionGroup = request.scopeType === "session_group" && !request.sessionGroup?.id;
  const approvalTarget = normalizeBridgeAccessApprovalScope(scopeType, request.sessionGroup);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="headline" color="foreground">
          Review request
        </Text>
        <Text variant="footnote" color="mutedForeground">
          {requesterLabel} requested access to{" "}
          {describeBridgeAccessScope(request.scopeType, request.sessionGroup).toLowerCase()}.
        </Text>
        <Text variant="caption1" color="mutedForeground">
          Requested capabilities: {formatCapabilities(request.requestedCapabilities)}
        </Text>
        {missingSessionGroup ? (
          <Text variant="caption1" color="mutedForeground">
            This request no longer has a workspace reference, so approval falls back to all sessions
            unless you deny it.
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <ConnectionsBridgeAccessSectionTitle>Scope</ConnectionsBridgeAccessSectionTitle>
        <View style={styles.optionList}>
          {scopeOptions.map((option) => (
            <ConnectionsBridgeAccessOption
              key={option.id}
              title={option.title}
              selected={scopeType === option.id}
              onPress={() => setScopeType(option.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ConnectionsBridgeAccessSectionTitle>
          Grant capabilities
        </ConnectionsBridgeAccessSectionTitle>
        <View
          style={[
            styles.toggleCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceDeep,
            },
          ]}
        >
          <View style={styles.toggleCopy}>
            <Text variant="subheadline" color="foreground">
              Sessions
            </Text>
            <Text variant="caption1" color="mutedForeground">
              Always granted
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.toggleCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceDeep,
            },
          ]}
        >
          <View style={styles.toggleCopy}>
            <Text variant="subheadline" color="foreground">
              Terminal
            </Text>
            <Text variant="caption1" color="mutedForeground">
              {request.requestedCapabilities?.includes("terminal")
                ? "Requested by the user"
                : "Optional"}
            </Text>
          </View>
          <Switch
            value={grantTerminal}
            onValueChange={setGrantTerminal}
            trackColor={{
              false: theme.colors.border,
              true: alpha(theme.colors.accent, 0.5),
            }}
            thumbColor={grantTerminal ? theme.colors.accent : theme.colors.mutedForeground}
          />
        </View>
      </View>

      <View style={styles.section}>
        <ConnectionsBridgeAccessSectionTitle>Expiration</ConnectionsBridgeAccessSectionTitle>
        <View style={styles.optionList}>
          {APPROVAL_DURATION_OPTIONS.map((option) => (
            <ConnectionsBridgeAccessOption
              key={option.id}
              title={option.label}
              selected={duration === option.id}
              onPress={() => setDuration(option.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Button title="Deny" variant="ghost" disabled={pending} onPress={() => onDeny(request)} />
        <Button
          title="Approve"
          variant="primary"
          disabled={pending}
          loading={pending}
          onPress={() =>
            onApprove({
              requestId: request.id,
              scopeType: approvalTarget.scopeType,
              sessionGroupId: approvalTarget.sessionGroupId,
              expiresAt: getBridgeAccessApprovalExpiresAt(duration),
              capabilities,
            })
          }
        />
      </View>
    </ScrollView>
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
  section: {
    gap: 10,
  },
  optionList: {
    gap: 10,
  },
  toggleCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
