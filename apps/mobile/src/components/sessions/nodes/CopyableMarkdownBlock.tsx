import { memo, useCallback } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { haptic } from "@/lib/haptics";
import { Markdown } from "./Markdown";

const COPY_ACTION_INDEX = 0;
const CANCEL_ACTION_INDEX = 1;
const ACTION_SHEET_OPTIONS = ["Copy", "Cancel"];

interface CopyableMarkdownBlockProps {
  text: string;
  compactSpacing?: boolean;
}

export const CopyableMarkdownBlock = memo(function CopyableMarkdownBlock({
  text,
  compactSpacing = false,
}: CopyableMarkdownBlockProps) {
  const handleCopy = useCallback(async () => {
    if (!text.trim()) return;
    await Clipboard.setStringAsync(text);
    void haptic.light();
  }, [text]);

  const handleLongPress = useCallback(() => {
    if (!text.trim()) return;
    void haptic.selection();

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ACTION_SHEET_OPTIONS,
          cancelButtonIndex: CANCEL_ACTION_INDEX,
          userInterfaceStyle: "dark",
        },
        (buttonIndex) => {
          if (buttonIndex === COPY_ACTION_INDEX) void handleCopy();
        },
      );
      return;
    }

    Alert.alert("Copy block", undefined, [
      { text: "Copy", onPress: () => void handleCopy() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [handleCopy, text]);

  return (
    <Pressable
      accessible={false}
      delayLongPress={320}
      onLongPress={handleLongPress}
      style={styles.block}
    >
      <Markdown compactSpacing={compactSpacing}>{text}</Markdown>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  block: {
    width: "100%",
  },
});
