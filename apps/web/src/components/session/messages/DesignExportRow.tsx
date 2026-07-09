import { AlertCircle, Download, FileDown } from "lucide-react";
import type { DesignExportNode } from "@trace/client-core";
import { formatTime } from "./utils";

function formatBytes(value: number | undefined): string | null {
  if (value == null) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}

export function DesignExportRow({ exportNode }: { exportNode: DesignExportNode }) {
  const failed = exportNode.status === "failed";
  const details = [
    exportNode.exportType.toUpperCase(),
    formatBytes(exportNode.byteSize),
    exportNode.pageCount != null
      ? `${exportNode.pageCount} page${exportNode.pageCount === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="accent-dashed-container px-4 py-3">
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle size={16} className="text-destructive" />
        ) : (
          <FileDown size={16} className="text-accent" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {failed ? "PDF export failed" : (exportNode.fileName ?? "PDF export ready")}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {failed ? (exportNode.error ?? "Export failed") : details.join(" / ")}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{formatTime(exportNode.timestamp)}</span>
        {!failed && exportNode.fileUrl ? (
          <a
            href={exportNode.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
            aria-label="Download design export"
            title="Download design export"
          >
            <Download size={14} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
