import { AgGridReact } from "ag-grid-react";
import type { GridOptions } from "ag-grid-community";
import { useRef, useEffect, useState } from "react";
import { colorSchemeDark, themeQuartz } from "ag-grid-community";
import { cn } from "@/lib/utils";
import "./ag-grid-styles.css";
import { ensureAgGridSetup } from "./loadTable";

const theme = themeQuartz.withPart(colorSchemeDark);

type AgGridTableGridProps<T> = {
  id: string;
  rows: T[];
  columns: GridOptions<T>["columnDefs"];
  className?: string;
  selectedRowIds?: string[];
  agGridOptions?: GridOptions<T>;
};

export default function AgGridTableGrid<T extends { id: string }>({
  id,
  rows,
  columns,
  className,
  selectedRowIds,
  agGridOptions = {},
}: AgGridTableGridProps<T>) {
  const gridRef = useRef<AgGridReact<T>>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureAgGridSetup().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className={cn("ag-theme-quartz", "w-full", "h-full", className)} data-table-id={id}>
      <AgGridReact<T>
        ref={gridRef}
        columnDefs={columns}
        rowData={rows}
        headerHeight={30}
        theme={theme}
        rowSelection={undefined}
        animateRows={true}
        rowHeight={50}
        enableCellTextSelection={true}
        getRowId={(params: { data: { id: string } }) => params.data.id}
        rowClassRules={{
          "selected-row": (params: { data?: { id?: string } }) => {
            return Boolean(selectedRowIds && selectedRowIds.includes(params.data?.id || ""));
          },
        }}
        autoGroupColumnDef={{ cellClass: "group-row" }}
        getRowHeight={(params: { node: { group?: boolean } }) => {
          if (params.node.group) return 40;
          return undefined;
        }}
        {...agGridOptions}
      />
    </div>
  );
}
