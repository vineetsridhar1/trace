import { Image } from "react-native";
import type { CodingTool } from "@trace/gql";

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
      source={
        tool === "codex"
          ? require("../../../../assets/images/codex-logo.png")
          : require("../../../../assets/images/claude-logo.png")
      }
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
