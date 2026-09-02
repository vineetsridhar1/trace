import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "./sidebar";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

function SidebarState({ onChange }: { onChange: (open: boolean) => void }) {
  onChange(useSidebar().open);
  return null;
}

describe("SidebarProvider keyboard shortcut", () => {
  let onKeyDown: ((event: KeyboardEvent) => void) | undefined;
  let renderer: ReturnType<typeof create> | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, handler: (event: KeyboardEvent) => void) => {
        if (type === "keydown") onKeyDown = handler;
      }),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it("does not toggle for Cmd+Shift+B", () => {
    let open: boolean | undefined;
    act(() => {
      renderer = create(
        <SidebarProvider>
          <SidebarState onChange={(value) => (open = value)} />
        </SidebarProvider>,
      );
    });

    const preventDefault = vi.fn();
    act(() => {
      onKeyDown?.(
        { key: "b", metaKey: true, shiftKey: true, preventDefault } as unknown as KeyboardEvent,
      );
    });

    expect(open).toBe(true);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
