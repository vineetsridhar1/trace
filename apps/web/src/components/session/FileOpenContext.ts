import { createContext, useContext } from "react";

export interface FileOpenRequest {
  filePath: string;
  lineNumber?: number;
}

export type FileOpenHandler = (request: string | FileOpenRequest) => void;

/**
 * Provides a callback to open a file in the session group's Monaco editor.
 * When set, file-path links in Markdown output will open in the editor
 * instead of navigating the browser.
 */
export const FileOpenContext = createContext<FileOpenHandler | null>(null);

export function useFileOpen(): FileOpenHandler | null {
  return useContext(FileOpenContext);
}
