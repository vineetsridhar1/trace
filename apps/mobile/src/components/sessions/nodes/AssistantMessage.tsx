import { memo, useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { FORK_SESSION_MUTATION } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface AssistantMessageProps {
  text: string;
  eventId?: string;
}

type ForkSessionData = {
  forkSession?: {
    id?: string | null;
    sessionGroupId?: string | null;
  } | null;
};

export const AssistantMessage = memo(function AssistantMessage({
  text,
  eventId,
}: AssistantMessageProps) {
  const theme = useTheme();
  const router = useRouter();
  const [forking, setForking] = useState(false);

  const forkSession = useCallback(async () => {
    if (!eventId || forking) return;
    void haptic.light();
    setForking(true);
    try {
      const result = await getClient()
        .mutation<ForkSessionData>(FORK_SESSION_MUTATION, { eventId })
        .toPromise();
      if (result.error) throw result.error;
      const forked = result.data?.forkSession;
      if (!forked?.id || !forked.sessionGroupId) {
        throw new Error("No forked session was returned.");
      }
      void haptic.success();
      router.push(`/sessions/${forked.sessionGroupId}/${forked.id}`);
    } catch (error) {
      void haptic.error();
      Alert.alert(
        "Couldn't fork session",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setForking(false);
    }
  }, [eventId, forking, router]);

  const confirmFork = useCallback(() => {
    if (!eventId || forking) return;
    Alert.alert(
      "Fork session?",
      "Create a new workspace with history copied through this point.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Fork", onPress: () => void forkSession() },
      ],
    );
  }, [eventId, forking, forkSession]);

  return (
    <View style={[styles.wrapper, { paddingVertical: theme.spacing.xs }]}>
      <View>
        <Markdown copyBlocks>{text}</Markdown>
      </View>
      {eventId ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fork session"
            accessibilityState={{ disabled: forking, busy: forking }}
            disabled={forking}
            onPress={confirmFork}
            style={({ pressed }) => [
              styles.actionButton,
              {
                borderColor: theme.colors.borderMuted,
                backgroundColor: theme.colors.surfaceElevated,
                opacity: forking ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <SymbolView
              name="tuningfork"
              size={13}
              tintColor={theme.colors.mutedForeground}
              resizeMode="scaleAspectFit"
              style={styles.actionIcon}
            />
            <Text variant="caption1" color="mutedForeground">
              {forking ? "Forking..." : "Fork"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  actions: {
    flexDirection: "row",
    marginTop: 8,
  },
  actionButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionIcon: {
    width: 13,
    height: 13,
  },
});
