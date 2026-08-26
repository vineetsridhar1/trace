import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommandRegistryStore } from "../stores/command-registry";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

function ShortcutHarness() {
  useGlobalShortcuts();
  return null;
}

describe("useGlobalShortcuts", () => {
  let renderer: ReactTestRenderer | undefined;
  let onMenuCommand: ((command: string) => void) | undefined;
  let onKeyDown: ((event: KeyboardEvent) => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    class EditableElement {
      tagName = "DIV";
      isContentEditable = true;
    }
    vi.stubGlobal("HTMLElement", EditableElement);
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "keydown") onKeyDown = listener as (event: KeyboardEvent) => void;
      }),
      removeEventListener: vi.fn(),
      trace: {
        onMenuCommand: vi.fn((listener: (command: string) => void) => {
          onMenuCommand = listener;
          return () => undefined;
        }),
        send: vi.fn(),
      },
    });
    useCommandRegistryStore.setState({ commandsByToken: {} });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it("runs the next workspace tab command forwarded by Electron", () => {
    const run = vi.fn();
    useCommandRegistryStore.getState().setCommands("workspace", [
      { id: "workspace.next-tab", title: "Next tab", group: "Workspace", run },
    ]);
    act(() => {
      renderer = create(<ShortcutHarness />);
    });

    act(() => onMenuCommand?.("next-tab"));
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs modifier shortcuts while focus is in the composer", () => {
    const run = vi.fn();
    useCommandRegistryStore.getState().setCommands("workspace", [
      {
        id: "workspace.next-tab",
        title: "Next tab",
        group: "Workspace",
        run,
        shortcut: { key: "Tab", ctrl: true },
      },
    ]);
    act(() => {
      renderer = create(<ShortcutHarness />);
    });

    const preventDefault = vi.fn();
    act(() =>
      onKeyDown?.({
        key: "Tab",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault,
        target: new (HTMLElement as unknown as { new (): HTMLElement })(),
      } as unknown as KeyboardEvent),
    );

    expect(run).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
