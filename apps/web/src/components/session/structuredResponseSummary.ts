import { parseTraceInputResponses } from "@trace/shared";

function humanize(value: string): string {
  const words = value.replaceAll(/[-_]+/g, " ").trim();
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : value;
}

export function structuredResponseSummary(text: string): string {
  const responses = parseTraceInputResponses(text);
  if (responses.length === 0) return text;

  const details = responses.map((response) => {
    const value = response.assumed
      ? "You decide"
      : response.text || response.selected.map(humanize).join(", ") || "No answer provided";
    return `- **${humanize(response.id)}:** ${value}`;
  });
  const title = responses.length === 1 ? "My answer" : "My answers";
  return `**${title}**\n\n${details.join("\n")}`;
}
