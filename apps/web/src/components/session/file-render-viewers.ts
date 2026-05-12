import type { ComponentType } from "react";
import { MarkdownFileViewer } from "./MarkdownFileViewer";

export type FileViewMode = "raw" | "rendered";

export interface FileRenderViewerProps {
  content: string;
  filePath: string;
}

export interface FileRenderViewerDefinition {
  id: string;
  label: string;
  defaultMode: FileViewMode;
  Component: ComponentType<FileRenderViewerProps>;
}

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mdx", "mkd", "mkdn"]);

function getFileExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function getFileRenderViewer(filePath: string): FileRenderViewerDefinition | null {
  const extension = getFileExtension(filePath);

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return {
      id: "markdown",
      label: "Markdown",
      defaultMode: "rendered",
      Component: MarkdownFileViewer,
    };
  }

  return null;
}
