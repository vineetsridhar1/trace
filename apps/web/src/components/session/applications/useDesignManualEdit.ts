import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  registerDesignEditorFrame,
  useDesignEditorStore,
  type DesignEditorSelectionMessage,
  type DesignEditorStyles,
} from "../../../stores/design-editor";

type OverlayMessage = {
  type: "trace:app:overlay";
  event: string;
  sourceLocation?: string;
  elementId?: string;
  elementName?: string;
  text?: string;
  editableText?: boolean;
  styles?: Partial<Record<keyof DesignEditorStyles, string | number>>;
};

function overlayMessage(value: unknown): OverlayMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "trace:app:overlay" || typeof record.event !== "string") return null;
  return {
    type: "trace:app:overlay",
    event: record.event,
    sourceLocation: typeof record.sourceLocation === "string" ? record.sourceLocation : undefined,
    elementId: typeof record.elementId === "string" ? record.elementId : undefined,
    elementName: typeof record.elementName === "string" ? record.elementName : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    editableText: typeof record.editableText === "boolean" ? record.editableText : undefined,
    styles:
      record.styles && typeof record.styles === "object"
        ? (record.styles as OverlayMessage["styles"])
        : undefined,
  };
}

export function useDesignManualEdit({
  sessionGroupId,
  url,
}: {
  sessionGroupId: string;
  url: string | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const activeSessionGroupId = useDesignEditorStore((state) => state.activeSessionGroupId);
  const start = useDesignEditorStore((state) => state.start);
  const stop = useDesignEditorStore((state) => state.stop);
  const selectElement = useDesignEditorStore((state) => state.selectElement);
  const enabled = activeSessionGroupId === sessionGroupId;

  const frameOrigin = useMemo(() => {
    if (!url || typeof window === "undefined") return null;
    try {
      return new URL(url, window.location.href).origin;
    } catch {
      return null;
    }
  }, [url]);

  const postToFrame = useCallback(
    (message: Record<string, unknown>) => {
      if (!frameOrigin) return;
      frameRef.current?.contentWindow?.postMessage(message, frameOrigin);
    },
    [frameOrigin],
  );

  useEffect(() => {
    if (!sessionGroupId) return;
    return registerDesignEditorFrame(sessionGroupId, postToFrame);
  }, [postToFrame, sessionGroupId]);

  useEffect(() => {
    if (!sessionGroupId) return;
    function handleMessage(event: MessageEvent) {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !frameOrigin ||
        event.origin !== frameOrigin
      ) {
        return;
      }
      const message = overlayMessage(event.data);
      if (!message) return;
      if (message.event === "ready") {
        postToFrame({ type: "trace:design:edit-mode", enabled });
        const target = useDesignEditorStore.getState().target;
        if (enabled && target) {
          postToFrame({ type: "trace:design:select-element", elementId: target.elementId });
        }
        return;
      }
      if (
        !enabled ||
        message.event !== "element-selected" ||
        !message.elementId ||
        !message.sourceLocation ||
        !message.elementName ||
        !message.styles
      ) {
        return;
      }
      const selection: DesignEditorSelectionMessage = {
        filePath: message.sourceLocation,
        elementId: message.elementId,
        elementName: message.elementName,
        text: message.text ?? "",
        editableText: message.editableText === true,
        styles: message.styles,
      };
      void selectElement(sessionGroupId, selection);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [enabled, frameOrigin, postToFrame, selectElement, sessionGroupId]);

  useEffect(() => {
    return () => {
      if (useDesignEditorStore.getState().activeSessionGroupId === sessionGroupId) {
        useDesignEditorStore.getState().stop(sessionGroupId);
      }
    };
  }, [sessionGroupId]);

  const toggle = useCallback(() => {
    if (enabled) stop(sessionGroupId);
    else start(sessionGroupId);
  }, [enabled, sessionGroupId, start, stop]);

  const onFrameLoad = useCallback(() => {
    postToFrame({ type: "trace:design:edit-mode", enabled });
  }, [enabled, postToFrame]);

  return { frameRef, enabled, toggle, onFrameLoad };
}
