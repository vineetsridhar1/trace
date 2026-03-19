import { create } from 'zustand';
import type { ColDef, GridOptions } from 'ag-grid-community';
import { lazy, Suspense } from 'react';
import type { TableState } from './table-types';

// React.lazy cannot preserve generic type parameters. We load the module
// and assert the grid component inside createTable where T is known.
const lazyModule = lazy(() => import('./AgGridTableGrid'));

const createTableStore = <T,>(columns: ColDef<T>[] = []) => {
  return create<TableState<T>>(set => ({
    columns,
    setColumns: columns => set({ columns }),
    rows: [],
    setRows: rows => set({ rows }),
    loading: false,
    setLoading: loading => set({ loading }),
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

    // Assert the lazy component to the concrete T — safe because AgGridTableGrid
    // is generic and we control all call sites through createTable<T>.
    const Grid = lazyModule as unknown as React.ComponentType<{
      id: string;
      rows: T[];
      columns: GridOptions<T>['columnDefs'];
      className?: string;
      selectedRowIds?: string[];
      agGridOptions?: GridOptions<T>;
    }>;

    return (
      <Suspense fallback={null}>
        <Grid
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

  return {
    Table: TableComponent,
    useTable,
  };
};
