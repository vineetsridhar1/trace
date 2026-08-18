import type { ReactNode } from "react";

export interface SpatialWorkspaceTab {
  id: string;
  label: string;
  icon: ReactNode;
  status?: "live" | "changed" | "attention";
  closable?: boolean;
  minContentWidth?: number;
}
