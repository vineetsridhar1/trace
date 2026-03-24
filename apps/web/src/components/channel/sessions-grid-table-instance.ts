import { createTable } from "../ui/table";
import type { SessionGroupRow } from "./sessions-table-types";
import { sessionColumns } from "./sessions-table-columns";

export const sessionsGridTableInstance = createTable<SessionGroupRow>({
  id: "sessions",
  columns: sessionColumns,
});
