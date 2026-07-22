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
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["fontStyle", "font-style"],
  ["textDecoration", "text-decoration-line"],
  ["textAlign", "text-align"],
  ["lineHeight", "line-height"],
  ["letterSpacing", "letter-spacing"],
  ["textTransform", "text-transform"],
  ["width", "width"],
  ["height", "height"],
  ["minWidth", "min-width"],
  ["maxWidth", "max-width"],
  ["minHeight", "min-height"],
  ["maxHeight", "max-height"],
  ["flexGrow", "flex-grow"],
  ["alignSelf", "align-self"],
  ["position", "position"],
  ["top", "top"],
  ["right", "right"],
  ["bottom", "bottom"],
  ["left", "left"],
  ["zIndex", "z-index"],
  ["display", "display"],
  ["flexDirection", "flex-direction"],
  ["justifyContent", "justify-content"],
  ["alignItems", "align-items"],
  ["gap", "gap"],
  ["borderRadius", "border-radius"],
  ["paddingX", "--trace-padding-x"],
  ["paddingY", "--trace-padding-y"],
  ["paddingTop", "padding-top"],
  ["paddingRight", "padding-right"],
  ["paddingBottom", "padding-bottom"],
  ["paddingLeft", "padding-left"],
  ["marginTop", "margin-top"],
  ["marginRight", "margin-right"],
  ["marginBottom", "margin-bottom"],
  ["marginLeft", "margin-left"],
  ["opacity", "opacity"],
  ["overflow", "overflow"],
  ["objectFit", "object-fit"],
  ["borderColor", "border-color"],
  ["borderWidth", "border-width"],
  ["borderStyle", "border-style"],
  ["cursor", "cursor"],
  ["pointerEvents", "pointer-events"],
  ["whiteSpace", "white-space"],
  ["textOverflow", "text-overflow"],
  ["boxSizing", "box-sizing"],
  ["aspectRatio", "aspect-ratio"],
  ["boxShadow", "box-shadow"],
  ["textShadow", "text-shadow"],
  ["transform", "transform"],
  ["filter", "filter"],
] as const;

const PIXEL_STYLE_KEYS = new Set([
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "gap",
  "borderRadius",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "borderWidth",
]);

