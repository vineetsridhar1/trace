export function usesGeneratedProjectWorkspace(kind: unknown): boolean {
  return kind === "app" || kind === "design";
}
