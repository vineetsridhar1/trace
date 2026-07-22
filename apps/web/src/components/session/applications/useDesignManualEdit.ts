import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  registerDesignEditorFrame,
  reapplyDesignEditorDrafts,
  useDesignEditorStore,
  type DesignEditorDomNode,
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
  autoTarget?: boolean;
  editableText?: boolean;
  domTree?: DesignEditorDomNode[];
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
    autoTarget: typeof record.autoTarget === "boolean" ? record.autoTarget : undefined,
    editableText: typeof record.editableText === "boolean" ? record.editableText : undefined,
    domTree: normalizeDomTree(record.domTree),
    styles:
      record.styles && typeof record.styles === "object"
        ? (record.styles as OverlayMessage["styles"])
        : undefined,
  };
}

function normalizeDomTree(value: unknown, depth = 0): DesignEditorDomNode[] {
  if (!Array.isArray(value) || depth > 9) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as Record<string, unknown>;
    if (typeof node.elementName !== "string" || typeof node.label !== "string") return [];
    return [
      {
        elementId: typeof node.elementId === "string" ? node.elementId : null,
        elementName: node.elementName,
        label: node.label,
        children: normalizeDomTree(node.children, depth + 1),
      },
    ];
  });
}

export function useDesignManualEdit({
  sessionGroupId,
  url,
}: {
  sessionGroupId: string;
  url: string | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const activeSessionGroupId = useDesignEditorStore((state) => state.activeSessionGroupId);
  const start = useDesignEditorStore((state) => state.start);
  const stop = useDesignEditorStore((state) => state.stop);
  const finish = useDesignEditorStore((state) => state.finish);
  const saving = useDesignEditorStore((state) => state.saving);
  const selectElement = useDesignEditorStore((state) => state.selectElement);
  const setDomTree = useDesignEditorStore((state) => state.setDomTree);
  const enabled = activeSessionGroupId === sessionGroupId;

  useEffect(() => setFrameReady(false), [url]);

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

  const establishHandshake = useCallback(() => {
    postToFrame({ type: "trace:design:handshake" });
  }, [postToFrame]);

  const enableEditMode = useCallback(() => {
    establishHandshake();
    postToFrame({ type: "trace:design:edit-mode", enabled: true });
  }, [establishHandshake, postToFrame]);

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
      if (message.event === "dom-tree") {
        setDomTree(sessionGroupId, message.domTree ?? []);
        return;
      }
      if (message.event === "edit-mode-ready") {
        setFrameReady(true);
        return;
      }
      if (message.event === "ready") {
        setFrameReady(true);
        establishHandshake();
        postToFrame({ type: "trace:design:edit-mode", enabled });
        reapplyDesignEditorDrafts(sessionGroupId);
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
        autoTarget: message.autoTarget === true,
        editableText: message.editableText === true,
        styles: message.styles,
      };
      void selectElement(sessionGroupId, selection);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    enabled,
    establishHandshake,
    frameOrigin,
    postToFrame,
    selectElement,
    sessionGroupId,
    setDomTree,
  ]);

  useEffect(() => {
    if (!sessionGroupId) return;
    if (enabled) enableEditMode();
    else postToFrame({ type: "trace:design:edit-mode", enabled: false });
  }, [enabled, enableEditMode, postToFrame, sessionGroupId]);

  useEffect(() => {
    if (!enabled || frameReady) return;
    const retry = window.setInterval(enableEditMode, 500);
    return () => window.clearInterval(retry);
  }, [enabled, enableEditMode, frameReady]);

  useEffect(() => {
    return () => {
      if (useDesignEditorStore.getState().activeSessionGroupId === sessionGroupId) {
        useDesignEditorStore.getState().stop(sessionGroupId);
      }
    };
  }, [sessionGroupId]);

  const primaryAction = useCallback(() => {
    if (enabled) {
      void finish(sessionGroupId);
    } else {
      setFrameReady(false);
      start(sessionGroupId);
    }
  }, [enabled, finish, sessionGroupId, start]);

  const discard = useCallback(() => stop(sessionGroupId), [sessionGroupId, stop]);

  const onFrameLoad = useCallback(() => {
    establishHandshake();
    postToFrame({ type: "trace:design:edit-mode", enabled });
  }, [enabled, establishHandshake, postToFrame]);

  return { frameRef, frameReady, enabled, saving, primaryAction, discard, onFrameLoad };
}
