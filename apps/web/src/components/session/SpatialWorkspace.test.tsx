import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialWorkspace } from "./SpatialWorkspace";

describe("SpatialWorkspace", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("mounts the grouped layout menu without a Base UI context error", async () => {
    await act(async () => {
      renderer = create(
        <SpatialWorkspace
          persistenceKey="spatial-workspace-test"
          tabs={[{ id: "chat", label: "Chat", icon: null }]}
          onActivateTab={() => undefined}
          onCloseTab={() => undefined}
          onNewTab={() => "draft:new"}
          renderTab={() => <div>Chat content</div>}
        />,
      );
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    expect(renderer.toJSON()).not.toBeNull();
  });
});
