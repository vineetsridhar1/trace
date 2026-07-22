import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  kind: null as "app" | "design" | null,
  close: vi.fn(),
  createApp: vi.fn(),
  createDesign: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
  useCallback: <T>(callback: T) => callback,
  useState: <T>(initial: T) => [initial, vi.fn()],
}));

vi.mock("../../lib/create-quick-session", () => ({
  createAppSession: state.createApp,
  createDesignSession: state.createDesign,
  createPdfSession: vi.fn(),
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

vi.mock("@trace/client-core", () => ({
  useAuthStore: (selector: (state: { activeOrgId: string | null }) => unknown) =>
    selector({ activeOrgId: null }),
  useEntityStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ repos: {}, agentEnvironments: {}, sessionGroups: {}, sessions: {} }),
}));

vi.mock("zustand/react/shallow", () => ({
  useShallow: <T>(selector: T) => selector,
}));

describe("NewGeneratedProjectDialog", () => {
  beforeEach(() => {
    state.kind = null;
    state.close.mockReset();
    state.createApp.mockReset();
    state.createDesign.mockReset();
  });

  it("dispatches exactly one blank app session creation", async () => {
    state.kind = "app";
    const { NewGeneratedProjectDialog } = await import("./NewGeneratedProjectDialog");

    NewGeneratedProjectDialog();

    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.createApp).toHaveBeenCalledTimes(1);
    expect(state.createDesign).not.toHaveBeenCalled();
  });

  it("dispatches exactly one blank design session creation", async () => {
    state.kind = "design";
    const { NewGeneratedProjectDialog } = await import("./NewGeneratedProjectDialog");

    NewGeneratedProjectDialog();

    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.createDesign).toHaveBeenCalledTimes(1);
    expect(state.createApp).not.toHaveBeenCalled();
  });
});
