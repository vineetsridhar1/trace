import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { gql } from "@urql/core";
import { SymbolView } from "expo-symbols";
import { useAuthStore, useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { ListRow, TraceLoader, Text } from "@/components/design-system";
import { useDesignSessionGroups } from "@/hooks/useDesignSessionGroups";
import { haptic } from "@/lib/haptics";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

const ATTACH_DESIGN_MUTATION = gql`
  mutation MobileAttachDesignToSession($sessionId: ID!, $designSessionGroupId: ID!) {
    attachDesignToSession(sessionId: $sessionId, designSessionGroupId: $designSessionGroupId) {
      id
    }
  }
`;

interface DesignPickerSheetContentProps {
  sessionId: string;
  onClose: () => void;
}

export function DesignPickerSheetContent({
  sessionId,
  onClose,
}: DesignPickerSheetContentProps) {
  const theme = useTheme();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const { ids, loading, error, refresh } = useDesignSessionGroups(activeOrgId);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const designs = useMemo(
    () =>
      ids
        .map((id) => sessionGroups[id])
        .filter((group): group is SessionGroupEntity => group !== undefined),
    [ids, sessionGroups],
  );

  const handleSelect = useCallback(
    async (designSessionGroupId: string) => {
      if (attachingId) return;
      setAttachingId(designSessionGroupId);
      void haptic.light();
      try {
        const result = await getClient()
          .mutation(ATTACH_DESIGN_MUTATION, { sessionId, designSessionGroupId })
          .toPromise();
        if (result.error) throw result.error;
        void haptic.success();
        onClose();
      } catch (attachError) {
        void haptic.error();
        Alert.alert("Couldn't attach design", userFacingError(attachError, "Try again."));
      } finally {
        setAttachingId(null);
      }
    },
    [attachingId, onClose, sessionId],
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Implement a design</Text>
        <Text variant="footnote" color="mutedForeground">
          Pick a design to copy into this coding session.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <TraceLoader size="small" color="mutedForeground" />
          </View>
        ) : (
          designs.map((design, index) => (
            <ListRow
              key={design.id}
              title={design.name || "Untitled design"}
              subtitle="Copy this design into the current session."
              leading={
                <SymbolView
                  name="square.on.square"
                  size={16}
                  tintColor={theme.colors.mutedForeground}
                />
              }
              trailing={
                attachingId === design.id ? (
                  <TraceLoader size="small" color="mutedForeground" />
                ) : undefined
              }
              onPress={attachingId === null ? () => void handleSelect(design.id) : undefined}
              haptic="selection"
              separator={index < designs.length - 1}
              style={attachingId !== null && attachingId !== design.id ? styles.disabledRow : undefined}
            />
          ))
        )}
      </View>

      {!loading && designs.length === 0 ? (
        <Text variant="footnote" color={error ? "destructive" : "mutedForeground"}>
          {error ?? "No designs yet. Create a design session first."}
        </Text>
      ) : null}
      {error ? (
        <Text variant="footnote" color="accent" onPress={() => void refresh()}>
          Retry
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    gap: 4,
  },
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  disabledRow: {
    opacity: 0.5,
  },
});
