import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import type { BridgeAccessCapability } from "@trace/gql";
import { Button, Text } from "@/components/design-system";
import { SessionComposerBottomSheet } from "@/components/sessions/session-input-composer/SessionComposerBottomSheet";
import type { ConnectionAccessGrant, ConnectionAccessRequest } from "@/hooks/useConnections";
import {
  describeBridgeAccessScope,
  formatCapabilities,
  getBridgeAccessApprovalExpiresAt,
  type BridgeAccessApprovalDuration,
} from "@/lib/bridge-access";
import { alpha, useTheme } from "@/theme";

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

function SelectOption({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected ? alpha(theme.colors.accent, 0.16) : theme.colors.surfaceDeep,
        },
      ]}
    >
      <Text variant="subheadline" color="foreground" style={styles.optionTitle}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption1" color="mutedForeground" style={styles.optionSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      variant="caption1"
      style={{
        color: theme.colors.dimForeground,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </Text>
  );
}

export function ConnectionsBridgeAccessSheet({
  request,
  grant,
  visible,
  pending,
  onClose,
  onApprove,
  onDeny,
  onRevoke,
  onUpdate,
}: {
  request: ConnectionAccessRequest | null;
  grant: ConnectionAccessGrant | null;
  visible: boolean;
  pending: boolean;
  onClose: () => void;
  onApprove: (input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onRevoke: (grant: ConnectionAccessGrant) => void;
  onUpdate: (grant: ConnectionAccessGrant, capabilities: BridgeAccessCapability[]) => void;
}) {
  const theme = useTheme();
  const mode = request ? "request" : grant ? "grant" : null;
  const [scopeType, setScopeType] = useState<"all_sessions" | "session_group">("all_sessions");
  const [duration, setDuration] = useState<BridgeAccessApprovalDuration>("1d");
  const [grantTerminal, setGrantTerminal] = useState(false);

  useEffect(() => {
    if (request) {
      setScopeType(request.scopeType);
      setDuration("1d");
      setGrantTerminal(request.requestedCapabilities?.includes("terminal") ?? false);
      return;
    }
    if (grant) {
      setScopeType(grant.scopeType);
      setDuration("never");
      setGrantTerminal(grant.capabilities?.includes("terminal") ?? false);
    }
  }, [grant, request]);

  const scopeOptions = useMemo(() => {
    if (!request) return [];
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

  const requesterLabel = request
    ? (request.requesterUser.name ?? request.requesterUser.email ?? "Unknown user")
    : null;
  const granteeLabel = grant
    ? (grant.granteeUser.name ?? grant.granteeUser.email ?? "Unknown user")
    : null;

  return (
    <SessionComposerBottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        {mode === "request" && request ? (
          <>
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
            </View>

            <View style={styles.section}>
              <SectionTitle>Scope</SectionTitle>
              <View style={styles.optionList}>
                {scopeOptions.map((option) => (
                  <SelectOption
                    key={option.id}
                    title={option.title}
                    selected={scopeType === option.id}
                    onPress={() => setScopeType(option.id)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <SectionTitle>Grant capabilities</SectionTitle>
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
              <SectionTitle>Expiration</SectionTitle>
              <View style={styles.optionList}>
                {APPROVAL_DURATION_OPTIONS.map((option) => (
                  <SelectOption
                    key={option.id}
                    title={option.label}
                    selected={duration === option.id}
                    onPress={() => setDuration(option.id)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.footer}>
              <Button
                title="Deny"
                variant="ghost"
                disabled={pending}
                onPress={() => onDeny(request)}
              />
              <Button
                title="Approve"
                variant="primary"
                disabled={pending}
                loading={pending}
                onPress={() =>
                  onApprove({
                    requestId: request.id,
                    scopeType,
                    sessionGroupId: scopeType === "session_group" ? request.sessionGroup?.id : null,
                    expiresAt: getBridgeAccessApprovalExpiresAt(duration),
                    capabilities,
                  })
                }
              />
            </View>
          </>
        ) : null}

        {mode === "grant" && grant ? (
          <>
            <View style={styles.header}>
              <Text variant="headline" color="foreground">
                Manage grant
              </Text>
              <Text variant="footnote" color="mutedForeground">
                {granteeLabel} currently has{" "}
                {describeBridgeAccessScope(grant.scopeType, grant.sessionGroup).toLowerCase()}.
              </Text>
            </View>

            <View style={styles.section}>
              <SectionTitle>Capabilities</SectionTitle>
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
                    Toggle shell access for this grant
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

            <View style={styles.footer}>
              <Button
                title="Revoke"
                variant="destructive"
                disabled={pending}
                onPress={() => onRevoke(grant)}
              />
              <Button
                title="Save"
                variant="primary"
                disabled={pending}
                loading={pending}
                onPress={() => onUpdate(grant, capabilities)}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SessionComposerBottomSheet>
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
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  optionTitle: {
    fontWeight: "600",
  },
  optionSubtitle: {
    marginTop: 2,
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
