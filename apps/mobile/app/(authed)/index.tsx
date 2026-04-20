/**
 * SCRATCH: ticket-13 primitive preview. Revert before merging ticket 13.
 * The permanent design-system dev route lands in ticket 14.
 */
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  Avatar,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  SegmentedControl,
  Skeleton,
  StatusDot,
  Text,
  type ChipVariant,
  type StatusDotStatus,
} from "@/components/design-system";
import { useTheme } from "@/theme";

const CHIP_VARIANTS: { variant: ChipVariant; label: string }[] = [
  { variant: "inProgress", label: "In progress" },
  { variant: "needsInput", label: "Needs input" },
  { variant: "inReview", label: "In review" },
  { variant: "done", label: "Done" },
  { variant: "merged", label: "Merged" },
  { variant: "failed", label: "Failed" },
];

const DOT_STATUSES: StatusDotStatus[] = ["active", "done", "failed", "stopped"];

export default function DesignSystemPreview() {
  const theme = useTheme();
  const [segment, setSegment] = useState(0);
  const [chipShown, setChipShown] = useState(true);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.xl,
          paddingBottom: theme.spacing.xxxl,
        }}
      >
        <Text variant="largeTitle">Ticket 13 preview</Text>

        <Section title="Chips (all variants)">
          <View style={styles.row}>
            {CHIP_VARIANTS.map((c) => (
              <Chip key={c.variant} label={c.label} variant={c.variant} />
            ))}
          </View>
          <View style={{ marginTop: theme.spacing.md }}>
            <ListRow
              title={chipShown ? "Hide inProgress chip" : "Show inProgress chip"}
              subtitle="Tap to unmount and re-mount — verifies pulse cancellation"
              onPress={() => setChipShown((v) => !v)}
              separator={false}
            />
            {chipShown ? (
              <View style={{ marginTop: theme.spacing.sm }}>
                <Chip label="In progress (live)" variant="inProgress" />
              </View>
            ) : null}
          </View>
        </Section>

        <Section title="StatusDot (all statuses)">
          <View style={styles.row}>
            {DOT_STATUSES.map((s) => (
              <View key={s} style={styles.dotLabel}>
                <StatusDot status={s} />
                <Text variant="caption1" color="mutedForeground">
                  {s}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Avatar (xs / sm / md / lg + fallback)">
          <View style={styles.row}>
            <Avatar name="Vineet Sridhar" size="xs" />
            <Avatar name="Ada Lovelace" size="sm" />
            <Avatar name="Grace Hopper" size="md" />
            <Avatar name="Linus Torvalds" size="lg" />
            <Avatar
              name="Bad URL"
              size="md"
              uri="https://invalid.example.com/nope.png"
            />
          </View>
        </Section>

        <Section title="ListRow (variants)">
          <View style={styles.card}>
            <ListRow
              title="Basic row"
              subtitle="subtitle"
              onPress={() => {}}
              disclosureIndicator
            />
            <ListRow
              title="With leading icon"
              leading={
                <SymbolView
                  name="bell.fill"
                  size={20}
                  tintColor={theme.colors.accent}
                />
              }
              trailing={<Chip label="New" variant="needsInput" />}
              onPress={() => {}}
              disclosureIndicator
            />
            <ListRow
              title="Destructive"
              subtitle="Sign out"
              destructive
              onPress={() => {}}
            />
            <ListRow title="Plain, no press" separator={false} />
          </View>
        </Section>

        <Section title="Skeleton">
          <Skeleton height={20} />
          <View style={{ height: theme.spacing.sm }} />
          <Skeleton height={14} width="60%" />
          <View style={{ height: theme.spacing.sm }} />
          <Skeleton height={14} width="40%" />
        </Section>

        <Section title="SegmentedControl">
          <SegmentedControl
            segments={["Active", "Merged", "Archived"]}
            selectedIndex={segment}
            onChange={setSegment}
          />
          <Text
            variant="footnote"
            color="mutedForeground"
            style={{ marginTop: theme.spacing.sm }}
          >
            selected: {segment}
          </Text>
        </Section>

        <Section title="EmptyState">
          <EmptyState
            icon="tray"
            title="All clear"
            subtitle="Sessions that need you will show up here."
            action={{ label: "Refresh", onPress: () => {} }}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="headline" color="mutedForeground" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  dotLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 12,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#171717",
  },
});
