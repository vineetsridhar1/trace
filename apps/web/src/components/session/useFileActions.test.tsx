import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "../../stores/ui";
import { useFileActions } from "./useFileActions";

type FileActions = ReturnType<typeof useFileActions>;

function Harness({
  sessionGroupId,
  onReady,
}: {
  sessionGroupId: string;
  onReady: (actions: FileActions) => void;
}) {
  onReady(useFileActions(sessionGroupId));
  return null;
}

function mount(sessionGroupId: string, onReady: (actions: FileActions) => void): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness sessionGroupId={sessionGroupId} onReady={onReady} />);
  });
  return renderer;
}

describe("useFileActions", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useUIStore.setState({
      openFileTabsByGroup: {},
      activeFilePathsByGroup: {},
      activeTerminalId: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("restores an open file after returning to an unmounted session group", () => {
    let firstGroupActions: FileActions | undefined;
    const firstGroup = mount("group-1", (actions) => (firstGroupActions = actions));

    act(() => {
      firstGroupActions?.handleFileClick("src/one.ts");
    });
    act(() => firstGroup.unmount());

    let secondGroupActions: FileActions | undefined;
    const secondGroup = mount("group-2", (actions) => (secondGroupActions = actions));
    act(() => {
      secondGroupActions?.handleFileClick("src/two.ts");
    });
    act(() => secondGroup.unmount());

    let restoredGroupActions: FileActions | undefined;
    const restoredGroup = mount("group-1", (actions) => (restoredGroupActions = actions));

    expect(restoredGroupActions?.openFiles).toEqual([
      { filePath: "src/one.ts", fileName: "one.ts" },
    ]);
    expect(restoredGroupActions?.activeFilePath).toBe("src/one.ts");

    act(() => restoredGroup.unmount());
  });
});
