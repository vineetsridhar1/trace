import { memo } from 'react';
import type { ServerEvent } from '../../types';
import { findStringByKeys, toRelativeDisplayPath } from '../../utils';
import { SyntaxHighlightedCode } from '../SyntaxHighlight';

export const WriteCodePreview = memo(function WriteCodePreview({
  event,
}: {
  event: ServerEvent;
}) {
  const content = findStringByKeys(event.toolInput, ['content', 'text', 'new_source']) ?? null;
  const rawPath = findStringByKeys(event.toolInput, ['file_path', 'path', 'filepath']) ?? null;
  const displayPath = rawPath ? toRelativeDisplayPath(rawPath) : 'file';

  if (!content) return null;

  const truncated = content.length > 5000 ? `${content.slice(0, 5000)}...` : content;

  return (
    <div className="mt-2">
      <div className="edit-diff-meta mb-1 text-[11px] font-semibold text-primary">
        Write &middot; {displayPath}
      </div>
      <div className="overflow-hidden rounded-md border border-edge-hover">
        <div className="border-b border-edge-hover bg-surface px-2 py-1 text-[11px] font-semibold text-primary">
          {displayPath}
        </div>
        <div className="bg-surface-deep">
          <SyntaxHighlightedCode code={truncated} filePath={rawPath} />
        </div>
      </div>
    </div>
  );
});
