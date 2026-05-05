import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface AssistantMessageProps {
  text: string;
}

export const AssistantMessage = memo(function AssistantMessage({ text }: AssistantMessageProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrapper, { paddingVertical: theme.spacing.xs }]}>
      <View>
        <Markdown copyBlocks>{text}</Markdown>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
});
