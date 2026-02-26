import { memo, useState } from 'react';
import type { ServerEvent } from '../../types';
import { getServerUrl } from '../../types';
import { extractPromptText, extractAttachments, stripTraceInternal } from '../../utils';
import { ImageLightbox } from '../ImageLightbox';
import { ExpandableText } from './ExpandableText';

export const UserPromptBubble = memo(function UserPromptBubble({
  event,
  time,
}: {
  event: ServerEvent;
  time: string;
}) {
  const rawPrompt =
    extractPromptText(event.rawPayload) ?? event.lastAssistantMessage ?? '(prompt)';
  const prompt = stripTraceInternal(rawPrompt);
  const attachments = extractAttachments(event.rawPayload);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <>
      <div className="thread-bubble flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm border border-violet-500/40 bg-violet-500/15 px-3 py-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-violet-300">You</span>
            <span className="text-xs text-[#565f89]">{time}</span>
          </div>
          <ExpandableText text={prompt} lineClamp={4} />
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setLightboxSrc(`${getServerUrl()}/attachments/file/${a.key}`)}
                  className="h-16 w-16 overflow-hidden rounded-md border border-violet-500/30 transition-colors hover:border-violet-500/60"
                >
                  <img
                    src={`${getServerUrl()}/attachments/file/${a.key}`}
                    alt={a.filename}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Attached image" onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
});
