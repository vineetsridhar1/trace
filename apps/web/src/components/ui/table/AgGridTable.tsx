import { create } from 'zustand';
import type { ColDef, GridOptions } from 'ag-grid-community';
import { lazy, Suspense, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import type { TableState } from './table-types';

type AgGridTableGridProps<T> = {
  id: string;
  rows: T[];
  columns: GridOptions<T>['columnDefs'];
  className?: string;
  selectedRowIds?: string[];
  agGridOptions?: GridOptions<T>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LazyGrid = lazy(() => import('./AgGridTableGrid')) as unknown as ComponentType<AgGridTableGridProps<any>>;

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

    if (loading) return null;

    return (
      <Suspense fallback={null}>
        <LazyGrid
          id={id}
          rows={rows}
          columns={columns}
          className={className}
          selectedRowIds={selectedRowIds}
          agGridOptions={agGridOptions}
        />
      </Suspense>
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
