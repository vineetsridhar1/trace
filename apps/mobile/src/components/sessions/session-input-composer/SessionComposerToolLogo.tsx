import { Image } from "react-native";
import type { CodingTool } from "@trace/gql";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CODEX_LOGO = require("../../../../assets/images/codex-logo.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CLAUDE_LOGO = require("../../../../assets/images/claude-logo.png");

interface SessionComposerToolLogoProps {
  tool: CodingTool;
  size: number;
}

export function SessionComposerToolLogo({
  tool,
  size,
}: SessionComposerToolLogoProps) {
  return (
    <Image
      source={tool === "codex" ? CODEX_LOGO : CLAUDE_LOGO}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
