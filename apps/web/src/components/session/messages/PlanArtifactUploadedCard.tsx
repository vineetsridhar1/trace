import { Download, FileText } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { sandboxedPlanHtml } from "../../artifact/plan-html";
import { useVisualPlanDocument } from "../../artifact/useVisualPlanDocument";
import { ArtifactCardActions } from "./ArtifactCardActions";
import { artifactFileName, formatArtifactBytes } from "./artifact-card-utils";
import { formatTime } from "./utils";

export function PlanArtifactUploadedCard({
  artifactId,
  filePath,
  byteSize,
  timestamp,
}: {
  artifactId: string;
  filePath?: string;
  byteSize?: number;
  timestamp: string;
}) {
  const isHtml = filePath !== "plan.mdx";
  const displayName = artifactFileName(filePath, "visual-plan.html");
  const size = formatArtifactBytes(byteSize);
  const { html } = useVisualPlanDocument(
    isHtml ? artifactId : null,
    filePath === "plan.html" ? "plan.html" : undefined,
  );

  if (!isHtml) {
    const downloadUrl = filePath ? artifactFileUrl(artifactId, filePath) : undefined;
    return (
      <article className="group relative w-full overflow-hidden rounded-[14px] border border-[#2d3138] bg-[#171a1f] shadow-[0_18px_48px_rgb(0_0_0/0.28)] transition-colors hover:border-[#69717d]">
        <div className="flex items-center gap-4 p-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-accent/25 bg-accent/10 text-accent">
            <FileText className="size-6" strokeWidth={1.8} />
          </div>
          <PlanArtifactIdentity displayName={displayName} size={size} timestamp={timestamp} />
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download={displayName}
              aria-label="Download plan"
              className="flex size-10 shrink-0 items-center justify-center rounded-[9px] text-[#9ba1aa] hover:bg-[#0d0f12] hover:text-[#f1f3f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="size-[18px]" />
            </a>
          ) : null}
          <ArtifactCardActions
            artifactId={artifactId}
            filePath={filePath}
            title="Implementation plan"
          />
        </div>
        <div className="h-px bg-gradient-to-r from-accent/60 via-accent/15 to-transparent" />
      </article>
    );
  }

  return (
    <article className="w-full overflow-hidden rounded-[14px] border border-[#2d3138] bg-[#171a1f] shadow-[0_18px_48px_rgb(0_0_0/0.28)]">
      <div className="border-b border-[#2d3138] bg-[#0d0f12] p-3">
        <div className="overflow-hidden rounded-[10px] border border-[#2d3138] bg-[#171a1f]">
          <div className="flex h-8 items-center gap-1.5 border-b border-[#2d3138] bg-[#0d0f12]/70 px-3">
            <span className="size-1.5 rounded-full bg-red-500" />
            <span className="size-1.5 rounded-full bg-amber-500" />
            <span className="size-1.5 rounded-full bg-green-500" />
            <span className="ml-3 font-mono text-[9px] text-[#9ba1aa]">{displayName}</span>
            <span className="ml-auto rounded border border-[#2d3138] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#9ba1aa]">
              Interactive preview
            </span>
          </div>
          <div className="relative h-[226px] overflow-hidden bg-[#0d0f12]">
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
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
          <FileText className="size-[22px]" strokeWidth={1.8} />
        </div>
        <PlanArtifactIdentity displayName={displayName} size={size} timestamp={timestamp} />
        <ArtifactCardActions
          artifactId={artifactId}
          filePath={filePath}
          title="Implementation plan"
        />
      </div>
    </article>
  );
}

function PlanArtifactIdentity({
  displayName,
  size,
  timestamp,
}: {
  displayName: string;
  size: string;
  timestamp: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          HTML artifact
        </span>
        <span className="text-[10px] text-[#9ba1aa]">· {formatTime(timestamp)}</span>
      </div>
      <h3 className="mt-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-[#f1f3f5]">
        Implementation plan
      </h3>
      <p className="mt-1 text-[11px] text-[#9ba1aa]">
        {displayName}
        {size ? ` · ${size}` : ""}
      </p>
    </div>
  );
}

function PlanPreviewSkeleton() {
  return (
    <div className="mx-auto max-w-[600px] px-9 py-7" aria-label="Loading artifact preview">
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
