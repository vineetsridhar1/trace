import type { FileOpenRequest } from "../session/FileOpenContext";

function stripLineSuffix(href: string): FileOpenRequest {
  const lineMatch = /^(.+):(\d+)(?::\d+)?$/.exec(href);
  if (!lineMatch) return { filePath: href };
  const [, filePath, lineNumber] = lineMatch;
  if (!filePath || !lineNumber) return { filePath: href };
  const parsedLineNumber = Number(lineNumber);
  if (parsedLineNumber < 1) return { filePath: href };
  return { filePath, lineNumber: parsedLineNumber };
}

function normalizeFilePath(filePath: string): string {
  return filePath.startsWith("./") ? filePath.slice(2) : filePath;
}

export function fileOpenRequestFromHref(href: string): FileOpenRequest | null {
  if (!href || href.startsWith("#")) return null;

  const request = stripLineSuffix(href);
  const filePath = normalizeFilePath(request.filePath);

  if (/^[a-z][a-z0-9+.-]*:/i.test(filePath)) return null;
  if (!filePath.includes("/") && !filePath.includes(".")) return null;

  if (!request.lineNumber) return { filePath };
  return { filePath, lineNumber: request.lineNumber };
}
