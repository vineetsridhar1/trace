import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectPreviewWorkspace } from "./ProjectPreviewWorkspace";

vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({
    isMobile: false,
    open: false,
    openMobile: false,
    setOpen: vi.fn(),
    setOpenMobile: vi.fn(),
  }),
}));

vi.mock("../../stores/design-editor", () => ({
  useDesignEditorStore: () => false,
}));

vi.mock("./SessionDetailView", () => ({
  SessionDetailView: () => <div data-testid="session-chat">Chat</div>,
}));

vi.mock("./FloatingSessionChat", () => ({
  FloatingSessionChat: ({ children }: { children: (state: "compact") => ReactNode }) => (
    <div data-testid="floating-chat">{children("compact")}</div>
  ),
}));

function renderWorkspace(floatingChat: boolean): string {
  return renderToStaticMarkup(
    <ProjectPreviewWorkspace
      sessionId="session-1"
      scrollToEventId={null}
      onScrollComplete={() => undefined}
      onForkSession={() => undefined}
      canForkSession
      canvasReady
      canvasKey="preview"
      canvas={<div data-testid="preview">Preview</div>}
      floatingChat={floatingChat}
      onOpenArtifact={() => undefined}
    />,
  );
}

describe("ProjectPreviewWorkspace", () => {
  it("renders fixed chat before the preview for app sessions", () => {
    const markup = renderWorkspace(false);

    expect(markup).not.toContain('data-testid="floating-chat"');
    expect(markup.indexOf('data-testid="session-chat"')).toBeLessThan(
      markup.indexOf('data-testid="preview"'),
    );
    expect(markup).toContain("w-[clamp(22rem,33vw,34rem)]");
  });

  it("keeps chat floating over other creation previews", () => {
    const markup = renderWorkspace(true);

    expect(markup).toContain('data-testid="floating-chat"');
    expect(markup.indexOf('data-testid="preview"')).toBeLessThan(
      markup.indexOf('data-testid="session-chat"'),
    );
  });
});
