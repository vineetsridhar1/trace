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

  if (tool === "antigravity") {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Path
          fill={theme.colors.foreground}
          d="M32 6 58 52H45.5L32 28.2 18.5 52H6Z"
        />
        <Path fill={theme.colors.background} d="M32 28.2 24.4 41.6H39.6Z" />
        <Path fill={theme.colors.foreground} d="M24.4 41.6 18.5 52H45.5L39.6 41.6Z" />
      </Svg>
    );
  }

  if (tool === "cursor_composer") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={theme.colors.foreground}
          fillRule="evenodd"
          d="M22.106 5.68 12.5.135a.998.998 0 0 0-.998 0L1.893 5.68a.84.84 0 0 0-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 0 0 .998 0l9.608-5.547a.84.84 0 0 0 .42-.727V6.407a.84.84 0 0 0-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 0 0-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"
        />
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
