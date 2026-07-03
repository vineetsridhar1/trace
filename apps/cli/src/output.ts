/** Left-align rows into plain padded columns; the last column is not padded. */
export function formatTable(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "-";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "-";
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return iso.slice(0, 10);
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
