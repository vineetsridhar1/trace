import type { SessionGroupKind } from "@trace/gql";
import type { HomeWorkBucket, HomeWorkItem } from "./home-work-data";

export type WorkFilter = "all" | "coding" | "design" | "app" | "pdf" | "animation";
export type LedgerEntry =
  | { type: "header"; key: string; bucket: HomeWorkBucket; count: number }
  | { type: "item"; key: string; item: HomeWorkItem };

export const HOME_WORK_FILTERS: Array<{ id: WorkFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "coding", label: "Code" },
  { id: "design", label: "Designs" },
  { id: "app", label: "Apps" },
  { id: "pdf", label: "PDFs" },
  { id: "animation", label: "Animations" },
];

const BUCKETS: HomeWorkBucket[] = ["in_progress", "needs_you", "done_today"];

export function buildLedgerEntries(items: HomeWorkItem[], expanded: boolean): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const bucket of BUCKETS) {
    const bucketItems = items.filter((item) => item.bucket === bucket);
    const visible = expanded ? bucketItems : bucketItems.slice(0, 3);
    if (visible.length === 0) continue;
    entries.push({ type: "header", key: `header-${bucket}`, bucket, count: bucketItems.length });
    entries.push(...visible.map((item) => ({ type: "item" as const, key: item.id, item })));
  }
  return entries;
}

export function matchesWorkFilter(kind: SessionGroupKind, filter: WorkFilter): boolean {
  if (filter === "all") return true;
  if (filter === "design") return kind === "design" || kind === "design_system";
  return kind === filter;
}

export function countWorkFilters(items: HomeWorkItem[]): Record<WorkFilter, number> {
  return {
    all: items.length,
    coding: items.filter((item) => item.kind === "coding").length,
    design: items.filter((item) => item.kind === "design" || item.kind === "design_system").length,
    app: items.filter((item) => item.kind === "app").length,
    pdf: items.filter((item) => item.kind === "pdf").length,
    animation: items.filter((item) => item.kind === "animation").length,
  };
}
