import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SegmentedControl } from "@/components/design-system";
import { useTheme } from "@/theme";

export type SessionWorkspaceMode = "agent" | "preview";

interface SessionWorkspaceModeToggleProps {
  value: SessionWorkspaceMode;
  enabled?: boolean;
  onChange: (value: SessionWorkspaceMode) => void;
}

const SEGMENTS: Array<{ label: string; value: SessionWorkspaceMode }> = [
  { label: "Agent", value: "agent" },
  { label: "Preview", value: "preview" },
];

export const SessionWorkspaceModeToggle = memo(function SessionWorkspaceModeToggle({
  value,
  enabled = true,
  onChange,
}: SessionWorkspaceModeToggleProps) {
  const theme = useTheme();
  const selectedIndex = SEGMENTS.findIndex((segment) => segment.value === value);

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        },
      ]}
    >
      <SegmentedControl
        segments={SEGMENTS.map((segment) => segment.label)}
        selectedIndex={Math.max(selectedIndex, 0)}
        enabled={enabled}
        onChange={(index) => onChange(SEGMENTS[index]?.value ?? "agent")}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
});
