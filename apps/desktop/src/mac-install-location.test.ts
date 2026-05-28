import { describe, expect, it } from "vitest";
import type { App } from "electron";
import {
  isAppTranslocated,
  shouldMovePackagedMacAppToApplicationsFolder,
} from "./mac-install-location.js";

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

  it("does not move non-packaged development apps", () => {
    expect(
      shouldMovePackagedMacAppToApplicationsFolder(
        {
          isPackaged: false,
          isInApplicationsFolder: () => false,
        } as App,
        "/tmp/Trace.app/Contents/MacOS/Trace",
      ),
    ).toBe(false);
  });
});
