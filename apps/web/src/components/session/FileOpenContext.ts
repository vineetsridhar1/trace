import { createContext, useContext } from "react";

/**
 * Provides a callback to open a file in the session group's Monaco editor.
 * When set, file-path links in Markdown output will open in the editor
 * instead of navigating the browser.
 */
export const FileOpenContext = createContext<((filePath: string) => void) | null>(null);

export function useFileOpen(): ((filePath: string) => void) | null {
  return useContext(FileOpenContext);
}
