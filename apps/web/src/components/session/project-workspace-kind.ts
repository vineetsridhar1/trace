export type ProjectWorkspaceKind = "app" | "design" | null;

export function getProjectWorkspaceKind(kind: unknown): ProjectWorkspaceKind {
  if (kind === "app" || kind === "design") return kind;
  return null;
}
