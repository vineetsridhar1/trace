export function isGeneratedProjectKind(
  kind: string | null | undefined,
): kind is "app" | "design" {
  return kind === "app" || kind === "design";
}
