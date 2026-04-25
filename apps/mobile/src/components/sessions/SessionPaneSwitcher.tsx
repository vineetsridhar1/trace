import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SegmentedControl } from "@/components/design-system";
import { useTheme } from "@/theme";

export type SessionPane = "session" | "terminal" | "browser";

interface SessionPaneSwitcherProps {
  value: SessionPane;
  onChange: (value: SessionPane) => void;
}

const SEGMENTS: Array<{ label: string; value: SessionPane }> = [
  { label: "Session", value: "session" },
  { label: "Terminal", value: "terminal" },
  { label: "Browser", value: "browser" },
];

export const SessionPaneSwitcher = memo(function SessionPaneSwitcher({
  value,
  onChange,
}: SessionPaneSwitcherProps) {
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
        onChange={(index) => onChange(SEGMENTS[index]?.value ?? "session")}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
});
