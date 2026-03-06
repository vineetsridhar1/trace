import { memo, useCallback } from 'react';
import type { ServerEvent } from '../../types';
import { findStringByKeys, toRelativeDisplayPath } from '../../utils';
import { usePanelLayoutStore } from '../../stores/panelLayoutStore';
import { SyntaxHighlightedCode } from '../SyntaxHighlight';

export const WriteCodePreview = memo(function WriteCodePreview({
  event,
}: {
  event: ServerEvent;
}) {
  const content = findStringByKeys(event.toolInput, ['content', 'text', 'new_source']) ?? null;
  const rawPath = findStringByKeys(event.toolInput, ['file_path', 'path', 'filepath']) ?? null;
  const displayPath = rawPath ? toRelativeDisplayPath(rawPath) : 'file';

  const handleFileClick = useCallback(() => {
    if (displayPath && displayPath !== 'file') {
      usePanelLayoutStore.getState().navigateToFile(displayPath);
    }
  }, [displayPath]);

  if (!content) return null;

  const truncated = content.length > 5000 ? `${content.slice(0, 5000)}...` : content;

  const isClickable = displayPath !== 'file';

  return (
    <div className="mt-2">
      <div className="edit-diff-meta mb-1 text-[11px] font-semibold text-primary">
        Write &middot; {displayPath}
      </div>
      <div className="overflow-hidden rounded-md border border-edge-hover">
        <button
          type="button"
          onClick={handleFileClick}
          className={`w-full border-b border-edge-hover bg-surface px-2 py-1 text-left text-[11px] font-semibold text-primary ${
            isClickable ? 'cursor-pointer hover:text-accent-light hover:bg-surface-elevated transition-colors' : ''
          }`}
        >
          {displayPath}
        </button>
        <div className="bg-surface-deep">
          <SyntaxHighlightedCode code={truncated} filePath={rawPath} />
        </div>
      </div>
    </div>
  );
});
