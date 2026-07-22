export type GeneratedProjectKind = "app" | "design" | "pdf";

export const projectTypePresentation = {
  app: { label: "Apps", emptyLabel: "Create an App" },
  design: {
    label: "Designs",
    emptyLabel: "Create a Design",
  },
  pdf: {
    label: "Documents",
    emptyLabel: "Create a Document",
  },
} as const;
