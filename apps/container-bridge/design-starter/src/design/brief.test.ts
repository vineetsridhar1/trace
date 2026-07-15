import assert from "node:assert/strict";
import test from "node:test";
import source from "../../design.brief.json";
import { validateDesignBrief } from "./brief";

test("accepts the starter brief and its unresolved fields", () => {
  const brief = validateDesignBrief(source);
  assert.equal(brief.version, 1);
  assert.deepEqual(brief.requiredStates, ["default"]);
});

test("captures reference evidence and reuse boundaries", () => {
  const brief = validateDesignBrief({
    ...source,
    references: [
      {
        source: "reference.png",
        preserve: ["dense editorial rhythm"],
        reinterpret: ["navigation structure"],
        avoidCopying: ["logo and copy"],
        evidence: ["12px corner radius measured from cards"],
      },
    ],
  });
  assert.equal(brief.references[0]?.avoidCopying[0], "logo and copy");
});

test("rejects references without explicit reuse boundaries", () => {
  assert.throws(
    () => validateDesignBrief({ ...source, references: [{ source: "site.example" }] }),
    /preserve must be an array/,
  );
});
