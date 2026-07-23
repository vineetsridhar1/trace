export type ProjectWorkspaceKind =
  | "app"
  | "design"
  | "design_system"
  | "pdf"
  | "animation"
  | null;

export function getProjectWorkspaceKind(kind: unknown): ProjectWorkspaceKind {
  if (
    kind === "app" ||
    kind === "design" ||
    kind === "design_system" ||
    kind === "pdf" ||
    kind === "animation"
  )
    return kind;
  return null;
}
