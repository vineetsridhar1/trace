interface GuideReference {
  filePath: string;
  startLine: number;
  endLine: number;
}
export interface GuideChapterData {
  id: string;
  title: string;
  explanation: string;
  implications: string;
  references: GuideReference[];
}

export function GuideChapter({
  chapter,
  onReference,
}: {
  chapter: GuideChapterData;
  onReference(reference: GuideReference): void;
}) {
  return (
    <article className="rounded-xl border border-border bg-surface-deep p-4">
      <h3 className="text-sm font-semibold">{chapter.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {chapter.explanation}
      </p>
      <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider">Implications</h4>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {chapter.implications}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {chapter.references.map((reference) => (
          <button
            key={`${reference.filePath}:${reference.startLine}`}
            type="button"
            onClick={() => onReference(reference)}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] hover:bg-muted"
          >
            {reference.filePath}:{reference.startLine}
            {reference.endLine !== reference.startLine ? `–${reference.endLine}` : ""}
          </button>
        ))}
      </div>
    </article>
  );
}
