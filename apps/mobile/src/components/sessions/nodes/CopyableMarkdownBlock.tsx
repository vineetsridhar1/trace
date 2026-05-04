import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import { alpha, useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { Markdown } from "./Markdown";

interface CopyableMarkdownBlockProps {
  text: string;
  compactSpacing?: boolean;
}

export const CopyableMarkdownBlock = memo(function CopyableMarkdownBlock({
  text,
  compactSpacing = false,
}: CopyableMarkdownBlockProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return;
    await Clipboard.setStringAsync(text);
    void haptic.light();
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopied(true);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [text]);

  return (
    <View style={[styles.row, { gap: theme.spacing.xs }]}>
      <View style={styles.content}>
        <Markdown compactSpacing={compactSpacing}>{text}</Markdown>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? "Copied" : "Copy block"}
        hitSlop={6}
        onPress={handleCopy}
        style={({ pressed }) => [
          styles.copyButton,
          {
            backgroundColor: copied
              ? alpha(theme.colors.success, 0.16)
              : pressed
                ? alpha(theme.colors.foreground, 0.1)
                : alpha(theme.colors.foreground, 0.06),
            borderRadius: theme.radius.full,
          },
        ]}
      >
        <SymbolView
          name={copied ? "checkmark" : "doc.on.doc"}
          size={13}
          tintColor={copied ? theme.colors.success : theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={styles.copyGlyph}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  copyButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
  },
  copyGlyph: {
    width: 13,
    height: 13,
  },
});
