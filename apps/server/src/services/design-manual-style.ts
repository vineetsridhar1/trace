import type { DesignElementStylesInput } from "@trace/gql";
import { ValidationError } from "../lib/errors.js";
import {
  designSourceHash,
  validateDesignElementId,
  type ManualEditableProjectKind,
} from "./design-manual-edit.js";

export const DESIGN_MANUAL_STYLE_PATH = "src/design/manual.css";
export const PDF_MANUAL_STYLE_PATH = "src/manual.css";

export function manualStylePath(kind: ManualEditableProjectKind): string {
  return kind === "design" ? DESIGN_MANUAL_STYLE_PATH : PDF_MANUAL_STYLE_PATH;
}

export type ManualDesignElementStyles = {
  [Key in keyof DesignElementStylesInput]?: NonNullable<DesignElementStylesInput[Key]>;
};

const STYLE_PROPERTIES = [
  ["color", "color"],
  ["backgroundColor", "background-color"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["textAlign", "text-align"],
  ["borderRadius", "border-radius"],
  ["paddingX", "--trace-padding-x"],
  ["paddingY", "--trace-padding-y"],
] as const;

export function readManualDesignElementStyles(
  source: string,
  elementId: string,
): { styles: ManualDesignElementStyles; sourceHash: string } {
  const id = validateDesignElementId(elementId);
  const block = findStyleBlock(source, id);
  return {
    styles: block ? parseStyleBlock(block.content) : {},
    sourceHash: designSourceHash(source),
  };
}

export function updateManualDesignElementStyles(
  source: string,
  elementId: string,
  input: DesignElementStylesInput,
): { source: string; styles: ManualDesignElementStyles; sourceHash: string } {
  const id = validateDesignElementId(elementId);
  const styles = validateStyles(input);
  const existing = findStyleBlock(source, id);
  const block = serializeStyleBlock(id, styles);
  let nextSource: string;

  if (existing) {
    nextSource = `${source.slice(0, existing.start)}${block}${source.slice(existing.end)}`;
  } else if (block) {
    const prefix = source.length === 0 || source.endsWith("\n") ? source : `${source}\n`;
    nextSource = `${prefix}${prefix.trim() ? "\n" : ""}${block}`;
  } else {
    nextSource = source;
  }

  return { source: nextSource, styles, sourceHash: designSourceHash(nextSource) };
}

function validateStyles(input: DesignElementStylesInput): ManualDesignElementStyles {
  const styles: ManualDesignElementStyles = {};
  if (input.color != null) styles.color = validateColor(input.color, "Text color");
  if (input.backgroundColor != null) {
    styles.backgroundColor = validateColor(input.backgroundColor, "Background color");
  }
  if (input.fontSize != null) styles.fontSize = validateInteger(input.fontSize, 8, 96, "Font size");
  if (input.fontWeight != null) {
    if (![400, 500, 600, 700].includes(input.fontWeight)) {
      throw new ValidationError("Font weight must be 400, 500, 600, or 700");
    }
    styles.fontWeight = input.fontWeight;
  }
  if (input.textAlign != null) {
    if (!["left", "center", "right"].includes(input.textAlign)) {
      throw new ValidationError("Text alignment must be left, center, or right");
    }
    styles.textAlign = input.textAlign;
  }
  if (input.borderRadius != null) {
    styles.borderRadius = validateInteger(input.borderRadius, 0, 64, "Border radius");
  }
  if (input.paddingX != null) {
    styles.paddingX = validateInteger(input.paddingX, 0, 64, "Horizontal padding");
  }
  if (input.paddingY != null) {
    styles.paddingY = validateInteger(input.paddingY, 0, 64, "Vertical padding");
  }
  return styles;
}

function validateColor(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent" || /^#[0-9a-f]{6}$/u.test(normalized)) return normalized;
  throw new ValidationError(`${label} must be a six-digit hex color or transparent`);
}

function validateInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function styleMarkers(elementId: string): { start: string; end: string } {
  return {
    start: `/* trace-manual:start ${elementId} */`,
    end: `/* trace-manual:end ${elementId} */`,
  };
}

function findStyleBlock(
  source: string,
  elementId: string,
): { start: number; end: number; content: string } | null {
  const markers = styleMarkers(elementId);
  const start = source.indexOf(markers.start);
  if (start === -1) return null;
  const endMarkerStart = source.indexOf(markers.end, start + markers.start.length);
  if (endMarkerStart === -1) {
    throw new ValidationError(`Manual style block is invalid for ${elementId}`);
  }
  let end = endMarkerStart + markers.end.length;
  if (source.slice(end, end + 1) === "\n") end += 1;
  return { start, end, content: source.slice(start, end) };
}

function parseStyleBlock(block: string): ManualDesignElementStyles {
  const styles: ManualDesignElementStyles = {};
  for (const [key, cssName] of STYLE_PROPERTIES) {
    const match = block.match(new RegExp(`(?:^|\\n)\\s*${cssName}:\\s*([^;]+);`, "u"));
    if (!match) continue;
    const value = match[1]!.trim();
    if (key === "color" || key === "backgroundColor" || key === "textAlign") {
      styles[key] = value;
    } else {
      const numeric = Number.parseInt(value, 10);
      if (Number.isFinite(numeric)) styles[key] = numeric;
    }
  }
  return styles;
}

function serializeStyleBlock(elementId: string, styles: ManualDesignElementStyles): string {
  const declarations: string[] = [];
  for (const [key, cssName] of STYLE_PROPERTIES) {
    const value = styles[key];
    if (value === undefined) continue;
    const suffix = ["fontSize", "borderRadius", "paddingX", "paddingY"].includes(key) ? "px" : "";
    declarations.push(`  ${cssName}: ${value}${suffix};`);
  }
  if (styles.paddingX !== undefined) {
    declarations.push("  padding-left: var(--trace-padding-x);");
    declarations.push("  padding-right: var(--trace-padding-x);");
  }
  if (styles.paddingY !== undefined) {
    declarations.push("  padding-top: var(--trace-padding-y);");
    declarations.push("  padding-bottom: var(--trace-padding-y);");
  }
  if (declarations.length === 0) return "";

  const markers = styleMarkers(elementId);
  return `${markers.start}\n[data-trace-id="${elementId}"] {\n${declarations.join("\n")}\n}\n${markers.end}\n`;
}
