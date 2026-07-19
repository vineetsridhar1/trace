export type ProjectWorkspaceKind = "app" | "design" | "pdf" | null;

export function getProjectWorkspaceKind(kind: unknown): ProjectWorkspaceKind {
  if (kind === "app" || kind === "design" || kind === "pdf") return kind;
  return null;
}
