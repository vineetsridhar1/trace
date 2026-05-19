import { Image } from "react-native";
import Svg, { Path } from "react-native-svg";
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

  if (tool === "custom") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill="none"
          stroke={theme.colors.foreground}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM8 9l3 3-3 3m5 0h3"
        />
      </Svg>
    );
  }

  if (tool === "pi") {
    return (
      <Svg width={size} height={size} viewBox="0 0 800 800">
        <Path
          fill={theme.colors.foreground}
          fillRule="evenodd"
          d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"
        />
        <Path fill={theme.colors.foreground} d="M517.36 400 H634.72 V634.72 H517.36 Z" />
      </Svg>
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
