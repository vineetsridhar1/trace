import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, type TypographyVariant } from "@/theme";
import {
  Text,
  Button,
  IconButton,
  Card,
  Chip,
  StatusDot,
  ListRow,
  Avatar,
  Skeleton,
  SegmentedControl,
  EmptyState,
  type ChipVariant,
  type StatusDotStatus,
  type AvatarSize,
} from "@/components/design-system";

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.xl }}>
      <Text
        variant="caption1"
        color="dimForeground"
        style={{ marginBottom: theme.spacing.sm, textTransform: "uppercase", letterSpacing: 1 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {children}
    </View>
  );
}

const TYPOGRAPHY_VARIANTS: TypographyVariant[] = [
  "largeTitle", "title1", "title2", "headline", "body",
  "callout", "subheadline", "footnote", "caption1", "caption2", "mono",
];

const CHIP_VARIANTS: ChipVariant[] = [
  "inProgress", "needsInput", "done", "failed", "merged", "inReview",
];

const STATUS_DOT_STATUSES: StatusDotStatus[] = ["active", "done", "failed", "stopped"];
const AVATAR_SIZES: AvatarSize[] = ["xs", "sm", "md", "lg"];

export default function DesignSystemScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [segmentIdx, setSegmentIdx] = useState(0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 80 }}
    >
      <Text variant="title2" style={{ marginBottom: theme.spacing.xl }}>Design System</Text>

      <Section title="Typography">
        <View style={{ gap: 4 }}>
          {TYPOGRAPHY_VARIANTS.map((v) => (
            <Text key={v} variant={v}>{v}</Text>
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <Row>
          <Button title="Primary" variant="primary" />
          <Button title="Secondary" variant="secondary" />
          <Button title="Ghost" variant="ghost" />
          <Button title="Destructive" variant="destructive" />
        </Row>
        <Row style={{ marginTop: 8 }}>
          <Button title="Small" size="sm" />
          <Button title="Large" size="lg" />
          <Button title="Loading" loading />
          <Button title="Disabled" disabled />
        </Row>
      </Section>

      <Section title="Icon Buttons">
        <Row>
          <IconButton symbol="plus" size="sm" onPress={() => {}} accessibilityLabel="add sm" />
          <IconButton symbol="plus" size="md" onPress={() => {}} accessibilityLabel="add md" />
          <IconButton symbol="plus" size="lg" onPress={() => {}} accessibilityLabel="add lg" />
          <IconButton symbol="ellipsis" onPress={() => {}} accessibilityLabel="more" />
          <IconButton symbol="trash" color="destructive" onPress={() => {}} accessibilityLabel="delete" />
        </Row>
      </Section>

      <Section title="Cards">
        <View style={{ gap: 8 }}>
          <Card><Text variant="body">Static card</Text></Card>
          <Card onPress={() => {}}><Text variant="body">Pressable card (tap for scale + haptic)</Text></Card>
          <Card glass><Text variant="body">Glass card</Text></Card>
        </View>
      </Section>

      <Section title="Chips">
        <Row>
          {CHIP_VARIANTS.map((v) => (
            <Chip key={v} label={v} variant={v} />
          ))}
        </Row>
      </Section>

      <Section title="Status Dots">
        <Row>
          {STATUS_DOT_STATUSES.map((s) => (
            <View key={s} style={{ alignItems: "center", gap: 4 }}>
              <StatusDot status={s} size="md" />
              <Text variant="caption2" color="dimForeground">{s}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="List Rows">
        <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.colors.surface }}>
          <ListRow title="Simple row" />
          <ListRow title="With subtitle" subtitle="Supporting detail text" />
          <ListRow title="Disclosure" disclosureIndicator />
          <ListRow title="Pressable" onPress={() => {}} disclosureIndicator />
          <ListRow title="Destructive" destructive separator={false} />
        </View>
      </Section>

      <Section title="Avatars">
        <Row>
          {AVATAR_SIZES.map((size) => (
            <Avatar key={size} name="Alice Johnson" size={size} />
          ))}
          <Avatar name="Bob Smith" uri="https://example.invalid/404.jpg" />
        </Row>
      </Section>

      <Section title="Skeletons">
        <View style={{ gap: 8 }}>
          <Skeleton height={16} />
          <Skeleton height={16} width="60%" />
          <Skeleton height={48} radius={theme.radius.lg} />
          <Row>
            <Skeleton width={36} height={36} radius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={14} />
              <Skeleton height={12} width="70%" />
            </View>
          </Row>
        </View>
      </Section>

      <Section title="Segmented Control">
        <SegmentedControl
          segments={["One", "Two", "Three"]}
          selectedIndex={segmentIdx}
          onChange={setSegmentIdx}
        />
      </Section>

      <Section title="Empty State">
        <EmptyState
          icon="tray"
          title="Nothing here"
          subtitle="Empty state with subtitle and action button"
          action={{ label: "Take action", onPress: () => {} }}
        />
      </Section>

      <Section title="Sheet">
        <ListRow
          title="Sheet Preview"
          subtitle="Opens a form sheet with medium + large detents"
          disclosureIndicator
          onPress={() => router.push("/(dev)/sheet-preview")}
          separator={false}
          style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }}
        />
      </Section>
    </ScrollView>
  );
}
