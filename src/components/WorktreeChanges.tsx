import { useEffect, useRef, useState } from 'react';
import type { DiffRuntime, ParsedDiffFile, ParsedHunk } from '../types';
import { loadDiffRuntime } from '../utils';
import { useWorktreeChanges } from '../hooks/useWorktreeChanges';

const MAX_FILES_SHOWN = 20;

interface WorktreeChangesProps {
  messageId: string | null;
  baseBranch?: string;
}

function countChanges(hunks: ParsedHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    const changes = (hunk as Record<string, unknown>).changes as
      | Array<{ type?: string }>
      | undefined;
    if (Array.isArray(changes)) {
      for (const change of changes) {
        if (change.type === 'insert') additions++;
        else if (change.type === 'delete') deletions++;
      }
    }
  }
  return { additions, deletions };
}

type DiffTab = 'working' | 'branch';

export function WorktreeChanges({ messageId, baseBranch = 'main' }: WorktreeChangesProps) {
  const { diffData, loading, refresh } = useWorktreeChanges(messageId, baseBranch);
  const [runtime, setRuntime] = useState<DiffRuntime | null>(null);
  const [activeTab, setActiveTab] = useState<DiffTab>('working');

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
      <div className="flex items-center gap-1 border-b border-[#292e42] px-3 py-1">
        <button
          type="button"
          onClick={() => setActiveTab('working')}
          className={`cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            activeTab === 'working'
              ? 'bg-[#292e42] text-[#c0caf5]'
              : 'text-[#565f89] hover:text-[#a9b1d6]'
          }`}
        >
          Working / Staged
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('branch')}
          className={`cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            activeTab === 'branch'
              ? 'bg-[#292e42] text-[#c0caf5]'
              : 'text-[#565f89] hover:text-[#a9b1d6]'
          }`}
        >
          vs {baseBranch}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!diffData && !loading && (
          <p className="text-xs text-[#565f89]">No diff data available.</p>
        )}

        {activeTab === 'branch' && (
          <>
            {hasBranchDiff ? (
              <DiffSection title={`Changes vs ${baseBranch}`} diffText={diffData!.branchDiff!} runtime={runtime} />
            ) : (
              diffData && !loading && (
                <p className="text-xs text-[#565f89]">No changes vs {baseBranch}.</p>
              )
            )}
          </>
        )}

        {activeTab === 'working' && (
          <>
            {hasUncommitted ? (
              <>
                {diffData?.stagedDiff?.trim() && (
                  <DiffSection title="Staged changes" diffText={diffData.stagedDiff} runtime={runtime} />
                )}
                {diffData?.uncommittedDiff?.trim() && (
                  <DiffSection title="Uncommitted changes" diffText={diffData.uncommittedDiff} runtime={runtime} />
                )}
              </>
            ) : (
              diffData && !loading && (
                <p className="text-xs text-[#565f89]">No working or staged changes.</p>
              )
            )}
          </>
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
      <div className="rounded-md border border-[#3b3f5c] overflow-hidden">
        {visibleFiles.map((file, i) => {
          const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
          if (hunks.length === 0) return null;
          return (
            <DiffFileAccordion
              key={`${file.newPath ?? file.oldPath ?? i}`}
              file={file}
              runtime={runtime}
              isLast={i === visibleFiles.length - 1}
            />
          );
        })}
      </div>
      {totalFiles > MAX_FILES_SHOWN && (
        <p className="mt-1 text-[10px] text-[#565f89]">
          Showing {MAX_FILES_SHOWN} of {totalFiles} files
        </p>
      )}
    </div>
  );
}

function DiffFileAccordion({
  file,
  runtime,
  isLast,
}: {
  file: ParsedDiffFile;
  runtime: DiffRuntime;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
  const displayPath = file?.newPath || file?.oldPath || 'file.txt';
  const fileName = displayPath.split('/').pop() ?? displayPath;
  const dirPath = displayPath.includes('/') ? displayPath.slice(0, displayPath.lastIndexOf('/') + 1) : '';
  const { additions, deletions } = countChanges(hunks);
  const { Diff, Hunk } = runtime;

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, hunks]);

  return (
    <div className={!isLast ? 'border-b border-[#3b3f5c]' : ''}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[#1a1b26]"
      >
        <span
          className="text-[10px] text-[#565f89] transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px]">
          <span className="text-[#565f89]">{dirPath}</span>
          <span className="text-[#a9b1d6]">{fileName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
          {additions > 0 && <span className="text-[#9ece6a]">+{additions}</span>}
          {deletions > 0 && <span className="text-[#f7768e]">-{deletions}</span>}
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? contentHeight : 0 }}
      >
        <div ref={contentRef} className="edit-diff-body-fullscreen bg-[#16161e]">
          <Diff viewType="unified" diffType={file?.type ?? 'modify'} hunks={hunks}>
            {(renderedHunks: ParsedHunk[]) =>
              renderedHunks.map((hunk, idx) => (
                <Hunk key={hunk?.content ?? idx} hunk={hunk} />
              ))
            }
          </Diff>
        </div>
      </div>
    </div>
  );
}
