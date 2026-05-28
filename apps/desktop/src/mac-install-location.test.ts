import { describe, expect, it } from "vitest";
import { isAppTranslocated } from "./mac-install-location.js";

describe("isAppTranslocated", () => {
  it("detects macOS App Translocation launch paths", () => {
    expect(
      isAppTranslocated(
        "/private/var/folders/x/y/T/AppTranslocation/ABC/d/Trace.app/Contents/MacOS/Trace",
      ),
    ).toBe(true);
  });

  it("does not flag stable Applications paths", () => {
    expect(isAppTranslocated("/Applications/Trace.app/Contents/MacOS/Trace")).toBe(false);
  });
});
