import { createHash } from "crypto";
import ts from "typescript";
import { ValidationError } from "../lib/errors.js";

const DESIGN_SOURCE_PATH_PATTERN = /^src\/design\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.tsx$/;
const DESIGN_ELEMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type DesignElementTextSource = {
  filePath: string;
  elementId: string;
  text: string;
  sourceHash: string;
};

type TextTarget = {
  text: string;
  start: number;
  end: number;
  replacement: (value: string) => string;
};

export function validateDesignSourcePath(filePath: string): string {
  const normalized = filePath.trim();
  if (!DESIGN_SOURCE_PATH_PATTERN.test(normalized)) {
    throw new ValidationError("Manual design edits must target a TSX file under src/design");
  }
  return normalized;
}

export function validateDesignElementId(elementId: string): string {
  const normalized = elementId.trim();
  if (!DESIGN_ELEMENT_ID_PATTERN.test(normalized)) {
    throw new ValidationError("Invalid design element id");
  }
  return normalized;
}

export function designSourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function readStaticDesignElementText(
  source: string,
  filePath: string,
  elementId: string,
): DesignElementTextSource {
  const target = findTextTarget(source, filePath, elementId);
  return {
    filePath,
    elementId,
    text: target.text,
    sourceHash: designSourceHash(source),
  };
}

export function updateStaticDesignElementText(
  source: string,
  filePath: string,
  elementId: string,
  value: string,
): { source: string; previousText: string; text: string; sourceHash: string } {
  const text = normalizeTextValue(value);
  const target = findTextTarget(source, filePath, elementId);
  const nextSource = `${source.slice(0, target.start)}${target.replacement(text)}${source.slice(target.end)}`;
  return {
    source: nextSource,
    previousText: target.text,
    text,
    sourceHash: designSourceHash(nextSource),
  };
}

function findTextTarget(source: string, filePath: string, elementId: string): TextTarget {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const parseErrors = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseErrors?.length) {
    throw new ValidationError("The design source contains invalid TSX");
  }

  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && hasTraceId(node.openingElement, elementId)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (matches.length === 0) {
    throw new ValidationError(`Design element not found: ${elementId}`);
  }
  if (matches.length > 1) {
    throw new ValidationError(`Design element id is not unique: ${elementId}`);
  }

  const children = matches[0]!.children.filter(
    (child) => !(ts.isJsxText(child) && child.getFullText(sourceFile).trim() === ""),
  );
  if (children.length !== 1) {
    throw new ValidationError(
      "This element has dynamic or nested content and cannot be edited manually",
    );
  }

  const child = children[0]!;
  if (ts.isJsxText(child)) {
    const fullText = child.getFullText(sourceFile);
    const leadingWhitespace = fullText.match(/^\s*/u)?.[0] ?? "";
    const trailingWhitespace = fullText.match(/\s*$/u)?.[0] ?? "";
    return {
      text: unescapeJsxText(fullText.trim()),
      start: child.getFullStart(),
      end: child.getEnd(),
      replacement: (nextText) =>
        `${leadingWhitespace}${escapeJsxText(nextText)}${trailingWhitespace}`,
    };
  }

  if (
    ts.isJsxExpression(child) &&
    child.expression &&
    (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression))
  ) {
    return {
      text: child.expression.text,
      start: child.getStart(sourceFile),
      end: child.getEnd(),
      replacement: (nextText) => `{${JSON.stringify(nextText)}}`,
    };
  }

  throw new ValidationError(
    "This element has dynamic or nested content and cannot be edited manually",
  );
}

function hasTraceId(element: ts.JsxOpeningLikeElement, elementId: string): boolean {
  return element.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      ts.isIdentifier(attribute.name) &&
      attribute.name.text === "data-trace-id" &&
      attribute.initializer !== undefined &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === elementId,
  );
}

function normalizeTextValue(value: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) throw new ValidationError("Text cannot be empty");
  if (normalized.includes("\n")) {
    throw new ValidationError("Multiline text editing is not supported yet");
  }
  if (normalized.length > 2_000) {
    throw new ValidationError("Text must be 2,000 characters or fewer");
  }
  return normalized;
}

function escapeJsxText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\{/gu, "&#123;")
    .replace(/\}/gu, "&#125;");
}

function unescapeJsxText(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#123;/gu, "{")
    .replace(/&#125;/gu, "}")
    .replace(/&amp;/gu, "&");
}
