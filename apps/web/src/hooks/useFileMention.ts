import { useState, useMemo, useCallback, useEffect } from "react";
import { useRepoRelay } from "./relay/useRepoRelay";

export interface FileItem {
  path: string;
}

function fuzzyScore(target: string, query: string): number {
  const lower = target.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  let qi = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < lower.length && qi < q.length; ti++) {
    if (lower[ti] === q[qi]) {
      if (ti === lastMatchIndex + 1) score += 5;
      if (
        ti === 0 ||
        lower[ti - 1] === "/" ||
        lower[ti - 1] === "." ||
        lower[ti - 1] === "-" ||
        lower[ti - 1] === "_"
      ) {
        score += 10;
      }
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1;
  score -= target.length * 0.1;
  return score;
}

function extractMentionQuery(
  text: string,
  cursorPos: number,
): { query: string; atPos: number } | null {
  if (cursorPos <= 0 || cursorPos > text.length) return null;

  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t") return null;
    if (ch === "@") {
      if (
        i > 0 &&
        text[i - 1] !== " " &&
        text[i - 1] !== "\n" &&
        text[i - 1] !== "\t"
      ) {
        return null;
      }
      return { query: text.slice(i + 1, cursorPos), atPos: i };
    }
  }

  return null;
}

const MAX_CACHE_ENTRIES = 20;
const fileCache = new Map<string, FileItem[]>();

const MAX_RESULTS = 20;

export function useFileMention(
  inputValue: string,
  onInputChange: (value: string) => void,
  repoPath: string,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const { listRepoFiles } = useRepoRelay();

  useEffect(() => {
    if (!repoPath) {
      setFiles([]);
      return;
    }

    const cached = fileCache.get(repoPath);
    if (cached) {
      setFiles(cached);
      return;
    }

    let stale = false;
    listRepoFiles({ repoPath }).then((result) => {
      if (stale) return;
      const items =
        result.success && result.data?.files
          ? result.data.files.map((p: string) => ({ path: p }))
          : [];
      if (fileCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = fileCache.keys().next().value!;
        fileCache.delete(oldest);
      }
      fileCache.set(repoPath, items);
      setFiles(items);
    });
    return () => {
      stale = true;
    };
  }, [repoPath, listRepoFiles]);

  const mention = useMemo(
    () => extractMentionQuery(inputValue, cursorPos),
    [inputValue, cursorPos],
  );

  const mentionQuery = mention?.query ?? null;

  const filteredFiles = useMemo(() => {
    if (mentionQuery === null) return [];
    if (mentionQuery === "") return files.slice(0, MAX_RESULTS);

    return files
      .map((file) => ({ file, score: fuzzyScore(file.path, mentionQuery) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((item) => item.file);
  }, [files, mentionQuery]);

  const isOpen =
    mention !== null &&
    !dismissed &&
    (filteredFiles.length > 0 || mention.query.length > 0);

  useEffect(() => {
    setDismissed(false);
  }, [inputValue, cursorPos]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [inputValue, cursorPos]);

  const handleSelect = useCallback(() => {
    const pos = textareaRef.current?.selectionStart ?? 0;
    setCursorPos(pos);
  }, [textareaRef]);

  const filePathSet = useMemo(
    () => new Set(files.map((f) => f.path)),
    [files],
  );

  const selectFile = useCallback(
    (file: FileItem) => {
      if (!mention) return;
      const { atPos } = mention;
      const before = inputValue.slice(0, atPos);
      const after = inputValue.slice(cursorPos);
      const insertion = `@${file.path} `;
      const newValue = before + insertion + after;
      const newCursorPos = atPos + insertion.length;

      onInputChange(newValue);
      setCursorPos(newCursorPos);

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.selectionStart = newCursorPos;
          el.selectionEnd = newCursorPos;
        }
      });
    },
    [inputValue, cursorPos, mention, onInputChange, textareaRef],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          setSelectedIndex((i) => (i + 1) % filteredFiles.length);
        }
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          setSelectedIndex(
            (i) => (i - 1 + filteredFiles.length) % filteredFiles.length,
          );
        }
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          selectFile(filteredFiles[selectedIndex]);
        }
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return true;
      }
      return false;
    },
    [isOpen, filteredFiles, selectedIndex, selectFile],
  );

  const getMentionedFiles = useCallback(() => {
    const mentions: string[] = [];
    const regex = /@(\S+)/g;
    let match;
    while ((match = regex.exec(inputValue)) !== null) {
      if (filePathSet.has(match[1])) {
        mentions.push(match[1]);
      }
    }
    return [...new Set(mentions)];
  }, [inputValue, filePathSet]);

  return {
    isOpen,
    filteredFiles,
    selectedIndex,
    handleKeyDown,
    handleSelect,
    selectFile,
    getMentionedFiles,
  };
}
