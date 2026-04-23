import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { StreamingCursor } from "./nodes/StreamingCursor";

/**
 * Dedicated bottom-of-stream typing affordance for active sessions. This
 * stays visible even when the newest transcript row is a tool call/result
 * instead of assistant text.
 */
export function SessionTypingIndicator() {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel="AI is still working"
      style={[
        styles.container,
        {
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xs,
        },
      ]}
    >
      <StreamingCursor />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
});
