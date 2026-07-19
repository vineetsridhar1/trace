import { useCallback, useEffect, useRef, useState } from "react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { client } from "../../../lib/urql";

const DESIGN_ELEMENT_TEXT_SOURCE_QUERY = gql`
  query DesignElementTextSource($sessionGroupId: ID!, $filePath: String!, $elementId: String!) {
    designElementTextSource(
      sessionGroupId: $sessionGroupId
      filePath: $filePath
      elementId: $elementId
    ) {
      sessionGroupId
      filePath
      elementId
      text
      sourceHash
    }
  }
`;

const UPDATE_DESIGN_ELEMENT_TEXT_MUTATION = gql`
  mutation UpdateDesignElementText(
    $sessionGroupId: ID!
    $filePath: String!
    $elementId: String!
    $text: String!
    $expectedSourceHash: String!
  ) {
    updateDesignElementText(
      sessionGroupId: $sessionGroupId
      filePath: $filePath
      elementId: $elementId
      text: $text
      expectedSourceHash: $expectedSourceHash
    ) {
      sessionGroupId
      filePath
      elementId
      previousText
      text
      sourceHash
    }
  }
`;

export type DesignManualEditTarget = {
  filePath: string;
  elementId: string;
  text: string;
  sourceHash: string;
};

type OverlayMessage = {
  type: "trace:app:overlay";
  event: string;
  sourceLocation?: string;
  elementId?: string;
  text?: string;
  editableText?: boolean;
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
    text: typeof record.text === "string" ? record.text : undefined,
    editableText: typeof record.editableText === "boolean" ? record.editableText : undefined,
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
  const selectionRequestRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [target, setTarget] = useState<DesignManualEditTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frameOrigin = (() => {
    if (!url || typeof window === "undefined") return null;
    try {
      return new URL(url, window.location.href).origin;
    } catch {
      return null;
    }
  })();

  const postToFrame = useCallback(
    (message: Record<string, unknown>) => {
      if (!frameOrigin) return;
      frameRef.current?.contentWindow?.postMessage(message, frameOrigin);
    },
    [frameOrigin],
  );

  const sendEditMode = useCallback(() => {
    postToFrame({ type: "trace:design:edit-mode", enabled });
  }, [enabled, postToFrame]);

  useEffect(() => {
    if (!sessionGroupId) return;
    const requestAtMount = selectionRequestRef.current;
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
        sendEditMode();
        return;
      }
      if (
        !enabled ||
        message.event !== "element-selected" ||
        !message.elementId ||
        !message.sourceLocation
      ) {
        return;
      }

      const requestId = selectionRequestRef.current + 1;
      selectionRequestRef.current = requestId;
      setTarget(null);
      setDraft(message.text ?? "");
      setLoading(false);
      setError(message.editableText === false ? "This element contains nested content." : null);
      if (message.editableText === false) return;
      setLoading(true);
      void client
        .query(
          DESIGN_ELEMENT_TEXT_SOURCE_QUERY,
          {
            sessionGroupId,
            filePath: message.sourceLocation,
            elementId: message.elementId,
          },
          { requestPolicy: "network-only" },
        )
        .toPromise()
        .then((result) => {
          if (selectionRequestRef.current !== requestId) return;
          if (result.error) {
            setError(result.error.message);
            return;
          }
          const source = result.data?.designElementTextSource;
          if (!source) {
            setError("This element could not be mapped back to its source.");
            return;
          }
          const nextTarget: DesignManualEditTarget = {
            filePath: source.filePath,
            elementId: source.elementId,
            text: source.text,
            sourceHash: source.sourceHash,
          };
          setTarget(nextTarget);
          setDraft(nextTarget.text);
          postToFrame({
            type: "trace:design:preview-text",
            elementId: nextTarget.elementId,
            text: nextTarget.text,
          });
        })
        .catch((cause: unknown) => {
          if (selectionRequestRef.current !== requestId) return;
          setError(cause instanceof Error ? cause.message : "Failed to inspect this element.");
        })
        .finally(() => {
          if (selectionRequestRef.current === requestId) setLoading(false);
        });
    }

    window.addEventListener("message", handleMessage);
    return () => {
      selectionRequestRef.current = Math.max(selectionRequestRef.current, requestAtMount) + 1;
      window.removeEventListener("message", handleMessage);
    };
  }, [enabled, frameOrigin, postToFrame, sendEditMode, sessionGroupId]);

  useEffect(() => {
    setEnabled(false);
    setTarget(null);
    setDraft("");
    setError(null);
  }, [sessionGroupId, url]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      if (!next && target && draft !== target.text) {
        postToFrame({
          type: "trace:design:preview-text",
          elementId: target.elementId,
          text: target.text,
        });
      }
      postToFrame({ type: "trace:design:edit-mode", enabled: next });
      if (!next) {
        postToFrame({ type: "trace:design:clear-selection" });
        setTarget(null);
        setDraft("");
        setError(null);
      }
      return next;
    });
  }, [draft, postToFrame, target]);

  const changeDraft = useCallback(
    (text: string) => {
      setDraft(text);
      if (!target) return;
      postToFrame({
        type: "trace:design:preview-text",
        elementId: target.elementId,
        text,
      });
    },
    [postToFrame, target],
  );

  const cancel = useCallback(() => {
    if (target) {
      postToFrame({
        type: "trace:design:preview-text",
        elementId: target.elementId,
        text: target.text,
      });
    }
    postToFrame({ type: "trace:design:clear-selection" });
    setTarget(null);
    setDraft("");
    setError(null);
  }, [postToFrame, target]);

  const save = useCallback(async () => {
    if (!target || saving || draft === target.text) return;
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPDATE_DESIGN_ELEMENT_TEXT_MUTATION, {
          sessionGroupId,
          filePath: target.filePath,
          elementId: target.elementId,
          text: draft,
          expectedSourceHash: target.sourceHash,
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const updated = result.data?.updateDesignElementText;
      if (!updated) throw new Error("The design source was not updated.");
      const nextTarget: DesignManualEditTarget = {
        filePath: updated.filePath,
        elementId: updated.elementId,
        text: updated.text,
        sourceHash: updated.sourceHash,
      };
      setTarget(nextTarget);
      setDraft(nextTarget.text);
      toast.success("Design text saved to source");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save the design text.");
    } finally {
      setSaving(false);
    }
  }, [draft, saving, sessionGroupId, target]);

  return {
    frameRef,
    enabled,
    target,
    draft,
    loading,
    saving,
    error,
    dirty: target !== null && draft !== target.text,
    toggle,
    changeDraft,
    cancel,
    save,
    onFrameLoad: sendEditMode,
  };
}
