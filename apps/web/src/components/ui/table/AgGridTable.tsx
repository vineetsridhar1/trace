import { create } from 'zustand';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridOptions } from 'ag-grid-community';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TableState } from './table-types';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { colorSchemeDark, themeQuartz } from 'ag-grid-community';
import './ag-grid-styles.css';
import { ensureAgGridSetup } from './loadTable';

const theme = themeQuartz.withPart(colorSchemeDark);

const createTableStore = <T,>(columns: ColDef<T>[] = []) => {
  return create<TableState<T>>(set => ({
    columns,
    setColumns: columns => set({ columns }),
    search: '',
    setSearch: search => set({ search }),
    rows: [],
    setRows: rows => set({ rows }),
    loading: false,
    setLoading: loading => set({ loading }),
    total: 0,
    setTotal: total => set({ total }),
  }));
};

type CreateTableProps<T> = {
  id: string;
  columns?: ColDef<T>[];
};

export const createTable = <T extends { id: string }>({
  id,
  columns = [],
}: CreateTableProps<T>) => {
  const useTable = createTableStore<T>(columns);

  const TableComponent = ({
    agGridOptions = {},
    className,
    selectedRowIds,
  }: {
    agGridOptions?: GridOptions<T>;
    className?: string;
    selectedRowIds?: string[];
  }) => {
    const rows = useTable(state => state.rows);
    const columns = useTable(state => state.columns);
    const loading = useTable(state => state.loading);
    const gridRef = useRef<AgGridReact<T>>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      ensureAgGridSetup().then(() => setReady(true));
    }, []);

    const gridOptions: GridOptions<T> = useMemo(
      () => ({
        columnDefs: columns,
        rowData: rows,
        headerHeight: 30,
        theme,
        rowSelection: undefined,
        animateRows: true,
        rowHeight: 50,
        enableCellTextSelection: true,
        getRowId: params => params.data.id,
        rowClassRules: {
          'selected-row': params => {
            return Boolean(selectedRowIds && selectedRowIds.includes(params.data?.id || ''));
          },
        },
        autoGroupColumnDef: {
          cellClass: 'group-row',
        },
        getRowHeight: params => {
          if (params.node.group) return 30;
          return undefined;
        },
        ...agGridOptions,
      }),
      [columns, rows, agGridOptions, selectedRowIds]
    );

    if (!ready || loading) return null;

    return (
      <div className="flex flex-col gap-5" data-table-id={id}>
        <div className="relative">
          <div className={cn('ag-theme-quartz', 'w-full', 'h-full', className)}>
            <AgGridReact<T> ref={gridRef} {...gridOptions} />
          </div>
        </div>
      </div>
    );
  };

  const TableActions = ({ children }: { children: React.ReactNode }) => {
    const container = document.getElementById(`table-actions-container-${id}`);
    if (!container) return null;
    return createPortal(children, container);
  };

  return {
    Table: TableComponent,
    useTable,
    TableActions,
  };
};
