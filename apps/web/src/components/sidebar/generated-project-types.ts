import { AppWindow, NotebookText, Palette } from "lucide-react";

export type GeneratedProjectKind = "app" | "design" | "pdf";

export const projectTypePresentation = {
  app: { Icon: AppWindow, label: "Apps", emptyLabel: "Create an App", className: "text-cyan-400" },
  design: {
    Icon: Palette,
    label: "Designs",
    emptyLabel: "Create a Design",
    className: "text-pink-400",
  },
  pdf: {
    Icon: NotebookText,
    label: "Documents",
    emptyLabel: "Create a Document",
    className: "text-orange-400",
  },
} as const;
