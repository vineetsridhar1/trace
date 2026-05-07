import type { SessionGroupRow } from "./sessions-table-types";

export type SessionGroupRenameContext = {
  renamingGroupId: string | null;
  onRenameCancel: () => void;
  onRenameSubmit: (row: SessionGroupRow, name: string) => void;
};

export function getSessionGroupRenameContext(value: unknown): SessionGroupRenameContext | null {
  if (!value || typeof value !== "object") return null;

  const context = value as Partial<SessionGroupRenameContext>;
  if (context.renamingGroupId !== null && typeof context.renamingGroupId !== "string") {
    return null;
  }
  if (typeof context.onRenameCancel !== "function") return null;
  if (typeof context.onRenameSubmit !== "function") return null;

  return context as SessionGroupRenameContext;
}
