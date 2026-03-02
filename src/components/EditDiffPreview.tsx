import { useEffect, useMemo, useState } from 'react';
import type { ServerEvent, DiffRuntime, ParsedDiffFile, ParsedHunk } from '../types';
import { extractEditDiffContent, loadDiffRuntime } from '../utils';
import { useDiffSyntaxTokens } from '../utils/shikiDiffTokens';

function DiffFallback({ title, text }: { title: string; text: string }) {
  return (
    <div className="edit-diff-view mt-2 space-y-2">
      <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{title}</div>
      <pre>{text}</pre>
    </div>
  );
}

function DiffFileView({
  file,
  fileIndex,
  fallbackPath,
  runtime,
}: {
  file: ParsedDiffFile;
  fileIndex: number;
  fallbackPath: string | null;
  runtime: DiffRuntime;
}) {
  const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
  const displayPath =
    (typeof file?.newPath === 'string' && file.newPath) ||
    (typeof file?.oldPath === 'string' && file.oldPath) ||
    fallbackPath ||
    'file.txt';

  const { tokens, renderToken } = useDiffSyntaxTokens(hunks, displayPath, runtime);

  const DiffComponent = runtime.Diff;
  const HunkComponent = runtime.Hunk;

  return (
    <div key={`${displayPath}-${fileIndex}`} className="edit-diff-file overflow-hidden rounded-md border border-[#3b3f5c]">
      <div className="edit-diff-file-header border-b border-[#3b3f5c] bg-[#1a1b26] px-2 py-1 text-[11px] font-semibold text-[#a9b1d6]">
        {displayPath}
      </div>
      <div className="edit-diff-body bg-[#16161e]">
        <DiffComponent
          viewType="unified"
          diffType={file?.type ?? 'modify'}
          hunks={hunks}
          tokens={tokens}
          renderToken={renderToken}
        >
          {(renderedHunks: ParsedHunk[]) =>
            renderedHunks.map((hunk, hunkIndex) => (
              <HunkComponent key={`${displayPath}-${hunk?.content ?? hunkIndex}`} hunk={hunk} />
            ))
          }
        </DiffComponent>
      </div>
    </div>
  );
}

export function EditDiffPreview({ event }: { event: ServerEvent }) {
  const [runtime, setRuntime] = useState<DiffRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDiffRuntime().then((loaded) => {
      if (!cancelled) setRuntime(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  const diffContent = useMemo(() => extractEditDiffContent(event), [event]);

  if (!diffContent.diffText) {
    return <DiffFallback title={diffContent.title} text={diffContent.fallbackText} />;
  }

  if (!runtime) {
    return <DiffFallback title={diffContent.title} text={diffContent.diffText.slice(0, 3000)} />;
  }

  let files: ParsedDiffFile[] = [];
  try {
    files = runtime.parseDiff(diffContent.diffText);
  } catch {
    return <DiffFallback title={diffContent.title} text={diffContent.fallbackText} />;
  }

  if (!Array.isArray(files) || files.length === 0) {
    return <DiffFallback title={diffContent.title} text={diffContent.fallbackText} />;
  }

  return (
    <div className="edit-diff-view mt-2 space-y-2">
      <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
      {files.slice(0, 5).map((file, fileIndex) => {
        const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
        if (hunks.length === 0) return null;

        const displayPath =
          (typeof file?.newPath === 'string' && file.newPath) ||
          (typeof file?.oldPath === 'string' && file.oldPath) ||
          diffContent.filePath ||
          'file.txt';

        return (
          <DiffFileView
            key={`${displayPath}-${fileIndex}`}
            file={file}
            fileIndex={fileIndex}
            fallbackPath={diffContent.filePath}
            runtime={runtime}
          />
        );
      })}
    </div>
  );
}
