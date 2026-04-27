import { createTable } from "../ui/table";
import type { SessionGridRow } from "./sessions-table-types";
import { sessionColumns } from "./sessions-table-columns";

export const sessionsGridTableInstance = createTable<SessionGridRow>({
  id: "sessions",
  columns: sessionColumns,
});
