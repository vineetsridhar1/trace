import { useCallback, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Text } from "@/components/design-system";
import type { SessionSlashCommand } from "@/lib/slashCommands";
import { alpha, useTheme } from "@/theme";

interface SessionComposerSlashCommandMenuProps {
  commands: SessionSlashCommand[];
  onSelect: (command: SessionSlashCommand) => void;
}

const MAX_MENU_HEIGHT = 280;
const INITIAL_RENDER_COUNT = 8;

export function SessionComposerSlashCommandMenu({
  commands,
  onSelect,
}: SessionComposerSlashCommandMenuProps) {
  const theme = useTheme();
  const commandCount = commands.length;
  const keyExtractor = useCallback(
    (command: SessionSlashCommand) => `${command.source}:${command.name}`,
    [],
  );
  const renderItem = useCallback<ListRenderItem<SessionSlashCommand>>(
    ({ item: command, index }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Use slash command /${command.name}`}
        onPress={() => onSelect(command)}
        style={({ pressed }) => [
          styles.row,
          {
            marginBottom: index < commandCount - 1 ? 2 : 0,
            backgroundColor: pressed ? "rgb(255, 255, 255, 0.05)" : undefined,
          },
        ]}
      >
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text
              variant="subheadline"
              numberOfLines={1}
              style={[
                styles.commandName,
                {
                  color: theme.colors.foreground,
                  fontFamily: theme.typography.mono.fontFamily,
                },
              ]}
            >
              {`/${command.name}`}
            </Text>
          </View>
          <Text
            variant="caption1"
            numberOfLines={2}
            style={{ color: alpha(theme.colors.foreground, 0.88) }}
          >
            {command.description}
          </Text>
        </View>
      </Pressable>
    ),
    [commandCount, onSelect, theme.colors.foreground, theme.typography.mono.fontFamily],
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(90)}
      exiting={FadeOutDown.duration(80)}
      style={[styles.container, theme.shadows.lg]}
    >
      <MenuSurface>
        <FlatList
          data={commands}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          indicatorStyle={theme.scheme === "dark" ? "white" : "black"}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          initialNumToRender={Math.min(commandCount, INITIAL_RENDER_COUNT)}
          maxToRenderPerBatch={INITIAL_RENDER_COUNT}
          windowSize={3}
          removeClippedSubviews
        />
      </MenuSurface>
    </Animated.View>
  );
}

function MenuSurface({ children }: { children: ReactNode }) {
  const theme = useTheme();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        colorScheme={theme.scheme === "dark" ? "dark" : "light"}
        style={styles.surface}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
      intensity={60}
      style={styles.surface}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: MAX_MENU_HEIGHT,
  },
  surface: {
    borderRadius: 20,
    maxHeight: MAX_MENU_HEIGHT,
    overflow: "hidden",
  },
  scrollView: { maxHeight: MAX_MENU_HEIGHT },
  content: {
    padding: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commandName: {
    flexShrink: 1,
  },
});
