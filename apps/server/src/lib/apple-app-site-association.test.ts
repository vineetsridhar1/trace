import { describe, expect, it } from "vitest";
import { buildAppleAppSiteAssociation } from "./apple-app-site-association.js";

describe("buildAppleAppSiteAssociation", () => {
  it("builds the Trace app link association for the mobile bundle id", () => {
    expect(buildAppleAppSiteAssociation("TEAM123")).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["TEAM123.org.gettrace"],
            components: [{ "/": "/m/*" }],
          },
        ],
      },
    });
  });

  it("rejects empty team ids", () => {
    expect(() => buildAppleAppSiteAssociation("   ")).toThrow("APPLE_TEAM_ID must not be empty");
  });
});
