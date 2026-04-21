import { StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/theme";

interface StreamRowProps {
  children: ReactNode;
}

/**
 * Common wrapper for every visible session node. When `children` is null or
 * undefined, no wrapper is emitted — this prevents non-renderable events
 * (unknown event types, hidden payloads) from leaving empty gaps in the list.
 */
export function StreamRow({ children }: StreamRowProps) {
  const theme = useTheme();
  if (children == null || children === false) return null;
  return (
    <View style={[styles.row, { paddingHorizontal: theme.spacing.lg }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
});
