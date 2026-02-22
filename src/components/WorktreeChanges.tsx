import { useEffect, useState } from 'react';
import type { DiffRuntime, ParsedDiffFile, ParsedHunk } from '../types';
import { loadDiffRuntime } from '../utils';
import { useWorktreeChanges } from '../hooks/useWorktreeChanges';

const MAX_FILES_SHOWN = 20;

interface WorktreeChangesProps {
  messageId: string | null;
}

export function WorktreeChanges({ messageId }: WorktreeChangesProps) {
  const { diffData, loading, refresh } = useWorktreeChanges(messageId);
  const [runtime, setRuntime] = useState<DiffRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDiffRuntime().then((loaded) => {
      if (!cancelled) setRuntime(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  const hasBranchDiff = Boolean(diffData?.branchDiff?.trim());
  const hasUncommitted = Boolean(diffData?.uncommittedDiff?.trim() || diffData?.stagedDiff?.trim());

  return (
    <div className="edit-diff-view flex h-full flex-col overflow-hidden">
      <ChangesHeader loading={loading} onRefresh={refresh} statusText={diffData?.status} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!diffData && !loading && (
          <p className="text-xs text-[#565f89]">No diff data available.</p>
        )}

        {hasBranchDiff && (
          <DiffSection title="Changes vs main" diffText={diffData!.branchDiff!} runtime={runtime} />
        )}

        {hasUncommitted && (
          <>
            {diffData?.stagedDiff?.trim() && (
              <DiffSection title="Staged changes" diffText={diffData.stagedDiff} runtime={runtime} />
            )}
            {diffData?.uncommittedDiff?.trim() && (
              <DiffSection title="Uncommitted changes" diffText={diffData.uncommittedDiff} runtime={runtime} />
            )}
          </>
        )}

        {diffData && !hasBranchDiff && !hasUncommitted && !loading && (
          <p className="text-xs text-[#565f89]">No changes detected.</p>
        )}
      </div>
    </div>
  );
}

function ChangesHeader({
  loading,
  onRefresh,
  statusText,
}: {
  loading: boolean;
  onRefresh: () => void;
  statusText?: string;
}) {
  const fileCount = statusText
    ? statusText.trim().split('\n').filter(Boolean).length
    : 0;

  return (
    <div className="flex items-center justify-between border-b border-[#292e42] px-3 py-1.5">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-[#565f89]">File Changes</h4>
        {fileCount > 0 && (
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[10px] text-[#565f89]">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void onRefresh()}
        disabled={loading}
        className="cursor-pointer text-[10px] text-[#565f89] transition-colors hover:text-[#c0caf5] disabled:opacity-40"
      >
        {loading ? 'Loading...' : 'Refresh'}
      </button>
    </div>
  );
}

function DiffSection({
  title,
  diffText,
  runtime,
}: {
  title: string;
  diffText: string;
  runtime: DiffRuntime | null;
}) {
  if (!runtime) {
    return (
      <div className="mb-3">
        <h5 className="mb-1 text-[11px] font-semibold text-[#a9b1d6]">{title}</h5>
        <pre className="overflow-x-auto rounded bg-[#1a1b26] p-2 text-[11px] text-[#c0caf5]">
          {diffText.slice(0, 5000)}
        </pre>
      </div>
    );
  }

  let files: ParsedDiffFile[] = [];
  try {
    files = runtime.parseDiff(diffText);
  } catch {
    return (
      <div className="mb-3">
        <h5 className="mb-1 text-[11px] font-semibold text-[#a9b1d6]">{title}</h5>
        <pre className="overflow-x-auto rounded bg-[#1a1b26] p-2 text-[11px] text-[#c0caf5]">
          {diffText.slice(0, 5000)}
        </pre>
      </div>
    );
  }

  const totalFiles = files.length;
  const visibleFiles = files.slice(0, MAX_FILES_SHOWN);

  return (
    <div className="mb-3">
      <h5 className="mb-1 text-[11px] font-semibold text-[#a9b1d6]">{title}</h5>
      {visibleFiles.map((file, i) => (
        <DiffFile key={`${file.newPath ?? file.oldPath ?? i}`} file={file} runtime={runtime} />
      ))}
      {totalFiles > MAX_FILES_SHOWN && (
        <p className="mt-1 text-[10px] text-[#565f89]">
          Showing {MAX_FILES_SHOWN} of {totalFiles} files
        </p>
      )}
    </div>
  );
}

function DiffFile({ file, runtime }: { file: ParsedDiffFile; runtime: DiffRuntime }) {
  const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
  if (hunks.length === 0) return null;

  const displayPath = file?.newPath || file?.oldPath || 'file.txt';
  const { Diff, Hunk } = runtime;

  return (
    <div className="edit-diff-file mb-2 overflow-hidden rounded-md border border-[#3b3f5c]">
      <div className="border-b border-[#3b3f5c] bg-[#1a1b26] px-2 py-1 text-[11px] font-semibold text-[#a9b1d6]">
        {displayPath}
      </div>
      <div className="edit-diff-body bg-[#16161e]">
        <Diff viewType="unified" diffType={file?.type ?? 'modify'} hunks={hunks}>
          {(renderedHunks: ParsedHunk[]) =>
            renderedHunks.map((hunk, idx) => (
              <Hunk key={hunk?.content ?? idx} hunk={hunk} />
            ))
          }
        </Diff>
      </div>
    </div>
  );
}
