import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { ListRow } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface SessionTerminalSwitcherRowProps {
  sessionId: string;
  active: boolean;
  separator: boolean;
  onPress: () => void;
}

export function SessionTerminalSwitcherRow({
  sessionId,
  active,
  separator,
  onPress,
}: SessionTerminalSwitcherRowProps) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name") as string | null | undefined;

  return (
    <ListRow
      title={name ?? "Session"}
      subtitle={active ? "Current terminal" : "Open terminal"}
      leading={
        <SymbolView
          name="chevron.left.forwardslash.chevron.right"
          size={16}
          tintColor={theme.colors.mutedForeground}
        />
      }
      trailing={
        active ? (
          <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
        ) : undefined
      }
      onPress={onPress}
      haptic={active ? "none" : "selection"}
      separator={separator}
      accessibilityLabel={
        active ? `${name ?? "Session"}, current terminal` : `Open terminal for ${name ?? "session"}`
      }
      style={active ? { backgroundColor: alpha(theme.colors.accent, 0.12) } : undefined}
    />
  );
}