const STRING_STYLE_KEYS = new Set([
  "color",
  "backgroundColor",
  "fontFamily",
  "fontStyle",
  "textDecoration",
  "textAlign",
  "textTransform",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "alignSelf",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "display",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "overflow",
  "objectFit",
  "borderColor",
  "borderStyle",
  "cursor",
  "pointerEvents",
  "whiteSpace",
  "textOverflow",
  "boxSizing",
  "aspectRatio",
  "boxShadow",
  "textShadow",
  "transform",
  "filter",
]);

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
  if (input.fontFamily != null) {
    styles.fontFamily = validateCssText(input.fontFamily, "Font family", 160);
  }
  if (input.fontSize != null) styles.fontSize = validateInteger(input.fontSize, 8, 96, "Font size");
  if (input.fontWeight != null) {
    if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(input.fontWeight)) {
      throw new ValidationError("Font weight must be between 100 and 900");
    }
    styles.fontWeight = input.fontWeight;
  }
  if (input.fontStyle != null) {
    styles.fontStyle = validateEnum(input.fontStyle, ["normal", "italic"], "Font style");
  }
  if (input.textDecoration != null) {
    styles.textDecoration = validateEnum(
      input.textDecoration,
      ["none", "underline", "line-through"],
      "Text decoration",
    );
  }
  if (input.textAlign != null) {
    styles.textAlign = validateEnum(
      input.textAlign,
      ["left", "center", "right", "justify"],
      "Text alignment",
    );
  }
  if (input.lineHeight != null) {
    styles.lineHeight = validateInteger(input.lineHeight, 8, 240, "Line height");
  }
  if (input.letterSpacing != null) {
    styles.letterSpacing = validateInteger(input.letterSpacing, -32, 64, "Letter spacing");
  }
  if (input.textTransform != null) {
    styles.textTransform = validateEnum(
      input.textTransform,
      ["none", "uppercase", "lowercase", "capitalize"],
      "Text transform",
    );
  }
  for (const key of [
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
  ] as const) {
    if (input[key] != null) styles[key] = validateCssLength(input[key], readableStyleName(key));
  }
  if (input.flexGrow != null) styles.flexGrow = validateNumber(input.flexGrow, 0, 100, "Grow");
  if (input.alignSelf != null) {
    styles.alignSelf = validateEnum(
      input.alignSelf,
      ["auto", "flex-start", "center", "flex-end", "stretch", "baseline"],
      "Self alignment",
    );
  }
  if (input.position != null) {
    styles.position = validateEnum(
      input.position,
      ["static", "relative", "absolute", "fixed", "sticky"],
      "Position",
    );
  }
  for (const key of ["top", "right", "bottom", "left"] as const) {
    if (input[key] != null)
      styles[key] = validateCssLength(input[key], readableStyleName(key), true);
  }
  if (input.zIndex != null) {
    const value = input.zIndex.trim();
    if (value !== "auto" && !/^-?\d{1,6}$/u.test(value)) {
      throw new ValidationError("Z-index must be auto or an integer");
    }
    styles.zIndex = value;
  }
  if (input.display != null) {
    styles.display = validateEnum(
      input.display,
      ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "none"],
      "Display",
    );
  }
  if (input.flexDirection != null) {
    styles.flexDirection = validateEnum(
      input.flexDirection,
      ["row", "row-reverse", "column", "column-reverse"],
      "Flex direction",
    );
  }
  if (input.justifyContent != null) {
    styles.justifyContent = validateEnum(
      input.justifyContent,
      [
        "normal",
        "flex-start",
        "center",
        "flex-end",
        "space-between",
        "space-around",
        "space-evenly",
      ],
      "Content alignment",
    );
  }
  if (input.alignItems != null) {
    styles.alignItems = validateEnum(
      input.alignItems,
      ["normal", "flex-start", "center", "flex-end", "stretch", "baseline"],
      "Item alignment",
    );
  }
  if (input.gap != null) styles.gap = validateInteger(input.gap, 0, 256, "Gap");
  if (input.borderRadius != null) {
    styles.borderRadius = validateInteger(input.borderRadius, 0, 512, "Border radius");
  }
  if (input.paddingX != null) {
    styles.paddingX = validateInteger(input.paddingX, 0, 512, "Horizontal padding");
  }
  if (input.paddingY != null) {
    styles.paddingY = validateInteger(input.paddingY, 0, 512, "Vertical padding");
  }
  for (const key of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) {
    if (input[key] != null) {
      styles[key] = validateInteger(input[key], 0, 512, readableStyleName(key));
    }
  }
  for (const key of ["marginTop", "marginRight", "marginBottom", "marginLeft"] as const) {
    if (input[key] != null) {
      styles[key] = validateInteger(input[key], -512, 512, readableStyleName(key));
    }
  }
  if (input.opacity != null) styles.opacity = validateNumber(input.opacity, 0, 1, "Opacity");
  if (input.overflow != null) {
    styles.overflow = validateEnum(
      input.overflow,
      ["visible", "hidden", "clip", "scroll", "auto"],
      "Overflow",
    );
  }
  if (input.objectFit != null) {
    styles.objectFit = validateEnum(
      input.objectFit,
      ["fill", "contain", "cover", "none", "scale-down"],
      "Object fit",
    );
  }
  if (input.borderColor != null) {
    styles.borderColor = validateColor(input.borderColor, "Border color");
  }
  if (input.borderWidth != null) {
    styles.borderWidth = validateInteger(input.borderWidth, 0, 32, "Border width");
  }
  if (input.borderStyle != null) {
    styles.borderStyle = validateEnum(
      input.borderStyle,
      ["none", "solid", "dashed", "dotted", "double"],
      "Border style",
    );
  }
  if (input.cursor != null) {
    styles.cursor = validateEnum(
      input.cursor,
      [
        "auto",
        "default",
        "pointer",
        "grab",
        "grabbing",
        "text",
        "move",
        "not-allowed",
        "crosshair",
        "zoom-in",
        "zoom-out",
      ],
      "Cursor",
    );
  }
  if (input.pointerEvents != null) {
    styles.pointerEvents = validateEnum(input.pointerEvents, ["auto", "none"], "Pointer events");
  }
  if (input.whiteSpace != null) {
    styles.whiteSpace = validateEnum(
      input.whiteSpace,
      ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
      "White space",
    );
  }
  if (input.textOverflow != null) {
    styles.textOverflow = validateEnum(input.textOverflow, ["clip", "ellipsis"], "Text overflow");
  }
  if (input.boxSizing != null) {
    styles.boxSizing = validateEnum(input.boxSizing, ["content-box", "border-box"], "Box sizing");
  }
  if (input.aspectRatio != null) {
    const value = input.aspectRatio.trim();
    if (value !== "auto" && !/^\d{1,4}(?:\.\d+)?(?:\s*\/\s*\d{1,4}(?:\.\d+)?)?$/u.test(value)) {
      throw new ValidationError("Aspect ratio must be auto, a number, or a ratio such as 16 / 9");
    }
    styles.aspectRatio = value;
  }
  for (const key of ["boxShadow", "textShadow", "transform", "filter"] as const) {
    if (input[key] != null) {
      styles[key] = validateCssText(input[key], readableStyleName(key), 240);
    }
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

function validateNumber(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function validateEnum<Value extends string>(
  value: string,
  values: readonly Value[],
  label: string,
): Value {
  if (!values.includes(value as Value)) {
    throw new ValidationError(`${label} has an unsupported value`);
  }
  return value as Value;
}

function validateCssLength(value: string, label: string, allowNegative = false): string {
  const normalized = value.trim().toLowerCase();
  const keyword = /^(?:auto|none|min-content|max-content|fit-content)$/u;
  const numeric = new RegExp(
    `^${allowNegative ? "-?" : ""}\\d{1,4}(?:\\.\\d+)?(?:px|%|rem|em|vw|vh)$`,
    "u",
  );
  if (!keyword.test(normalized) && !numeric.test(normalized)) {
    throw new ValidationError(`${label} must be a CSS length or auto`);
  }
  return normalized;
}

function validateCssText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    /[;{}<>]/u.test(normalized) ||
    /url\s*\(/iu.test(normalized)
  ) {
    throw new ValidationError(`${label} contains unsupported CSS`);
  }
  return normalized;
}

function readableStyleName(key: string): string {
  return key.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/^./u, (letter) => letter.toUpperCase());
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
  const styles: Record<string, string | number> = {};
  for (const [key, cssName] of STYLE_PROPERTIES) {
    const match = block.match(new RegExp(`(?:^|\\n)\\s*${cssName}:\\s*([^;]+);`, "u"));
    if (!match) continue;
    const value = match[1]!.trim();
    if (STRING_STYLE_KEYS.has(key)) {
      styles[key] = value;
    } else {
      const numeric = Number.parseFloat(value);
      if (Number.isFinite(numeric)) styles[key] = numeric;
    }
  }
  return styles as ManualDesignElementStyles;
}

function serializeStyleBlock(elementId: string, styles: ManualDesignElementStyles): string {
  const declarations: string[] = [];
  for (const [key, cssName] of STYLE_PROPERTIES) {
    const value = styles[key];
    if (value === undefined) continue;
    const suffix = PIXEL_STYLE_KEYS.has(key) ? "px" : "";
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
