import fs from "node:fs";
import path from "node:path";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VISUAL_PLAN_SKILL_FILES } from "./visual-plan-skill.generated.js";

export const TRACE_VISUAL_PLAN_SKILL = VISUAL_PLAN_SKILL_FILES["SKILL.md"];

const PLAN_BLOCK_PATTERN =
  /<(RichText|Callout|Checklist|Table|CodeTabs|Code|AnnotatedCode|Tabs|Columns|Diagram|Mermaid|ApiEndpoint|DataModel|Diff|FileTree|Json|OpenApi|WireframeBlock|QuestionForm|VisualQuestions|Decision)\b/g;

export function getTraceVisualPlanSkillPath(planFilePath: string): string {
  return path.join(path.dirname(planFilePath), "visual-plan-skill", "SKILL.md");
}

export function materializeTraceVisualPlanSkill(planFilePath: string): string {
  const skillRoot = path.dirname(getTraceVisualPlanSkillPath(planFilePath));
  for (const [relativePath, content] of Object.entries(VISUAL_PLAN_SKILL_FILES)) {
    const targetPath = path.join(skillRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
  }
  return path.join(skillRoot, "SKILL.md");
}

export function validateTraceVisualPlan(content: string): string[] {
  const errors: string[] = [];

  try {
    unified().use(remarkParse).use(remarkMdx).parse(content);
  } catch (error) {
    const position =
      typeof error === "object" &&
      error !== null &&
      "line" in error &&
      "column" in error &&
      typeof error.line === "number" &&
      typeof error.column === "number"
        ? ` at line ${error.line}, column ${error.column}`
        : "";
    const message = error instanceof Error ? error.message : "Could not parse MDX";
    errors.push(`Invalid MDX${position}: ${message}`);
  }

  if (!PLAN_BLOCK_PATTERN.test(content)) {
    errors.push("Use the structured Agent-Native Plan MDX block vocabulary.");
  }
  PLAN_BLOCK_PATTERN.lastIndex = 0;
  if (/^\s*(?:import|export)\s/m.test(content)) {
    errors.push("Imports and exports are not allowed.");
  }
  if (/<(?:script|iframe)\b/i.test(content)) {
    errors.push("Executable or embedded HTML is not allowed.");
  }

  return errors;
}
