import { afterEach, describe, expect, it, vi } from "vitest";
import {
  designEditorStylesDirty,
  designEditorTextDirty,
  registerDesignEditorFrame,
  useDesignEditorStore,
  type DesignEditorTarget,
} from "./design-editor";

const TARGET: DesignEditorTarget = {
  filePath: "src/design/Hero.tsx",
  elementId: "hero-title",
  elementName: "h1",
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
});
