import { useCallback, useState } from "react";
import { useUIStore } from "../../stores/ui";
import type { OpenFileTab } from "./GroupTabStrip";

export function useFileActions() {
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleFileClick = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        if (prev.some((f) => f.filePath === filePath)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath, fileName }];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleDiffFileClick = useCallback(
    (filePath: string, status: string) => {
      const diffKey = `diff:${filePath}`;
      setOpenFiles((prev) => {
        if (prev.some((f) => f.filePath === diffKey)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath: diffKey, fileName, isDiff: true, diffStatus: status }];
      });
      setActiveFilePath(diffKey);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.filePath !== filePath));
    setActiveFilePath((prev) => (prev === filePath ? null : prev));
  }, []);

  return {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    handleFileClick,
    handleDiffFileClick,
    handleSelectFile,
    handleCloseFile,
  };
}
