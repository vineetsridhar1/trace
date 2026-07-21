export type ProjectWorkspaceKind = "app" | "design" | "design_system" | "pdf" | null;

export function getProjectWorkspaceKind(kind: unknown): ProjectWorkspaceKind {
  if (kind === "app" || kind === "design" || kind === "design_system" || kind === "pdf")
    return kind;
  return null;
}
