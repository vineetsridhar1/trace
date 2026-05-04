import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { CopyableMarkdownBlock } from "./CopyableMarkdownBlock";
import { splitCopyBlocks } from "./copy-blocks";

interface AssistantMessageProps {
  text: string;
}

export const AssistantMessage = memo(function AssistantMessage({ text }: AssistantMessageProps) {
  const theme = useTheme();
  const blocks = useMemo(() => splitCopyBlocks(text), [text]);

  return (
    <View style={[styles.wrapper, { paddingVertical: theme.spacing.xs, gap: theme.spacing.xs }]}>
      {blocks.map((block) => (
        <CopyableMarkdownBlock key={block.id} text={block.text} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
});
