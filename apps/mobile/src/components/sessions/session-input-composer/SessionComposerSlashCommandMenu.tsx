import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Glass, Text } from "@/components/design-system";
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

  return (
    <Animated.View
      entering={FadeInDown.duration(140)}
      exiting={FadeOutDown.duration(100)}
      style={styles.container}
    >
      <Glass
        preset="input"
        interactive
        style={[
          styles.surface,
          theme.shadows.md,
          {
            backgroundColor: theme.glass.input.tint ?? theme.colors.glassTint,
            borderColor: alpha(theme.colors.foreground, 0.1),
          },
        ]}
      >
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
                index < commands.length - 1 ? styles.rowWithDivider : null,
                {
                  borderBottomColor: alpha(theme.colors.foreground, 0.08),
                  backgroundColor: pressed ? alpha(theme.colors.foreground, 0.08) : "transparent",
                },
              ]}
            >
              <View
                style={[
                  styles.iconShell,
                  {
                    backgroundColor: alpha(theme.colors.foreground, 0.06),
                    borderColor: alpha(theme.colors.foreground, 0.06),
                  },
                ]}
              >
                <SymbolView
                  name="chevron.left.forwardslash.chevron.right"
                  size={14}
                  tintColor={theme.colors.accent}
                  resizeMode="scaleAspectFit"
                  style={styles.icon}
                />
              </View>

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
                  <Text
                    variant="caption2"
                    style={[
                      styles.sourceLabel,
                      {
                        color: theme.colors.mutedForeground,
                        backgroundColor: alpha(theme.colors.foreground, 0.06),
                      },
                    ]}
                  >
                    {getSourceLabel(command.source)}
                  </Text>
                </View>
                <Text
                  variant="caption1"
                  numberOfLines={2}
                  style={{ color: alpha(theme.colors.foreground, 0.8) }}
                >
                  {command.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: MAX_MENU_HEIGHT,
  },
  surface: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: MAX_MENU_HEIGHT,
    overflow: "hidden",
  },
  scrollView: { maxHeight: MAX_MENU_HEIGHT },
  content: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowWithDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
