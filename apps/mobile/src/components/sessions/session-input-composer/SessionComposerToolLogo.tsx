import { Image, Text, View } from "react-native";
import type { CodingTool } from "@trace/gql";
import { useTheme } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CODEX_LOGO = require("../../../../assets/images/codex-logo.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CLAUDE_LOGO = require("../../../../assets/images/claude-logo.png");

interface SessionComposerToolLogoProps {
  tool: CodingTool;
  size: number;
}

export function SessionComposerToolLogo({ tool, size }: SessionComposerToolLogoProps) {
  const theme = useTheme();

  if (tool === "pi") {
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: size * 0.75,
            fontWeight: "700",
            lineHeight: size,
          }}
        >
          Pi
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={tool === "codex" ? CODEX_LOGO : CLAUDE_LOGO}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
