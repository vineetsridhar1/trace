import { afterEach, expect, it, vi } from "vitest";
import { useSessionsGridOptions } from "./useSessionsGridOptions";
import { navigateToSessionGroup } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";

vi.mock("../../stores/ui", () => ({ navigateToSessionGroup: vi.fn() }));
vi.mock("./SessionStatusHeaderRow", () => ({ SessionStatusHeaderRow: () => null }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("leaves title and input clicks to the rename control while other row clicks navigate", () => {
  class Target {
    constructor(private matches: boolean) {}
    closest() {
      return this.matches ? this : null;
    }
  }
  vi.stubGlobal("Element", Target);
  const options = useSessionsGridOptions({
    channelId: "channel",
    filterStorageKey: "test",
    isCompact: false,
    onFilterModelChanged: vi.fn(),
    onToggleStatusGroup: vi.fn(),
  });
  const data = { id: "group", latestSession: { id: "session" } } as SessionGroupRow;
  options.onRowClicked({ data, event: { target: new Target(true) } as unknown as Event });
  expect(navigateToSessionGroup).not.toHaveBeenCalled();
  options.onRowClicked({ data, event: { target: new Target(false) } as unknown as Event });
  expect(navigateToSessionGroup).toHaveBeenCalledExactlyOnceWith("channel", "group", "session");
});
