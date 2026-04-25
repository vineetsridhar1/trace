import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { REQUEST_BRIDGE_ACCESS_MUTATION } from "@trace/client-core";
import type { BridgeAccessCapability } from "@trace/gql";
import { Button, Text } from "@/components/design-system";
import { SessionComposerBottomSheet } from "@/components/sessions/session-input-composer/SessionComposerBottomSheet";
import type { BridgeRuntimeAccessInfo } from "@/hooks/useBridgeRuntimeAccess";
import { isBridgeInteractionAllowed } from "@/hooks/useBridgeRuntimeAccess";
import {
  describeBridgeAccessScope,
  formatCapabilities,
  getBridgeAccessRequestExpiresAt,
  type BridgeAccessRequestDuration,
} from "@/lib/bridge-access";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

type ScopePreset = "all_sessions" | "session_group";

const REQUEST_DURATION_OPTIONS: Array<{
  id: BridgeAccessRequestDuration;
  label: string;
}> = [
  { id: "1h", label: "1 hour" },
  { id: "1d", label: "1 day" },
  { id: "7d", label: "7 days" },
  { id: "never", label: "No expiration" },
];

function SectionTitle({ title }: { title: string }) {
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
      {title}
    </Text>
  );
}

function SelectPill({
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
        styles.optionOuter,
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

export function BridgeAccessNotice({
  access,
  sessionGroupId,
  compact = false,
  onRequested,
}: {
  access: BridgeRuntimeAccessInfo | null;
  sessionGroupId?: string | null;
  compact?: boolean;
  onRequested?: () => void | Promise<void>;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scopeType, setScopeType] = useState<ScopePreset>(
    sessionGroupId ? "session_group" : "all_sessions",
  );
  const [duration, setDuration] = useState<BridgeAccessRequestDuration>("1d");
  const [wantsTerminal, setWantsTerminal] = useState(false);

  const pendingRequest = access?.pendingRequest ?? null;
  const ownerName = access?.ownerUser?.name?.trim() || "the bridge owner";
  const runtimeLabel = access?.label?.trim() || "this bridge";
  const scopeOptions = useMemo(
    () =>
      sessionGroupId
        ? [
            {
              id: "session_group" as const,
              title: pendingRequest?.sessionGroup?.name
                ? `This workspace (${pendingRequest.sessionGroup.name})`
                : "This workspace only",
            },
            {
              id: "all_sessions" as const,
              title: "All sessions on this bridge",
            },
          ]
        : [{ id: "all_sessions" as const, title: "All sessions on this bridge" }],
    [pendingRequest?.sessionGroup?.name, sessionGroupId],
  );

  if (!access || isBridgeInteractionAllowed(access)) {
    return null;
  }

  const handleSubmit = async () => {
    if (!access.runtimeInstanceId || submitting) return;
    setSubmitting(true);
    try {
      const requestedCapabilities: BridgeAccessCapability[] = wantsTerminal
        ? ["session", "terminal"]
        : ["session"];
      const result = await getClient()
        .mutation(REQUEST_BRIDGE_ACCESS_MUTATION, {
          runtimeInstanceId: access.runtimeInstanceId,
          scopeType,
          sessionGroupId: scopeType === "session_group" ? (sessionGroupId ?? undefined) : undefined,
          requestedExpiresAt: getBridgeAccessRequestExpiresAt(duration),
          requestedCapabilities,
        })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      setOpen(false);
      await onRequested?.();
    } catch (error) {
      Alert.alert(
        "Request failed",
        error instanceof Error ? error.message : "Couldn't request bridge access",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View
        style={[
          styles.notice,
          {
            borderColor: alpha(theme.colors.warning, 0.32),
            backgroundColor: alpha(theme.colors.warning, compact ? 0.08 : 0.12),
            padding: compact ? theme.spacing.md : theme.spacing.lg,
          },
        ]}
      >
        <View style={styles.noticeRow}>
          <View style={[styles.iconWrap, { backgroundColor: alpha(theme.colors.warning, 0.18) }]}>
            <SymbolView name="lock.fill" size={16} tintColor={theme.colors.warning} />
          </View>
          <View style={styles.noticeCopy}>
            <Text variant="subheadline" color="foreground">
              Bridge access required
            </Text>
            <Text variant="footnote" color="mutedForeground" style={styles.noticeBody}>
              {ownerName} needs to approve access before you can use {runtimeLabel}.
            </Text>
            {pendingRequest ? (
              <Text variant="caption1" color="mutedForeground">
                Request pending for{" "}
                {describeBridgeAccessScope(
                  pendingRequest.scopeType,
                  pendingRequest.sessionGroup,
                ).toLowerCase()}
                {pendingRequest.requestedCapabilities?.length ? (
                  <> - {formatCapabilities(pendingRequest.requestedCapabilities)}</>
                ) : null}
                .
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.noticeAction}>
          <Button
            title={pendingRequest ? "Request pending" : "Request access"}
            variant="secondary"
            size="sm"
            disabled={submitting || !!pendingRequest}
            loading={submitting}
            onPress={() => setOpen(true)}
          />
        </View>
      </View>

      <SessionComposerBottomSheet visible={open} onClose={() => setOpen(false)}>
        <ScrollView
          contentContainerStyle={[styles.sheetContent, { paddingBottom: theme.spacing.md }]}
        >
          <View style={styles.sheetHeader}>
            <Text variant="headline" color="foreground">
              Request bridge access
            </Text>
            <Text variant="footnote" color="mutedForeground">
              Ask {ownerName} for permission to use {runtimeLabel}.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionTitle title="Scope" />
            <View style={styles.optionList}>
              {scopeOptions.map((option) => (
                <SelectPill
                  key={option.id}
                  title={option.title}
                  selected={scopeType === option.id}
                  onPress={() => setScopeType(option.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionTitle title="Capabilities" />
            <View
              style={[
                styles.capabilityCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceDeep,
                },
              ]}
            >
              <View style={styles.capabilityCopy}>
                <Text variant="subheadline" color="foreground">
                  Sessions
                </Text>
                <Text variant="caption1" color="mutedForeground">
                  Required for session access
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.capabilityCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceDeep,
                },
              ]}
            >
              <View style={styles.capabilityCopy}>
                <Text variant="subheadline" color="foreground">
                  Terminal
                </Text>
                <Text variant="caption1" color="mutedForeground">
                  Optional. The owner can still deny it.
                </Text>
              </View>
              <Switch
                value={wantsTerminal}
                onValueChange={setWantsTerminal}
                trackColor={{
                  false: theme.colors.border,
                  true: alpha(theme.colors.accent, 0.5),
                }}
                thumbColor={wantsTerminal ? theme.colors.accent : theme.colors.mutedForeground}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionTitle title="Duration" />
            <View style={styles.optionList}>
              {REQUEST_DURATION_OPTIONS.map((option) => (
                <SelectPill
                  key={option.id}
                  title={option.label}
                  selected={duration === option.id}
                  onPress={() => setDuration(option.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.footer}>
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
            <Button
              title="Send request"
              variant="primary"
              loading={submitting}
              disabled={submitting}
              onPress={() => void handleSubmit()}
            />
          </View>
        </ScrollView>
      </SessionComposerBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    gap: 12,
  },
  noticeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeBody: {
    lineHeight: 18,
  },
  noticeAction: {
    alignItems: "flex-start",
  },
  sheetContent: {
    gap: 20,
  },
  sheetHeader: {
    gap: 6,
  },
  section: {
    gap: 10,
  },
  optionList: {
    gap: 10,
  },
  optionOuter: {
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
  capabilityCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  capabilityCopy: {
    flex: 1,
    gap: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
