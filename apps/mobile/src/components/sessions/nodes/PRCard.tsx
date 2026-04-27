import { Linking, StyleSheet } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Card, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";

export type PRCardKind = "opened" | "merged" | "closed";

interface PRCardProps {
  kind: PRCardKind;
  prUrl: string | null;
}

function labelFor(kind: PRCardKind): string {
  switch (kind) {
    case "opened":
      return "Pull request opened";
    case "merged":
      return "Pull request merged";
    case "closed":
      return "Pull request closed";
  }
}

function iconFor(kind: PRCardKind): SFSymbol {
  switch (kind) {
    case "opened":
      return "arrow.up.circle";
    case "merged":
      return "checkmark.circle.fill";
    case "closed":
      return "xmark.circle";
  }
}

/**
 * Compact PR lifecycle card. Tap opens the PR URL in the system browser.
 * Backs the `session_pr_opened`, `session_pr_merged`, and
 * `session_pr_closed` events — web currently renders nothing for these, so
 * this is new surface area on mobile.
 */
export function PRCard({ kind, prUrl }: PRCardProps) {
  const theme = useTheme();
  const tint =
    kind === "merged"
      ? theme.colors.statusMerged
      : kind === "closed"
        ? theme.colors.mutedForeground
        : theme.colors.accent;

  async function handlePress() {
    if (!prUrl) return;
    void haptic.light();
    try {
      await Linking.openURL(prUrl);
    } catch {
      /* user will see system error sheet */
    }
  }

  return (
    <Card
      padding="md"
      elevation="low"
      onPress={prUrl ? handlePress : undefined}
      accessibilityLabel={labelFor(kind)}
      style={{
        ...styles.card,
        backgroundColor: alpha(tint, 0.1),
        borderColor: alpha(tint, 0.3),
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <SymbolView
        name={iconFor(kind)}
        size={18}
        tintColor={tint}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <Text variant="footnote" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
        {labelFor(kind)}
      </Text>
      {prUrl ? (
        <Text variant="caption1" color="mutedForeground" numberOfLines={1} style={styles.url}>
          {prUrl}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  icon: { width: 18, height: 18 },
  url: { flex: 1 },
});
