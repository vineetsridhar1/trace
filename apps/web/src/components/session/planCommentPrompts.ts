import type { MarkdownSteerComment } from "../ui/markdownSteering";

export function getCommentGroupIndex(comments: MarkdownSteerComment[]): number {
  const [index] = comments[0]?.id.split("-") ?? [];
  const parsed = Number(index);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCommentGroups(commentGroups: MarkdownSteerComment[][]): string {
  return commentGroups
    .map((comments, index) => {
      const referencedBlock = comments[0]?.markdown.trim() || "(Referenced plan block unavailable)";
      const blockType = comments[0]?.type ?? "plan block";
      const commentText = comments
        .map((comment, commentIndex) => `${commentIndex + 1}. ${comment.text}`)
        .join("\n");

      return `Comment group ${index + 1} (${blockType})

These comments refer to this exact plan block:
\`\`\`\`markdown
${referencedBlock}
\`\`\`\`

Comments for this block:
${commentText}`;
    })
    .join("\n\n---\n\n");
}

export function buildCommentPrompt(commentGroups: MarkdownSteerComment[][], note: string): string {
  const noteText = note ? `\n\nOverall note:\n${note}` : "";

  return `Please revise the plan using these inline comments. Apply them together, keep the rest of the plan coherent, and do not start implementation yet.\n\n${formatCommentGroups(commentGroups)}${noteText}`;
}

export function buildApproveWithCommentsPrompt({
  planContent,
  commentGroups,
  note,
}: {
  planContent?: string;
  commentGroups: MarkdownSteerComment[][];
  note: string;
}): string {
  const planText = planContent ? `\n\nPlan:\n${planContent}` : "";
  const noteText = note ? `\n\nOverall note:\n${note}` : "";

  return `Approved. Implement this plan, applying these inline comments as implementation guidance.${planText}\n\nInline comments:\n${formatCommentGroups(commentGroups)}${noteText}`;
}
