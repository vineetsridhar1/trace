import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView } from "expo-symbols";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Text } from "@/components/design-system";
import type { SessionSlashCommand } from "@/lib/slashCommands";
import { alpha, useTheme } from "@/theme";

interface SessionComposerSlashCommandMenuProps {
  commands: SessionSlashCommand[];
  onSelect: (command: SessionSlashCommand) => void;
}

const MAX_MENU_HEIGHT = 280;

function getSourceLabel(source: SessionSlashCommand["source"]): string {
  if (source === "project_skill") return "Project";
  if (source === "user_skill") return "Personal";
  return "Built in";
}

export function SessionComposerSlashCommandMenu({
  commands,
  onSelect,
}: SessionComposerSlashCommandMenuProps) {
  const theme = useTheme();
  const surfaceTone = isLiquidGlassAvailable()
    ? alpha(theme.colors.background, 0.18)
    : alpha(theme.colors.background, 0.3);

  return (
    <Animated.View
      entering={FadeInDown.duration(140)}
      exiting={FadeOutDown.duration(100)}
      style={[styles.container, theme.shadows.lg]}
    >
      <MenuSurface>
        <ScrollView
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          indicatorStyle={theme.scheme === "dark" ? "white" : "black"}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
        >
          {commands.map((command, index) => (
            <Pressable
              key={`${command.source}:${command.name}`}
              accessibilityRole="button"
              accessibilityLabel={`Use slash command /${command.name}`}
              onPress={() => onSelect(command)}
              style={({ pressed }) => [
                styles.row,
                {
                  marginBottom: index < commands.length - 1 ? 2 : 0,
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
          ))}
        </ScrollView>
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
  surfaceTone: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
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
  iconShell: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 14,
    height: 14,
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
  sourceLabel: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
