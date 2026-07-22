export function isGeneratedProjectKind(
  kind: string | null | undefined,
): kind is "app" | "design" | "pdf" {
  return kind === "app" || kind === "design" || kind === "pdf";
}
