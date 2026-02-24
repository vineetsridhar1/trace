import { useEffect, useRef } from 'react';
import { FiFile } from 'react-icons/fi';
import type { FileItem } from '../hooks/useFileMention';

interface FileMentionMenuProps {
  isOpen: boolean;
  files: FileItem[];
  selectedIndex: number;
  onSelect: (file: FileItem) => void;
}

export function FileMentionMenu({ isOpen, files, selectedIndex, onSelect }: FileMentionMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  if (files.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-[#292e42] bg-[#1f2335] py-1 shadow-lg">
        <div className="px-3 py-2 text-sm text-[#565f89]">No files found</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-lg border border-[#292e42] bg-[#1f2335] py-1 shadow-lg">
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
            i === selectedIndex ? 'bg-violet-500/20 text-[#c0caf5]' : 'text-[#a9b1d6] hover:bg-[#292e42]'
          }`}
        >
          <FiFile className="h-3.5 w-3.5 flex-shrink-0 text-[#565f89]" />
          <span className={`truncate ${i === selectedIndex ? 'text-[#c0caf5]' : 'text-[#565f89]'}`}>{file.path}</span>
        </button>
      ))}
    </div>
  );
}
