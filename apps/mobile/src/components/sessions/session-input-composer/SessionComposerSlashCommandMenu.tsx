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
        preset="card"
        style={[
          styles.surface,
          {
            borderColor: alpha(theme.colors.border, 0.95),
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {commands.map((command) => (
            <Pressable
              key={`${command.source}:${command.name}`}
              accessibilityRole="button"
              accessibilityLabel={`Use slash command /${command.name}`}
              onPressIn={() => onSelect(command)}
              style={({ pressed }) => [
                styles.row,
                pressed
                  ? { backgroundColor: alpha(theme.colors.accent, 0.16) }
                  : null,
              ]}
            >
              <View
                style={[
                  styles.iconShell,
                  {
                    backgroundColor: alpha(theme.colors.accent, 0.14),
                    borderColor: alpha(theme.colors.accent, 0.28),
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
                <Text variant="caption1" color="mutedForeground" numberOfLines={2}>
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
    maxHeight: 280,
  },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  content: {
    padding: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
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
    gap: 2,
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
