import { afterEach, describe, expect, it, vi } from "vitest";
import {
  designEditorStylesDirty,
  designEditorTextDirty,
  registerDesignEditorFrame,
  reconcileManualElementSaved,
  useDesignEditorStore,
  type DesignEditorTarget,
} from "./design-editor";

const TARGET: DesignEditorTarget = {
  filePath: "src/design/Hero.tsx",
  elementId: "hero-title",
  elementName: "h1",
  autoTarget: false,
  editableText: true,
  originalText: "Original",
  draftText: "Original",
  textSourceHash: "text-hash",
  originalStyles: {
    color: "#111111",
    backgroundColor: "transparent",
    fontSize: 32,
    fontWeight: 600,
    textAlign: "left",
    borderRadius: 0,
    paddingX: 0,
    paddingY: 0,
  },
  draftStyles: {
    color: "#111111",
    backgroundColor: "transparent",
    fontSize: 32,
    fontWeight: 600,
    textAlign: "left",
    borderRadius: 0,
    paddingX: 0,
    paddingY: 0,
  },
  manualStyles: {},
  styleSourceHash: "style-hash",
};

afterEach(() => {
  useDesignEditorStore.setState({
    activeSessionGroupId: null,
    target: null,
    loading: false,
    saving: false,
    error: null,
  });
});

describe("design editor store", () => {
  it("posts live changes and restores only touched properties when deselected", () => {
    const send = vi.fn();
    const disconnect = registerDesignEditorFrame("group-1", send);
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    useDesignEditorStore.getState().changeText("Updated");
    useDesignEditorStore.getState().changeStyle("color", "#445566");

    expect(send).toHaveBeenNthCalledWith(1, {
      type: "trace:design:preview-text",
      elementId: "hero-title",
      text: "Updated",
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "trace:design:preview-styles",
      elementId: "hero-title",
      styles: { color: "#445566" },
    });
    expect(designEditorTextDirty(useDesignEditorStore.getState().target)).toBe(true);
    expect(designEditorStylesDirty(useDesignEditorStore.getState().target)).toBe(true);

    useDesignEditorStore.getState().cancelSelection();

    expect(send).toHaveBeenNthCalledWith(3, {
      type: "trace:design:preview-text",
      elementId: "hero-title",
      text: "Original",
    });
    expect(send).toHaveBeenNthCalledWith(4, {
      type: "trace:design:preview-styles",
      elementId: "hero-title",
      styles: { color: "#111111" },
    });
    expect(send).toHaveBeenNthCalledWith(5, { type: "trace:design:clear-selection" });
    disconnect();
  });

  it("does not treat text without a source hash as saveable", () => {
    expect(designEditorTextDirty({ ...TARGET, textSourceHash: null, draftText: "Updated" })).toBe(
      false,
    );
  });

  it("resets a draft in place and restores the live preview", () => {
    const send = vi.fn();
    const disconnect = registerDesignEditorFrame("group-1", send);
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    useDesignEditorStore.getState().changeText("Updated");
    useDesignEditorStore.getState().changeStyle("fontSize", 48);
    send.mockClear();

    useDesignEditorStore.getState().resetChanges();

    expect(send).toHaveBeenNthCalledWith(1, {
      type: "trace:design:preview-text",
      elementId: "hero-title",
      text: "Original",
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "trace:design:preview-styles",
      elementId: "hero-title",
      styles: { fontSize: 32 },
    });
    expect(useDesignEditorStore.getState().target).toMatchObject({
      elementId: "hero-title",
      draftText: "Original",
      draftStyles: TARGET.originalStyles,
    });
    disconnect();
  });

  it("reconciles the committed save from the event stream", () => {
    useDesignEditorStore.setState({
      activeSessionGroupId: "group-1",
      saving: true,
      error: "A previous save failed",
      target: {
        ...TARGET,
        draftText: "Updated",
        draftStyles: { ...TARGET.draftStyles, color: "#445566" },
      },
    });

    reconcileManualElementSaved({
      sessionGroupId: "group-1",
      filePath: TARGET.filePath,
      elementId: TARGET.elementId,
      text: "Updated",
      textSourceHash: "updated-text-hash",
      styles: { color: "#445566" },
      styleSourceHash: "updated-style-hash",
      commitSha: "commit-123",
    });

    expect(useDesignEditorStore.getState()).toMatchObject({ saving: false, error: null });
    expect(useDesignEditorStore.getState().target).toMatchObject({
      originalText: "Updated",
      draftText: "Updated",
      textSourceHash: "updated-text-hash",
      originalStyles: { color: "#445566" },
      draftStyles: { color: "#445566" },
      manualStyles: { color: "#445566" },
      styleSourceHash: "updated-style-hash",
    });
  });
});
