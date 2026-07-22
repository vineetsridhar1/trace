import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  kind: null as "app" | "design" | null,
  close: vi.fn(),
  createApp: vi.fn(),
  createDesign: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
  useCallback: <T,>(callback: T) => callback,
}));

vi.mock("../../lib/create-quick-session", () => ({
  createAppSession: state.createApp,
  createDesignSession: state.createDesign,
}));

vi.mock("../../stores/command-palette", () => ({
  useCommandPaletteStore: (
    selector: (value: {
      newGeneratedProjectKind: typeof state.kind;
      closeGeneratedProjectDialog: typeof state.close;
    }) => unknown,
  ) =>
    selector({
      newGeneratedProjectKind: state.kind,
      closeGeneratedProjectDialog: state.close,
    }),
}));

describe("NewGeneratedProjectDialog", () => {
  beforeEach(() => {
    state.close.mockReset();
    state.createApp.mockReset();
    state.createDesign.mockReset();
  });

  it.each([
    ["app", "createApp"],
    ["design", "createDesign"],
  ] as const)("dispatches exactly one blank %s session creation", async (kind, creator) => {
    state.kind = kind;
    const { NewGeneratedProjectDialog } = await import("./NewGeneratedProjectDialog");

    NewGeneratedProjectDialog();

    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state[creator]).toHaveBeenCalledTimes(1);
    expect(state[creator === "createApp" ? "createDesign" : "createApp"]).not.toHaveBeenCalled();
  });
});
