import { useEffect, useRef } from "react";
import { FiFile } from "react-icons/fi";
import type { FileItem } from "../hooks/useFileMention";

interface WebFileMentionMenuProps {
  isOpen: boolean;
  files: FileItem[];
  selectedIndex: number;
  onSelect: (file: FileItem) => void;
}

export function WebFileMentionMenu({
  isOpen,
  files,
  selectedIndex,
  onSelect,
}: WebFileMentionMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  if (files.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-edge bg-surface-elevated py-1 shadow-lg">
        <div className="px-3 py-2 text-sm text-muted">No files found</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-lg border border-edge bg-surface-elevated py-1 shadow-lg">
      {files.map((file, i) => (
        <button
          key={file.path}
          ref={i === selectedIndex ? selectedRef : null}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(file);
          }}
          className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
            i === selectedIndex
              ? "bg-accent/20 text-primary"
              : "text-primary hover:bg-surface-elevated"
          }`}
        >
          <FiFile className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
          <span
            className={`truncate ${i === selectedIndex ? "text-primary" : "text-muted"}`}
          >
            {file.path}
          </span>
        </button>
      ))}
    </div>
  );
}
