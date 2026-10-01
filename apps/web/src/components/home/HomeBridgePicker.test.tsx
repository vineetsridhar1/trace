import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeBridgePicker } from "./HomeBridgePicker";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../lib/urql", () => ({ client: { query } }));
vi.mock("../ui/select", () => ({
  Select: "select",
  SelectTrigger: "mock-trigger",
  SelectValue: "mock-value",
  SelectContent: "mock-content",
  SelectItem: "mock-item",
}));

let renderer: ReactTestRenderer;
const onSelect = vi.fn();
const onLoadingChange = vi.fn();
const bridge = {
  id: "bridge-1",
  label: "My desktop",
  connected: true,
  hostingMode: "local",
  registeredRepoIds: ["repo-1"],
  access: { allowed: true, isOwner: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

async function renderPicker(preferLocal: boolean, runtimes: Array<typeof bridge>) {
  query.mockReturnValue({ toPromise: async () => ({ data: { availableRuntimes: runtimes } }) });
  await act(async () => {
    renderer = create(
      <HomeBridgePicker
        selectedBridgeId={null}
        repoId="repo-1"
        tool="codex"
        preferLocal={preferLocal}
        fallbackToCloud={false}
        onSelect={onSelect}
        onLoadingChange={onLoadingChange}
      />,
    );
  });
}

describe("default coding environment", () => {
  it("keeps Cloud selected when a local bridge is available", async () => {
    await renderPicker(false, [bridge]);
    expect(onSelect).not.toHaveBeenCalled();
    expect(renderer.root.findByType("select").props.value).toBe("cloud");
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("selects a compatible accessible local bridge", async () => {
    await renderPicker(true, [
      { ...bridge, id: "wrong-repo", registeredRepoIds: [] },
      { ...bridge, id: "denied", access: { allowed: false, isOwner: false } },
      bridge,
    ]);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("bridge-1");
  });

  it("waits for Local instead of silently starting in Cloud, and permits an override", async () => {
    await renderPicker(true, []);
    expect(renderer.root.findByType("select").props.value).toBe("local");
    expect(onLoadingChange).toHaveBeenLastCalledWith(true);
    act(() => renderer.root.findByType("select").props.onValueChange("cloud"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(renderer.root.findByType("select").props.value).toBe("cloud");
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps an explicit Cloud override even when a local bridge is available", async () => {
    await renderPicker(true, [bridge]);
    onSelect.mockClear();
    act(() => renderer.root.findByType("select").props.onValueChange("cloud"));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
    expect(renderer.root.findByType("select").props.value).toBe("cloud");
  });
});
