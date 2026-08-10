import * as Clipboard from "expo-clipboard";
import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { TERMINAL_SHORTCUTS } from "./terminal-shortcuts";
import { useTheme } from "@/theme";

interface TerminalKeyToolbarProps {
  disabled: boolean;
  onCopy: () => void;
  onInput: (data: string) => void;
}

export function TerminalKeyToolbar({ disabled, onCopy, onInput }: TerminalKeyToolbarProps) {
  const theme = useTheme();
  const paste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) onInput(text);
    } catch {
      // Clipboard access can be denied by the operating system.
    }
  }, [onInput]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <TerminalKey label="Paste" disabled={disabled} onPress={() => void paste()} />
        <TerminalKey label="Copy" disabled={disabled} onPress={onCopy} />
        {TERMINAL_SHORTCUTS.map((shortcut) => (
          <TerminalKey
            key={shortcut.label}
            label={shortcut.label}
            disabled={disabled}
            onPress={() => onInput(shortcut.data)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TerminalKey({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === "⌃C" ? "Control C (interrupt)" : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { backgroundColor: theme.colors.surfaceElevated, opacity: disabled ? 0.45 : pressed ? 0.65 : 1 },
      ]}
    >
      <Text variant="footnote" color="foreground">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  content: {
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  key: {
    alignItems: "center",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 10,
  },
});
