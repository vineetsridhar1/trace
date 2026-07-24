export type GeneratedProjectKind = "app" | "design" | "design_system" | "pdf" | "animation";

/** Generated-project kinds a user can pick directly from a create dialog — everything except the design-system authoring workbench, which is only created via its own dedicated flow. */
export type CreatableGeneratedProjectKind = Exclude<GeneratedProjectKind, "design_system">;

export function isGeneratedProjectKind(kind: unknown): kind is GeneratedProjectKind {
  return (
    kind === "app" ||
    kind === "design" ||
    kind === "design_system" ||
    kind === "pdf" ||
    kind === "animation"
  );
}

export function isCreatableGeneratedProjectKind(
  kind: unknown,
): kind is CreatableGeneratedProjectKind {
  return kind === "app" || kind === "design" || kind === "pdf" || kind === "animation";
}

export const projectTypePresentation = {
  app: { label: "Apps", emptyLabel: "Create an App" },
  design: {
    label: "Designs",
    emptyLabel: "Create a Design",
  },
  design_system: {
    label: "Design Systems",
    emptyLabel: "Create a Design System",
  },
  pdf: {
    label: "Documents",
    emptyLabel: "Create a Document",
  },
  animation: {
    label: "Animations",
    emptyLabel: "Create an Animation",
  },
} as const;
