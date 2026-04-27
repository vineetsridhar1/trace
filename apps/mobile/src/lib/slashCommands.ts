import type { SlashCommandCategory, SlashCommandSource } from "@trace/gql";

export interface SessionSlashCommand {
  name: string;
  description: string;
  source: SlashCommandSource;
  category: SlashCommandCategory;
}

export interface ComposerSelection {
  start: number;
  end: number;
}

export interface ActiveSlashCommandQuery {
  query: string;
  range: ComposerSelection;
}

export function filterSlashCommands(
  commands: SessionSlashCommand[],
  query: string,
): SessionSlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => command.name.toLowerCase().startsWith(normalized));
}

export function getActiveSlashCommandQuery(
  text: string,
  selection: ComposerSelection,
): ActiveSlashCommandQuery | null {
  if (selection.start !== selection.end) return null;

  const cursor = selection.start;
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/\/[^\s]*$/);
  if (!match) return null;

  const token = match[0];
  const start = cursor - token.length;
  if (start > 0 && !/\s/.test(text[start - 1] ?? "")) {
    return null;
  }

  let end = cursor;
  while (end < text.length && !/\s/.test(text[end] ?? "")) {
    end += 1;
  }

  return {
    query: token.slice(1),
    range: { start, end },
  };
}

export function insertSlashCommand(
  text: string,
  selection: ComposerSelection,
  commandName: string,
): { text: string; selection: ComposerSelection } {
  const activeQuery = getActiveSlashCommandQuery(text, selection);

  if (activeQuery) {
    const suffix = text.slice(activeQuery.range.end);
    const replacement = `/${commandName}${/^\s/.test(suffix) ? "" : " "}`;
    const cursorOffset = suffix.startsWith(" ") ? 1 : 0;
    const nextText = text.slice(0, activeQuery.range.start) + replacement + suffix;
    const cursor = activeQuery.range.start + replacement.length + cursorOffset;
    return {
      text: nextText,
      selection: { start: cursor, end: cursor },
    };
  }

  const suffix = text.slice(selection.end);
  const replacement = `/${commandName}${/^\s/.test(suffix) ? "" : " "}`;
  const cursorOffset = suffix.startsWith(" ") ? 1 : 0;
  const nextText = text.slice(0, selection.start) + replacement + suffix;
  const cursor = selection.start + replacement.length + cursorOffset;
  return {
    text: nextText,
    selection: { start: cursor, end: cursor },
  };
}
