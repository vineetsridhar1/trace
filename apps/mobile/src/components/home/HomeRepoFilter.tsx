import { memo, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Text } from "@/components/design-system";
import { useHomeRepos } from "@/hooks/useHomeSections";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore, type MobileUIState } from "@/stores/ui";
import { useTheme, type Theme } from "@/theme";

export interface HomeRepoFilterProps {
  userId: string | null;
}

export const HomeRepoFilter = memo(function HomeRepoFilter({ userId }: HomeRepoFilterProps) {
  const theme = useTheme();
  const repos = useHomeRepos(userId);
  const selected = useMobileUIStore((s: MobileUIState) => s.homeRepoFilter);
  const setSelected = useMobileUIStore((s: MobileUIState) => s.setHomeRepoFilter);

  // If the selected repo no longer has any sessions in the home view, drop
  // the filter so the user isn't trapped staring at an empty list with the
  // chip row possibly hidden (repos.length < 2). Sessions naturally age out
  // of the 24h "Most recent" window, so this is a real path users hit.
  useEffect(() => {
    if (selected === null) return;
    if (!repos.some((r) => r.id === selected)) setSelected(null);
  }, [selected, repos, setSelected]);

  // Filter is meaningless with 0 or 1 repos — hide it entirely.
  if (repos.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.xs,
        },
      ]}
    >
      <RepoPill
        label="All"
        active={selected === null}
        onPress={() => {
          if (selected === null) return;
          void haptic.selection();
          setSelected(null);
        }}
        theme={theme}
      />
      {repos.map((repo) => (
        <RepoPill
          key={repo.id}
          label={repo.name}
          active={selected === repo.id}
          onPress={() => {
            void haptic.selection();
            setSelected(selected === repo.id ? null : repo.id);
          }}
          theme={theme}
        />
      ))}
    </ScrollView>
  );
});

interface RepoPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: Theme;
}

function RepoPill({ label, active, onPress, theme }: RepoPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.full,
          backgroundColor: active
            ? theme.colors.accent
            : pressed
              ? theme.colors.surfaceElevated
              : theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? theme.colors.accent : theme.colors.borderMuted,
        },
      ]}
    >
      <Text
        variant="footnote"
        numberOfLines={1}
        style={{
          color: active ? theme.colors.accentForeground : theme.colors.foreground,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  pill: {
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
});
