import { useEffect, useRef, useState } from 'react';
import type { DiffRuntime, ParsedDiffFile, ParsedHunk } from '../types';
import { loadDiffRuntime } from '../utils';
import { useWorktreeChanges } from '../hooks/useWorktreeChanges';
import { usePanelLayoutStore } from '../stores/panelLayoutStore';
import { useDiffSyntaxTokens } from '../utils/shikiDiffTokens';

const MAX_FILES_SHOWN = 20;

function countDiffFiles(diffText: string | undefined): number {
  if (!diffText?.trim()) return 0;
  return (diffText.match(/^diff --git /gm) || []).length;
}

function fileStatusBadge(type: string | undefined) {
  switch (type) {
    case 'add':
      return <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-green-500/15 text-green-400">New</span>;
    case 'delete':
      return <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-red-500/15 text-red-400">Deleted</span>;
    case 'rename':
      return <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-blue-500/15 text-blue-400">Renamed</span>;
    case 'modify':
      return <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-yellow-500/15 text-yellow-400">Modified</span>;
    default:
      return null;
  }
}

interface WorktreeChangesProps {
  workspaceId: string | null;
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

export function WorktreeChanges({ workspaceId, baseBranch = 'main' }: WorktreeChangesProps) {
  const { diffData, loading, refresh } = useWorktreeChanges(workspaceId, baseBranch);
  const [runtime, setRuntime] = useState<DiffRuntime | null>(null);
  const [activeTab, setActiveTab] = useState<DiffTab>('working');
  const focusedFilePath = usePanelLayoutStore((s) => s.focusedFilePath);

  useEffect(() => {
    let cancelled = false;
    void loadDiffRuntime().then((loaded) => {
      if (!cancelled) setRuntime(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  // When a file is focused from the agent view, refresh the diff data
  useEffect(() => {
    if (focusedFilePath) {
      void refresh();
    }
  }, [focusedFilePath, refresh]);

  const hasBranchDiff = Boolean(diffData?.branchDiff?.trim());
  const hasUncommitted = Boolean(diffData?.uncommittedDiff?.trim() || diffData?.stagedDiff?.trim());

  const activeFileCount = activeTab === 'branch'
    ? countDiffFiles(diffData?.branchDiff)
    : countDiffFiles(diffData?.uncommittedDiff) + countDiffFiles(diffData?.stagedDiff);

  return (
    <div className="edit-diff-view flex h-full w-full flex-col overflow-hidden">
      <ChangesHeader loading={loading} onRefresh={refresh} fileCount={activeFileCount} />
      <div className="flex items-center gap-1 border-b border-edge px-3 py-1">
        <button
          type="button"
          onClick={() => setActiveTab('working')}
          className={`cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            activeTab === 'working'
              ? 'bg-surface-elevated text-primary'
              : 'text-muted hover:text-primary'
          }`}
        >
          Working / Staged
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('branch')}
          className={`cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            activeTab === 'branch'
              ? 'bg-surface-elevated text-primary'
              : 'text-muted hover:text-primary'
          }`}
        >
          vs {baseBranch}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!diffData && !loading && (
          <p className="text-xs text-muted">No diff data available.</p>
        )}

        {activeTab === 'branch' && (
          <>
            {hasBranchDiff ? (
              <DiffSection title={`Changes vs ${baseBranch}`} diffText={diffData!.branchDiff!} runtime={runtime} focusedFilePath={focusedFilePath} />
            ) : (
              diffData && !loading && (
                <p className="text-xs text-muted">No changes compared to {baseBranch}.</p>
              )
            )}
          </>
        )}

        {activeTab === 'working' && (
          <>
            {hasUncommitted ? (
              <>
                {diffData?.stagedDiff?.trim() && (
                  <DiffSection title="Staged changes" diffText={diffData.stagedDiff} runtime={runtime} focusedFilePath={focusedFilePath} />
                )}
                {diffData?.uncommittedDiff?.trim() && (
                  <DiffSection title="Uncommitted changes" diffText={diffData.uncommittedDiff} runtime={runtime} focusedFilePath={focusedFilePath} />
                )}
              </>
            ) : (
              diffData && !loading && (
                <p className="text-xs text-muted">No uncommitted or staged changes.</p>
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
  fileCount,
}: {
  loading: boolean;
  onRefresh: () => void;
  fileCount: number;
}) {

  return (
    <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-muted">File Changes</h4>
        {fileCount > 0 && (
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void onRefresh()}
        disabled={loading}
        className="cursor-pointer text-[10px] text-muted transition-colors hover:text-primary disabled:opacity-40"
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
  focusedFilePath,
}: {
  title: string;
  diffText: string;
  runtime: DiffRuntime | null;
  focusedFilePath: string | null;
}) {
  if (!runtime) {
    return (
      <div className="mb-3">
        <h5 className="mb-1 text-[11px] font-semibold text-primary">{title}</h5>
        <pre className="overflow-x-auto rounded bg-surface p-2 text-[11px] text-primary">
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
        <h5 className="mb-1 text-[11px] font-semibold text-primary">{title}</h5>
        <pre className="overflow-x-auto rounded bg-surface p-2 text-[11px] text-primary">
          {diffText.slice(0, 5000)}
        </pre>
      </div>
    );
  }

  const totalFiles = files.length;
  const visibleFiles = files.slice(0, MAX_FILES_SHOWN);

  return (
    <div className="mb-3">
      <h5 className="mb-1 text-[11px] font-semibold text-primary">
        {title}{totalFiles > 0 && <span className="ml-1 font-normal text-muted">({totalFiles} file{totalFiles !== 1 ? 's' : ''})</span>}
      </h5>
      <div className="rounded-md border border-edge-hover overflow-hidden">
        {visibleFiles.map((file, i) => (
            <DiffFileAccordion
              key={`${file.newPath ?? file.oldPath ?? i}`}
              file={file}
              runtime={runtime}
              isLast={i === visibleFiles.length - 1}
              focusedFilePath={focusedFilePath}
            />
        ))}
      </div>
      {totalFiles > MAX_FILES_SHOWN && (
        <p className="mt-1 text-[10px] text-muted">
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
  focusedFilePath,
}: {
  file: ParsedDiffFile;
  runtime: DiffRuntime;
  isLast: boolean;
  focusedFilePath: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const accordionRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
  const displayPath = (file?.newPath && file.newPath !== '/dev/null' ? file.newPath : null)
    || (file?.oldPath && file.oldPath !== '/dev/null' ? file.oldPath : null)
    || 'file.txt';
  const fileName = displayPath.split('/').pop() ?? displayPath;
  const dirPath = displayPath.includes('/') ? displayPath.slice(0, displayPath.lastIndexOf('/') + 1) : '';
  const { additions, deletions } = countChanges(hunks);
  const { Diff, Hunk } = runtime;
  const { tokens, renderToken } = useDiffSyntaxTokens(hunks, displayPath, runtime, expanded);

  // Auto-expand and scroll when this file is focused
  const isFocused = Boolean(
    focusedFilePath &&
    (displayPath === focusedFilePath || displayPath.endsWith(`/${focusedFilePath}`) || focusedFilePath.endsWith(`/${displayPath}`)),
  );

  useEffect(() => {
    if (isFocused) {
      setExpanded(true);
      // Scroll into view after a brief delay to allow expansion
      requestAnimationFrame(() => {
        accordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      usePanelLayoutStore.getState().clearFocusedFile();
    }
  }, [isFocused]);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, hunks, tokens]);

  return (
    <div ref={accordionRef} className={!isLast ? 'border-b border-edge-hover' : ''}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface"
      >
        <span
          className="text-[10px] text-muted transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px]">
          <span className="text-muted">{dirPath}</span>
          <span className="text-primary">{fileName}</span>
        </span>
        {fileStatusBadge(file?.type)}
        <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
          {additions > 0 && <span className="text-green-400">+{additions}</span>}
          {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? contentHeight : 0 }}
      >
        <div ref={contentRef} className="edit-diff-body-fullscreen bg-surface-deep">
          {hunks.length > 0 ? (
            <Diff viewType="unified" diffType={file?.type ?? 'modify'} hunks={hunks} tokens={tokens} renderToken={renderToken}>
              {(renderedHunks: ParsedHunk[]) =>
                renderedHunks.map((hunk, idx) => (
                  <Hunk key={hunk?.content ?? idx} hunk={hunk} />
                ))
              }
            </Diff>
          ) : (
            <p className="px-3 py-2 text-[11px] text-muted">
              {file?.type === 'rename' ? `Renamed from ${file.oldPath ?? 'unknown'}` :
               file?.type === 'add' ? 'Empty file' :
               'No content changes'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
