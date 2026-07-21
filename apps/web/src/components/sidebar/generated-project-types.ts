export type GeneratedProjectKind = "app" | "design" | "design_system" | "pdf";

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
} as const;
