export type GeneratedProjectKind = "app" | "design" | "pdf";

export const projectTypePresentation = {
  app: { label: "Apps", emptyLabel: "Create an App", className: "text-cyan-400" },
  design: {
    label: "Designs",
    emptyLabel: "Create a Design",
    className: "text-pink-400",
  },
  pdf: {
    label: "Documents",
    emptyLabel: "Create a Document",
    className: "text-orange-400",
  },
} as const;
