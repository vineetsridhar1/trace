import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import { Minus, Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import {
  DESIGN_PREVIEW_DEVICES,
  anchorLabel,
  buildDesignArtifactBootstrapUrl,
  clampDesignPreviewScale,
  createProtocolNonce,
  designArtifactErrorReport,
  designCommentsForPreview,
  getDesignArtifactPreviewMode,
  getDesignPreviewDeviceFrame,
  normalizeDesignAnchor,
  type CanvasArtifact,
  type DesignAnchor,
  type DesignComment,
  type DesignPreviewDevice,
} from "./designCanvasModel";

const REPORT_DESIGN_ARTIFACT_ERROR_MUTATION = gql`
  mutation ReportDesignArtifactError($artifactId: ID!, $message: String!, $stack: String) {
    reportDesignArtifactError(artifactId: $artifactId, message: $message, stack: $stack) {
      id
    }
  }
`;

const USER_CONTENT_ORIGIN = import.meta.env.VITE_TRACE_USER_CONTENT_ORIGIN?.trim() || null;
const SRC_DOC_PREVIEW_FALLBACK_ENABLED = import.meta.env.DEV === true;

function getArtifactBootstrapUrl(artifactId: string, nonce: string) {
  return buildDesignArtifactBootstrapUrl({
    artifactId,
    userContentOrigin: USER_CONTENT_ORIGIN,
    parentOrigin: window.location.origin,
    nonce,
  });
}

export function DesignArtifactCard({
  artifact,
  selected,
  selectedAnchor,
  comments,
  onAnchorSelected,
}: {
  artifact: CanvasArtifact;
  selected: boolean;
  selectedAnchor: DesignAnchor | null;
  comments: DesignComment[];
  onAnchorSelected: (artifactId: string, anchor: DesignAnchor) => void;
}) {
  const [device, setDevice] = useState<DesignPreviewDevice>("desktop");
  const [previewScale, setPreviewScale] = useState(0.55);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nonceRef = useRef<string>(createProtocolNonce());
  const reportedErrorKeysRef = useRef<Set<string>>(new Set());
  const frame = getDesignPreviewDeviceFrame(device);
  const bootstrapUrl = useMemo(
    () => getArtifactBootstrapUrl(artifact.id, nonceRef.current),
    [artifact.id],
  );
  const previewMode = getDesignArtifactPreviewMode(
    USER_CONTENT_ORIGIN,
    SRC_DOC_PREVIEW_FALLBACK_ENABLED,
  );
  const bootstrapOrigin = useMemo(
    () => (bootstrapUrl ? new URL(bootstrapUrl).origin : null),
    [bootstrapUrl],
  );
  const postArtifactHtml = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !bootstrapOrigin) return;
    target.postMessage(
      {
        type: "trace:artifact:render",
        html: artifact.html,
        overlayEnabled: true,
        comments: designCommentsForPreview(comments),
        nonce: nonceRef.current,
      },
      bootstrapOrigin,
    );
  }, [artifact.html, bootstrapOrigin, comments]);

  useEffect(() => {
    if (bootstrapUrl) postArtifactHtml();
  }, [bootstrapUrl, postArtifactHtml]);

  useEffect(() => {
    if (!bootstrapOrigin) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== bootstrapOrigin || event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const data = event.data as {
        type?: string;
        nonce?: string;
        message?: string;
        stack?: string;
        anchor?: unknown;
      } | null;
      if (!data || data.nonce !== nonceRef.current) return;
      if (data.type === "trace:artifact:ready") {
        postArtifactHtml();
      } else if (data.type === "trace:artifact:error") {
        const report = designArtifactErrorReport({
          artifactId: artifact.id,
          message: data.message,
          stack: data.stack,
        });
        toast.error(report.message);
        const reportKey = `${report.message}\n${report.stack ?? ""}`;
        if (!reportedErrorKeysRef.current.has(reportKey)) {
          reportedErrorKeysRef.current.add(reportKey);
          void client
            .mutation(REPORT_DESIGN_ARTIFACT_ERROR_MUTATION, report)
            .toPromise()
            .catch(() => undefined);
        }
      } else if (data.type === "trace:artifact:element-selected") {
        const anchor = normalizeDesignAnchor(data.anchor);
        if (!anchor) return;
        onAnchorSelected(artifact.id, anchor);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [artifact.id, bootstrapOrigin, onAnchorSelected, postArtifactHtml]);

  return (
    <article
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-sm",
        selected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 truncate text-sm font-medium">{artifact.title}</div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {selectedAnchor ? (
            <span className="max-w-48 truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-primary">
              {anchorLabel(selectedAnchor)}
            </span>
          ) : null}
          <span>
            {new Date(artifact.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {DESIGN_PREVIEW_DEVICES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDevice(item.id)}
              className={cn(
                "inline-flex h-6 w-7 items-center justify-center border-r text-muted-foreground last:border-r-0 hover:text-foreground",
                item.id === device ? "bg-primary/10 text-primary" : undefined,
              )}
              aria-label={`${item.label} preview`}
              title={`${item.label} preview`}
            >
              {item.id === "desktop" ? (
                <Monitor size={13} />
              ) : item.id === "tablet" ? (
                <Tablet size={13} />
              ) : (
                <Smartphone size={13} />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setPreviewScale((value) => clampDesignPreviewScale(value - 0.1))}
            className="inline-flex h-6 w-7 items-center justify-center border-r text-muted-foreground hover:text-foreground"
            aria-label="Zoom preview out"
            title="Zoom preview out"
          >
            <Minus size={12} />
          </button>
          <div className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(previewScale * 100)}%
          </div>
          <button
            type="button"
            onClick={() => setPreviewScale((value) => clampDesignPreviewScale(value + 0.1))}
            className="inline-flex h-6 w-7 items-center justify-center border-l text-muted-foreground hover:text-foreground"
            aria-label="Zoom preview in"
            title="Zoom preview in"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      {bootstrapUrl && previewMode === "bootstrap" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
            style={{
              width: frame.width * previewScale,
              height: frame.height * previewScale,
            }}
          >
            <iframe
              ref={iframeRef}
              title={artifact.title}
              src={bootstrapUrl}
              sandbox="allow-scripts allow-same-origin"
              className="h-full w-full origin-top-left bg-white"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `scale(${previewScale})`,
              }}
              onLoad={postArtifactHtml}
            />
          </div>
        </div>
      ) : previewMode === "srcdoc" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
            style={{
              width: frame.width * previewScale,
              height: frame.height * previewScale,
            }}
          >
            <iframe
              title={artifact.title}
              srcDoc={artifact.html}
              sandbox="allow-scripts"
              className="h-full w-full origin-top-left bg-white"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `scale(${previewScale})`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 px-6 text-center text-sm leading-6 text-muted-foreground">
          Configure VITE_TRACE_USER_CONTENT_ORIGIN to preview design artifacts.
        </div>
      )}
      {comments.length > 0 ? (
        <div className="flex max-h-28 shrink-0 flex-col gap-1 overflow-y-auto border-t bg-background/95 px-3 py-2">
          {comments.slice(-3).map((comment) => (
            <div key={comment.id} className="min-w-0 text-xs leading-5">
              <span className="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {anchorLabel(comment.anchor)}
              </span>
              <span className="text-foreground">{comment.body}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
