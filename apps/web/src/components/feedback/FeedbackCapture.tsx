import { useCallback, useEffect, useRef, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { Eraser, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useUIStore } from "../../stores/ui";
import { sendSessionFeedback } from "../../lib/session-feedback";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { FeedbackCanvas, type FeedbackCanvasHandle } from "./FeedbackCanvas";
import { FeedbackDestinationBadge } from "./FeedbackDestinationBadge";

type FeedbackState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "ready"; screenshot: DesktopFeedbackScreenshot };

type EntitySummary = { name?: string | null };

export function FeedbackCapture() {
  const activeSessionId = useUIStore((s) => s.activeSessionId);
  const sessionName = useEntityField("sessions", activeSessionId ?? "", "name") as
    | string
    | undefined;
  const sessionGroupId = useEntityField("sessions", activeSessionId ?? "", "sessionGroupId") as
    | string
    | null
    | undefined;
  const groupName = useEntityField("sessionGroups", sessionGroupId ?? "", "name") as
    | string
    | undefined;
  const branch = useEntityField("sessions", activeSessionId ?? "", "branch") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessions", activeSessionId ?? "", "repo") as
    | EntitySummary
    | null
    | undefined;
  const [state, setState] = useState<FeedbackState>({ status: "closed" });
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const canvasRef = useRef<FeedbackCanvasHandle>(null);

  const close = useCallback(() => {
    if (isSending) return;
    setState({ status: "closed" });
    setMessage("");
  }, [isSending]);

  const open = useCallback(async () => {
    if (!window.trace?.captureFeedbackScreenshot) {
      toast.error("Feedback capture is only available in the Trace desktop app");
      return;
    }
    if (!useUIStore.getState().activeSessionId) {
      toast.error("Open a synced session before sending feedback");
      return;
    }

    setState({ status: "loading" });
    try {
      const screenshot = await window.trace.captureFeedbackScreenshot();
      setState({ status: "ready", screenshot });
    } catch (error) {
      setState({ status: "closed" });
      toast.error(error instanceof Error ? error.message : "Failed to capture screenshot");
    }
  }, []);

  const sendOverlayFeedback = useCallback(async (payload: DesktopFeedbackOverlayPayload) => {
    const sessionId = useUIStore.getState().activeSessionId;
    if (!sessionId) {
      toast.error("Open a synced session before sending feedback");
      return;
    }

    let previewUrl: string | null = null;
    try {
      const blob = dataUrlToBlob(payload.screenshot.dataUrl);
      previewUrl = URL.createObjectURL(blob);
      await sendSessionFeedback({
        sessionId,
        message: payload.message,
        imageBlob: blob,
        imagePreviewUrl: previewUrl,
      });
      toast.success("Feedback sent to the current session");
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      toast.error(error instanceof Error ? error.message : "Failed to send feedback");
    }
  }, []);

  useEffect(() => {
    if (!window.trace?.onFeedbackShortcut) return;
    return window.trace.onFeedbackShortcut(() => {
      void open();
    });
  }, [open]);

  useEffect(() => {
    if (!window.trace?.setFeedbackDestination) return;

    void window.trace.setFeedbackDestination({
      sessionId: activeSessionId,
      label: sessionName ?? "No session selected",
      context: [groupName, repo?.name].filter(Boolean).join(" · ") || null,
      branch: branch ?? null,
    });
  }, [activeSessionId, branch, groupName, repo?.name, sessionName]);

  useEffect(() => {
    if (!window.trace?.onFeedbackOverlaySubmit) return;

    return window.trace.onFeedbackOverlaySubmit((payload) => {
      void sendOverlayFeedback(payload);
    });
  }, [sendOverlayFeedback]);

  useEffect(() => {
    if (state.status === "closed") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, state.status]);

  const send = useCallback(async () => {
    const sessionId = useUIStore.getState().activeSessionId;
    if (!sessionId || state.status !== "ready") return;

    setIsSending(true);
    let previewUrl: string | null = null;
    try {
      const blob = await canvasRef.current?.toBlob();
      if (!blob) throw new Error("Screenshot is not ready");
      previewUrl = URL.createObjectURL(blob);
      await sendSessionFeedback({
        sessionId,
        message,
        imageBlob: blob,
        imagePreviewUrl: previewUrl,
      });
      toast.success("Feedback sent to the current session");
      setState({ status: "closed" });
      setMessage("");
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      toast.error(error instanceof Error ? error.message : "Failed to send feedback");
    } finally {
      setIsSending(false);
    }
  }, [message, state]);

  if (state.status === "closed") return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Trace feedback</p>
          <p className="text-xs text-white/60">
            Draw directly on this screen capture, add a note, then send.
          </p>
        </div>
        <div className="ml-auto hidden max-w-[min(520px,50vw)] md:block">
          <FeedbackDestinationBadge sessionId={activeSessionId} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={close}
        >
          <X />
        </Button>
      </div>

      <div className="mb-3 shrink-0 md:hidden">
        <FeedbackDestinationBadge sessionId={activeSessionId} />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {state.status === "loading" ? (
          <p className="text-sm text-white/70">Capturing screen...</p>
        ) : (
          <FeedbackCanvas ref={canvasRef} screenshot={state.screenshot} />
        )}
      </div>

      <div className="mt-3 grid shrink-0 gap-3 rounded-xl border border-white/10 bg-background p-3 text-foreground shadow-2xl md:grid-cols-[1fr_auto]">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          placeholder="What should the agent know about this feedback?"
          className="min-h-20 resize-none"
          disabled={isSending || state.status !== "ready"}
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-stretch">
          <Button
            variant="outline"
            onClick={() => canvasRef.current?.undo()}
            disabled={isSending || state.status !== "ready"}
          >
            <RotateCcw />
            Undo
          </Button>
          <Button
            variant="outline"
            onClick={() => canvasRef.current?.clear()}
            disabled={isSending || state.status !== "ready"}
          >
            <Eraser />
            Clear
          </Button>
          <Button onClick={() => void send()} disabled={isSending || state.status !== "ready"}>
            <Send />
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>

      <p className="mt-2 shrink-0 text-center text-xs text-white/50">
        Press Escape to cancel. Shortcut: Cmd/Ctrl + Shift + F.
      </p>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, data] = dataUrl.split(",");
  if (!metadata || !data) {
    throw new Error("Invalid screenshot data");
  }

  const mimeMatch = metadata.match(/^data:(.*?);base64$/);
  const mime = mimeMatch?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}
