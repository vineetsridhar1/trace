export function isDesignSourcePath(path: string): boolean {
  return (
    path.startsWith("src/design/") ||
    path === "design.canvas.json" ||
    path === "design.brief.json" ||
    path === "trace.tokens.json"
  );
}

export function designSourceSlug(group: { slug: string | null; name: string; id: string }): string {
  if (group.slug) return group.slug;
  const fromName = group.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return fromName || group.id;
}
