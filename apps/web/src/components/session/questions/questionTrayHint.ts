export function questionTrayHint(type: string, reviewing: boolean): string {
  if (reviewing) return "⌘↵ send · esc type instead";
  if (type === "text") return "↵ continue · shift+↵ new line · esc type instead";
  if (type === "ranking") return "↑ ↓ reorder · ↵ continue · esc type instead";
  if (type === "reference") return "⌘V paste · ↵ continue · esc type instead";
  if (type === "confirm") return "y / n choose · esc type instead";
  return "number keys pick · ↵ continue · esc type instead";
}
