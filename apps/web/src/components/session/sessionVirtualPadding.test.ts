import { describe, expect, it } from "vitest";

import { getSessionVirtualPadding } from "./sessionVirtualPadding";

describe("session virtual padding", () => {
  it("returns no padding when no rows are virtualized", () => {
    expect(getSessionVirtualPadding([], 800)).toEqual({ paddingTop: 0, paddingBottom: 0 });
  });

  it("uses spacers before the first visible row and after the last visible row", () => {
    expect(
      getSessionVirtualPadding(
        [
          { start: 240, end: 320 },
          { start: 320, end: 480 },
        ],
        1000,
      ),
    ).toEqual({ paddingTop: 240, paddingBottom: 520 });
  });

  it("never returns negative bottom padding while row measurements settle", () => {
    expect(getSessionVirtualPadding([{ start: 0, end: 1040 }], 1000)).toEqual({
      paddingTop: 0,
      paddingBottom: 0,
    });
  });
});
