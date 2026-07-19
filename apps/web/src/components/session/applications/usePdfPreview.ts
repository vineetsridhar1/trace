import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useEntityField } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "@/lib/urql";
import {
  PDF_SESSION_DOWNLOAD_URL_QUERY,
  REQUEST_PDF_EXPORT_MUTATION,
  UPDATE_PDF_FORMAT_MUTATION,
} from "./session-applications-operations";
import type { PdfPageFormat } from "./PdfPreviewControls";

const DEFAULT_FORMAT: PdfPageFormat = { width: 210, height: 297, unit: "mm" };
const SAVE_DEBOUNCE_MS = 500;

export function usePdfPreview({
  enabled,
  frameRef,
  sessionGroupId,
}: {
  enabled: boolean;
  frameRef: RefObject<HTMLIFrameElement | null>;
  sessionGroupId?: string;
}) {
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [contentHeight, setContentHeight] = useState(0);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingFormatRef = useRef<PdfPageFormat | null>(null);
  const saveErrorRef = useRef<string | null>(null);
  const groupId = sessionGroupId ?? "";
  const storedWidth = useEntityField("sessionGroups", groupId, "pdfPageWidth") as
    | number
    | undefined;
  const storedHeight = useEntityField("sessionGroups", groupId, "pdfPageHeight") as
    | number
    | undefined;
  const storedUnit = useEntityField("sessionGroups", groupId, "pdfPageUnit") as
    | "mm"
    | "in"
    | undefined;
  const exportStatus = useEntityField("sessionGroups", groupId, "pdfExportStatus") as
    | string
    | null
    | undefined;
  const exportError = useEntityField("sessionGroups", groupId, "pdfExportError") as
    | string
    | null
    | undefined;

  const sendFormat = useCallback(
    (next: PdfPageFormat) => {
      frameRef.current?.contentWindow?.postMessage(
        { source: "trace", type: "pdf:format", format: next },
        "*",
      );
    },
    [frameRef],
  );

  const persistFormat = useCallback(
    (next: PdfPageFormat) => {
      if (!sessionGroupId) return true;
      if (pendingFormatRef.current === next) pendingFormatRef.current = null;
      const request = saveQueueRef.current.then(async () => {
        const result = await client
          .mutation(UPDATE_PDF_FORMAT_MUTATION, { sessionGroupId, ...next })
          .toPromise();
        if (!result.error) {
          saveErrorRef.current = null;
          return true;
        }
        saveErrorRef.current = result.error.message;
        toast.error("Failed to save PDF size", { description: result.error.message });
        return false;
      });
      saveQueueRef.current = request;
      return request;
    },
    [sessionGroupId],
  );

  const updateFormat = useCallback(
    (next: PdfPageFormat) => {
      setFormat(next);
      setContentHeight(0);
      sendFormat(next);
      if (!sessionGroupId) return;
      pendingFormatRef.current = next;
      saveErrorRef.current = null;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingFormatRef.current;
        if (pending) void persistFormat(pending);
      }, SAVE_DEBOUNCE_MS);
    },
    [persistFormat, sendFormat, sessionGroupId],
  );

  const download = useCallback(async () => {
    if (!sessionGroupId) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingFormatRef.current;
    const saved = pending ? await persistFormat(pending) : await saveQueueRef.current;
    if (!saved) return;
    if (saveErrorRef.current) return;
    setDownloadRequested(true);
    const result = await client
      .query(PDF_SESSION_DOWNLOAD_URL_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) {
      setDownloadRequested(false);
      toast.error("Failed to download PDF", { description: result.error.message });
      return;
    }
    const url = result.data?.pdfSessionDownloadUrl;
    if (typeof url === "string") {
      window.location.assign(url);
      setDownloadRequested(false);
      return;
    }
    const request = await client
      .mutation(REQUEST_PDF_EXPORT_MUTATION, { sessionGroupId })
      .toPromise();
    if (request.error) {
      setDownloadRequested(false);
      toast.error("Failed to generate PDF", {
        description: request.error.message,
      });
    }
  }, [persistFormat, sessionGroupId]);

  useEffect(() => {
    if (!enabled || !storedWidth || !storedHeight || !storedUnit || pendingFormatRef.current)
      return;
    const stored = { width: storedWidth, height: storedHeight, unit: storedUnit };
    setFormat(stored);
    sendFormat(stored);
  }, [enabled, sendFormat, storedHeight, storedUnit, storedWidth]);

  useEffect(() => {
    if (!downloadRequested || !sessionGroupId) return;
    if (exportStatus === "failed") {
      setDownloadRequested(false);
      toast.error("Failed to generate PDF", { description: exportError ?? "Try again." });
      return;
    }
    if (exportStatus !== "captured") return;
    void client
      .query(PDF_SESSION_DOWNLOAD_URL_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        const url = result.data?.pdfSessionDownloadUrl;
        if (typeof url === "string") window.location.assign(url);
        else toast.error("The generated PDF could not be downloaded");
        setDownloadRequested(false);
      });
  }, [downloadRequested, exportError, exportStatus, sessionGroupId]);

  useEffect(() => {
    if (!enabled) return;
    const receiveSize = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const message = event.data as { source?: unknown; type?: unknown; height?: unknown };
      if (
        message.source === "trace-pdf-preview" &&
        message.type === "content-size" &&
        typeof message.height === "number" &&
        Number.isFinite(message.height)
      )
        setContentHeight(Math.max(0, Math.ceil(message.height)));
    };
    window.addEventListener("message", receiveSize);
    return () => window.removeEventListener("message", receiveSize);
  }, [enabled, frameRef]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const downloadState = !downloadRequested
    ? "idle"
    : exportStatus === "publishing"
      ? "generating"
      : "waiting";

  return { contentHeight, download, downloadState, format, updateFormat } as const;
}
