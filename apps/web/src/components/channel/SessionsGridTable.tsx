import type { ComponentProps } from "react";
import { sessionsGridTableInstance } from "./sessions-grid-table-instance";

const BaseSessionsGridTable = sessionsGridTableInstance.Table;

export function SessionsGridTable(props: ComponentProps<typeof BaseSessionsGridTable>) {
  return <BaseSessionsGridTable {...props} />;
}
