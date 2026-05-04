export type ProjectPlanTicketDraft = {
  title: string;
  description: string;
};

const MAX_TICKETS = 12;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4_000;

const TICKET_HEADING_PATTERN =
  /^\s*(?:#{1,6}\s*)?(?:ticket|task|milestone|phase)\s*(?:\d+|[a-z])?\s*[:.)-]\s+(.+)$/i;
const LIST_ITEM_PATTERN =
  /^\s*(?:[-*+]\s+(?:\[[ x]\]\s*)?|\d+[.)]\s+)(?:\*\*)?(.+?)(?:\*\*)?\s*$/i;

export function extractProjectPlanTicketDrafts(planContent: string): ProjectPlanTicketDraft[] {
  const lines = planContent.split(/\r?\n/);
  const candidates: string[] = [];
  let inTicketSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,6}\s+/.test(line)) {
      inTicketSection = /\b(ticket|tickets|task|tasks|implementation|milestone|phase)s?\b/i.test(
        line,
      );
    }

    const headingMatch = line.match(TICKET_HEADING_PATTERN);
    if (headingMatch?.[1]) {
      candidates.push(headingMatch[1]);
      continue;
    }

    if (!inTicketSection) continue;

    const listMatch = line.match(LIST_ITEM_PATTERN);
    if (listMatch?.[1]) {
      candidates.push(listMatch[1]);
    }
  }

  const uniqueTitles = new Set<string>();
  const tickets = candidates
    .map(cleanTicketTitle)
    .filter((title) => title.length > 0 && !isLowSignalTicketTitle(title))
    .filter((title) => {
      const key = title.toLowerCase();
      if (uniqueTitles.has(key)) return false;
      uniqueTitles.add(key);
      return true;
    })
    .slice(0, MAX_TICKETS)
    .map((title) => ({
      title,
      description: buildTicketDescription(title, planContent),
    }));

  if (tickets.length > 0) return tickets;

  return [
    {
      title: cleanTicketTitle(firstMeaningfulLine(planContent) ?? "Implement approved project plan"),
      description: truncateText(planContent.trim(), MAX_DESCRIPTION_LENGTH),
    },
  ];
}

function cleanTicketTitle(value: string): string {
  return value
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .replace(/^ticket\s*(?:\d+|[a-z])?\s*[:.)-]\s*/i, "")
    .replace(/^task\s*(?:\d+|[a-z])?\s*[:.)-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;,-]\s*$/, "")
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

function isLowSignalTicketTitle(title: string): boolean {
  return /^(overview|summary|acceptance criteria|test plan|risks?|questions?|dependencies)$/i.test(
    title,
  );
}

function firstMeaningfulLine(planContent: string): string | null {
  for (const rawLine of planContent.split(/\r?\n/)) {
    const title = cleanTicketTitle(rawLine.replace(/^#{1,6}\s+/, ""));
    if (title && !isLowSignalTicketTitle(title)) return title;
  }
  return null;
}

function buildTicketDescription(title: string, planContent: string): string {
  return truncateText(
    [`Created from the approved project plan.`, "", `Plan item: ${title}`, "", planContent.trim()]
      .filter(Boolean)
      .join("\n"),
    MAX_DESCRIPTION_LENGTH,
  );
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
