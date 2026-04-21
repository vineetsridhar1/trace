import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { asJsonObject } from "@trace/shared";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { ToolResultRow } from "./ToolResultRow";
import { formatCommandLabel, formatTime, serializeUnknown, truncate } from "./utils";

interface ToolCallRowProps {
  name: string;
  input?: Record<string, unknown>;
  output?: string | Record<string, unknown>;
  timestamp: string;
}

const PREVIEW_LEN = 60;

/**
 * Collapsed tool-invocation row. Tap expands both the tool arguments (as
 * JSON) and the matching tool_result inline via `ToolResultRow`. Bash and
 * command invocations render via `CommandExecutionRow` — this component
 * handles every other tool name.
 */
export function ToolCallRow({ name, input, output, timestamp }: ToolCallRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const lowered = name.toLowerCase();
  const isCommand = lowered === "bash" || lowered === "command";
  const preview = (() => {
    if (isCommand && typeof input?.command === "string") {
      return formatCommandLabel(input.command);
    }
    if (typeof input?.file_path === "string") return input.file_path;
    if (typeof input?.pattern === "string") return input.pattern;
    if (typeof input?.description === "string") return input.description;
    return null;
  })();

  const hasBody = input != null || output != null;
  const outputIsError =
    (typeof output === "string" && /error|failed/i.test(output)) ||
    asJsonObject(output)?.isError === true;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} tool call`}
        disabled={!hasBody}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surfaceElevated,
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            gap: theme.spacing.xs,
            borderRadius: theme.radius.sm,
          },
        ]}
      >
        <SymbolView
          name={open ? "chevron.down" : "chevron.right"}
          size={10}
          tintColor={theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={[styles.chevron, { opacity: hasBody ? 1 : 0 }]}
        />
        <Text variant="caption1" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          {name}
        </Text>
        {preview ? (
          <Text
            variant="caption1"
            color="mutedForeground"
            numberOfLines={1}
            style={[styles.preview, { fontFamily: "Menlo" }]}
          >
            {truncate(preview, PREVIEW_LEN)}
          </Text>
        ) : null}
        <Text variant="caption2" color="dimForeground" style={styles.time}>
          {formatTime(timestamp)}
        </Text>
      </Pressable>
      {open && hasBody ? (
        <View
          style={[
            styles.body,
            {
              backgroundColor: alpha(theme.colors.surfaceElevated, 0.4),
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.sm,
              gap: theme.spacing.xs,
            },
          ]}
        >
          {input != null ? (
            <>
              <Text variant="caption2" color="dimForeground">
                Input
              </Text>
              <Text
                style={[styles.code, { color: theme.colors.mutedForeground }]}
                selectable
              >
                {serializeUnknown(input)}
              </Text>
            </>
          ) : null}
          {output != null ? <ToolResultRow output={output} isError={outputIsError} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  chevron: { width: 10, height: 10 },
  preview: { flex: 1 },
  time: { marginLeft: "auto" },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  code: {
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 16,
  },
});
