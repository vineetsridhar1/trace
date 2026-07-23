export function isGeneratedProjectKind(
  kind: string | null | undefined,
): kind is "app" | "design" | "design_system" | "pdf" | "animation" {
  return (
    kind === "app" ||
    kind === "design" ||
    kind === "design_system" ||
    kind === "pdf" ||
    kind === "animation"
  );
}
