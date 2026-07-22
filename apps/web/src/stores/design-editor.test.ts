import { afterEach, describe, expect, it, vi } from "vitest";
import {
  designEditorStylesDirty,
  designEditorTextDirty,
  registerDesignEditorFrame,
  reconcileManualElementSaved,
  useDesignEditorStore,
  type DesignEditorTarget,
  type DesignEditorStyles,
} from "./design-editor";

const BASE_STYLES: DesignEditorStyles = {
  color: "#111111",
  backgroundColor: "transparent",
  fontFamily: "system-ui",
  fontSize: 32,
  fontWeight: 600,
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  lineHeight: 40,
  letterSpacing: 0,
  textTransform: "none",
  width: "320px",
  height: "40px",
  minWidth: "auto",
  maxWidth: "none",
  minHeight: "auto",
  maxHeight: "none",
  flexGrow: 0,
  alignSelf: "auto",
  position: "static",
  top: "auto",
  right: "auto",
  bottom: "auto",
  left: "auto",
  zIndex: "auto",
  display: "block",
  flexDirection: "row",
  justifyContent: "normal",
  alignItems: "normal",
  gap: 0,
  borderRadius: 0,
  paddingX: 0,
  paddingY: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  opacity: 1,
  overflow: "visible",
  objectFit: "fill",
  borderColor: "transparent",
  borderWidth: 0,
  borderStyle: "none",
  cursor: "auto",
  pointerEvents: "auto",
  whiteSpace: "normal",
  textOverflow: "clip",
  boxSizing: "border-box",
  aspectRatio: "auto",
  boxShadow: "none",
  textShadow: "none",
  transform: "none",
  filter: "none",
};

const TARGET: DesignEditorTarget = {
  filePath: "src/design/Hero.tsx",
  elementId: "hero-title",
  elementName: "h1",
  autoTarget: false,
  editableText: true,
  originalText: "Original",
  draftText: "Original",
  textSourceHash: "text-hash",
  originalStyles: BASE_STYLES,
  draftStyles: BASE_STYLES,
  manualStyles: {},
  styleSourceHash: "style-hash",
};

afterEach(() => {
  useDesignEditorStore.setState({
    activeSessionGroupId: null,
    target: null,
    domTree: [],
    drafts: {},
    pendingSaveKeys: [],
    loading: false,
    saving: false,
    error: null,
  });
});

describe("design editor store", () => {
  it("keeps live changes staged when the element is deselected", () => {
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

    expect(send).toHaveBeenNthCalledWith(3, { type: "trace:design:clear-selection" });
    expect(useDesignEditorStore.getState().drafts).toMatchObject({
      [`${TARGET.filePath}\u0000${TARGET.elementId}`]: {
        draftText: "Updated",
        draftStyles: { color: "#445566" },
      },
    });
    disconnect();
  });

  it("does not treat text without a source hash as saveable", () => {
    expect(designEditorTextDirty({ ...TARGET, textSourceHash: null, draftText: "Updated" })).toBe(
      false,
    );
  });

  it("removes an element from the staged batch when its values are reverted", () => {
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    useDesignEditorStore.getState().changeStyle("opacity", 0.5);
    useDesignEditorStore.getState().changeStyle("opacity", 1);

    expect(useDesignEditorStore.getState().drafts).toEqual({});
  });

  it("activates an ancestor from the DOM tree", () => {
    const send = vi.fn();
    const disconnect = registerDesignEditorFrame("group-1", send);
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    useDesignEditorStore.getState().activateElement("hero-card");

    expect(send).toHaveBeenCalledWith({
      type: "trace:design:activate-element",
      elementId: "hero-card",
    });
    disconnect();
  });

  it("previews a DOM tree row on hover without updating editor state", () => {
    const send = vi.fn();
    const disconnect = registerDesignEditorFrame("group-1", send);
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    useDesignEditorStore.getState().hoverElement("hero-card");
    useDesignEditorStore.getState().hoverElement(null);

    expect(send).toHaveBeenNthCalledWith(1, {
      type: "trace:design:hover-element",
      elementId: "hero-card",
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "trace:design:hover-element",
      elementId: null,
    });
    expect(useDesignEditorStore.getState().target).toBe(TARGET);
    disconnect();
  });

  it("finishes edit mode without a save request when nothing changed", async () => {
    const send = vi.fn();
    const disconnect = registerDesignEditorFrame("group-1", send);
    useDesignEditorStore.setState({ activeSessionGroupId: "group-1", target: TARGET });

    await useDesignEditorStore.getState().finish("group-1");

    expect(send).toHaveBeenCalledWith({ type: "trace:design:edit-mode", enabled: false });
    expect(useDesignEditorStore.getState()).toMatchObject({
      activeSessionGroupId: null,
      target: null,
      drafts: {},
    });
    disconnect();
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
      drafts: {
        [`${TARGET.filePath}\u0000${TARGET.elementId}`]: {
          ...TARGET,
          draftText: "Updated",
          draftStyles: { ...TARGET.draftStyles, color: "#445566" },
        },
      },
      pendingSaveKeys: [`${TARGET.filePath}\u0000${TARGET.elementId}`],
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
