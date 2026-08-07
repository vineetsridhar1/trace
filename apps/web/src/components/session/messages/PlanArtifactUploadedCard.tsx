import { useState } from "react";
import { Boxes, Download } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { sandboxedPlanHtml } from "../../artifact/plan-html";
import { useVisualPlanDocument } from "../../artifact/useVisualPlanDocument";
import { ArtifactCardActions } from "./ArtifactCardActions";
import { artifactFileName } from "./artifact-card-utils";
import { PlanPreviewModal } from "./PlanPreviewModal";
import { formatTime } from "./utils";

export function PlanArtifactUploadedCard({
  artifactId,
  filePath,
  timestamp,
}: {
  artifactId: string;
  filePath?: string;
  timestamp: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const displayName = artifactFileName(filePath, "Implementation plan");
  const { html } = useVisualPlanDocument(artifactId, filePath ?? null);

  const previewModal = (
    <PlanPreviewModal
      artifactId={artifactId}
      html={html}
      open={previewOpen}
      onOpenChange={setPreviewOpen}
    />
  );

  return (
    <article className="w-full overflow-hidden rounded-[14px] border border-[#2d3138] bg-[#171a1f] shadow-[0_18px_48px_rgb(0_0_0/0.28)]">
      <div className="border-b border-[#2d3138] bg-[#0d0f12]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[#2d3138] bg-[#0d0f12]/70 px-3">
          <span className="size-1.5 rounded-full bg-red-500" />
          <span className="size-1.5 rounded-full bg-amber-500" />
          <span className="size-1.5 rounded-full bg-green-500" />
          <span className="ml-3 font-mono text-[9px] text-[#9ba1aa]">{displayName}</span>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Open plan preview"
          onClick={() => setPreviewOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPreviewOpen(true);
            }
          }}
          className="relative h-[226px] cursor-pointer overflow-hidden bg-[#0d0f12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {html ? (
            <iframe
              title="Implementation plan preview"
              srcDoc={sandboxedPlanHtml(html)}
              sandbox=""
              tabIndex={-1}
              className="pointer-events-none size-full border-0 bg-[#0d0f12]"
            />
          ) : (
            <PlanPreviewSkeleton />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Boxes className="size-[18px] shrink-0 text-accent" strokeWidth={1.8} />
        <PlanArtifactIdentity timestamp={timestamp} />
        <PlanDownloadButton artifactId={artifactId} filePath={filePath} displayName={displayName} />
        <ArtifactCardActions
          artifactId={artifactId}
          openLabel="Open plan"
          onOpen={() => setPreviewOpen(true)}
        />
      </div>
      {previewModal}
    </article>
  );
}

function PlanDownloadButton({
  artifactId,
  filePath,
  displayName,
}: {
  artifactId: string;
  filePath?: string;
  displayName: string;
}) {
  if (!filePath) return null;

  return (
    <a
      href={artifactFileUrl(artifactId, filePath)}
      download={displayName}
      aria-label="Download plan"
      title="Download plan"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#2d3138] text-[#9ba1aa] transition-colors hover:bg-[#0d0f12] hover:text-[#f1f3f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Download className="size-3.5" />
    </a>
  );
}

function PlanArtifactIdentity({ timestamp }: { timestamp: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Plan
        </span>
        <span className="text-[10px] text-[#9ba1aa]">· {formatTime(timestamp)}</span>
      </div>
      <h3 className="mt-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-[#f1f3f5]">
        Implementation plan
      </h3>
    </div>
  );
}

function PlanPreviewSkeleton() {
  return (
    <div className="mx-auto max-w-[600px] px-9 py-7" aria-label="Loading plan preview">
      <div className="h-2 w-24 rounded-full bg-[#2d3138]" />
      <div className="mt-4 h-5 w-72 rounded-full bg-[#f1f3f5]/70" />
      <div className="mt-4 h-2 w-4/5 rounded-full bg-[#2d3138]" />
      <div className="mt-2 h-2 w-3/5 rounded-full bg-[#2d3138]" />
      <div className="mt-6 grid grid-cols-[1.2fr_1fr] gap-3">
        <div className="h-20 rounded-lg border border-[#2d3138] bg-[#171a1f]" />
        <div className="h-20 rounded-lg border border-[#2d3138] bg-[#171a1f]" />
      </div>
    </div>
  );
}
