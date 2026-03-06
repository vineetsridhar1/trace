declare module 'react-diff-view' {
  import type { ComponentType } from 'react';

  export const Diff: ComponentType<Record<string, unknown>>;
  export const Hunk: ComponentType<Record<string, unknown>>;
  export function parseDiff(diffText: string): unknown[];
}

declare module 'react-diff-view/style/index.css';
