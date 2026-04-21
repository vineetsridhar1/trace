import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import ContextMenu, {
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { Markdown } from "./Markdown";
import { StreamingCursor } from "./StreamingCursor";
import { COPY_CONTEXT_MENU, formatTime } from "./utils";

interface AssistantMessageProps {
  text: string;
  timestamp: string;
  /** Show blinking cursor — set when this is the most recent assistant text and the session is still active. */
  streaming?: boolean;
}

export function AssistantMessage({ text, timestamp, streaming = false }: AssistantMessageProps) {
  const theme = useTheme();

  const handleContextMenuPress = useCallback(
    (event: { nativeEvent: ContextMenuOnPressNativeEvent }) => {
      if (event.nativeEvent.index === 0) {
        void Clipboard.setStringAsync(text);
        void haptic.light();
      }
    },
    [text],
  );

  return (
    <View style={[styles.wrapper, { paddingVertical: theme.spacing.xs }]}>
      <ContextMenu actions={COPY_CONTEXT_MENU} onPress={handleContextMenuPress}>
        <View>
          <Markdown>{text}</Markdown>
          <View style={styles.footer}>
            {streaming ? <StreamingCursor /> : null}
            <Text variant="caption2" color="dimForeground" style={styles.time}>
              {formatTime(timestamp)}
            </Text>
          </View>
        </View>
      </ContextMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
  },
  time: { marginLeft: "auto" },
});
