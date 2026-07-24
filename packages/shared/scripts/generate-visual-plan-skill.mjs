import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(packageDir, "visual-plan-skill");
const outputPath = path.join(packageDir, "src", "visual-plan-skill.generated.ts");
const fileNames = [
  "SKILL.md",
  "LICENSE",
  "references/canvas.md",
  "references/connection.md",
  "references/document-quality.md",
  "references/exemplar.md",
  "references/local-files.md",
  "references/wireframe.md",
];
const files = Object.fromEntries(
  fileNames.map((fileName) => [
    fileName,
    fs.readFileSync(path.join(skillDir, fileName), "utf8"),
  ]),
);
const output = `// Generated from packages/shared/visual-plan-skill. Do not edit by hand.
export const VISUAL_PLAN_SKILL_FILES: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)};
`;

fs.writeFileSync(outputPath, output);
