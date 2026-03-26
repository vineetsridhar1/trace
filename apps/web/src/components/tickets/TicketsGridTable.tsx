import type { ComponentProps } from "react";
import { ticketsGridTableInstance } from "./tickets-grid-table-instance";

const BaseTicketsGridTable = ticketsGridTableInstance.Table;

export function TicketsGridTable(props: ComponentProps<typeof BaseTicketsGridTable>) {
  return <BaseTicketsGridTable {...props} />;
}
