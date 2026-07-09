import { describe, expect, it } from "vitest";
import type { DesignPromptContentCatalog } from "@trace/gql";
import { designHarnessSummary, toggleDesignSkillId } from "./DesignHarnessSettingsPopover";

const catalog: DesignPromptContentCatalog = {
  designSystems: [
    {
      id: "trace-core",
      name: "Trace Core",
      description: "Trace product UI",
    },
  ],
  skills: [
    {
      id: "forms",
      title: "Forms",
      description: "Form-heavy flows",
    },
  ],
};

describe("design harness settings", () => {
  it("toggles skill ids without mutating the current selection", () => {
    const current = ["forms"];

    expect(toggleDesignSkillId(current, "audit")).toEqual(["forms", "audit"]);
    expect(toggleDesignSkillId(current, "forms")).toEqual([]);
    expect(current).toEqual(["forms"]);
  });

  it("summarizes the selected design system and skill count", () => {
    expect(
      designHarnessSummary({
        designSystemId: "trace-core",
        designSkillIds: ["forms", "audit"],
        catalog,
      }),
    ).toBe("Trace Core + 2");
  });

  it("falls back to persisted ids before the catalog is loaded", () => {
    expect(
      designHarnessSummary({
        designSystemId: "trace-core",
        designSkillIds: [],
        catalog: null,
      }),
    ).toBe("trace-core");
  });
});
