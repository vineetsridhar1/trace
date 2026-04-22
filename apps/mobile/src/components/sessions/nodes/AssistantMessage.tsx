import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import ContextMenu, { type ContextMenuOnPressNativeEvent } from "react-native-context-menu-view";
import { useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { Markdown } from "./Markdown";
import { StreamingCursor } from "./StreamingCursor";
import { COPY_CONTEXT_MENU } from "./utils";

interface AssistantMessageProps {
  text: string;
  /** Show blinking cursor — set when this is the most recent assistant text and the session is still active. */
  streaming?: boolean;
}

export const AssistantMessage = memo(function AssistantMessage({
  text,
  streaming = false,
}: AssistantMessageProps) {
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
          {streaming ? (
            <View style={styles.footer}>
              <StreamingCursor />
            </View>
          ) : null}
        </View>
      </ContextMenu>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
  },
});
