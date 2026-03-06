import { memo } from 'react';
import { ExpandableText } from './ExpandableText';

export const AssistantTextRow = memo(function AssistantTextRow({
  text,
}: {
  text: string;
}) {
  return (
    <div className="px-1 py-1.5 text-[13px] leading-relaxed text-primary">
      <ExpandableText text={text} lineClamp={6} />
    </div>
  );
});
