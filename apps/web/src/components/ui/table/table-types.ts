import type { ColDef } from 'ag-grid-community';

export type TableState<T> = {
  columns: ColDef<T>[];
  setColumns: (columns: ColDef<T>[]) => void;
  rows: T[];
  setRows: (rows: T[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
};
