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

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
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
});
