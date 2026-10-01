import { Markdown } from "../ui/Markdown";

export function ReviewOverview({
  title,
  description,
  pullRequestNumber,
}: {
  title: string;
  description: string;
  pullRequestNumber: number;
}) {
  return (
    <section className="shrink-0 border-b border-[#26262a] px-3 pb-6 pt-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Pull request #{pullRequestNumber}
      </span>
      <h1 className="mb-0 mt-2 text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] text-[#ededef]">
        {title}
      </h1>
      {description.trim() ? (
        <div className="mt-4 max-w-4xl text-sm leading-6 text-[#bdbdc4]">
          <Markdown>{description}</Markdown>
        </div>
      ) : (
        <p className="mb-0 mt-3 text-sm text-muted-foreground">No description provided.</p>
      )}
    </section>
  );
}
