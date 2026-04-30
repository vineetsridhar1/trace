import { describe, expect, it } from "vitest";
import { isMissingToolSessionError } from "@trace/shared";

describe("isMissingToolSessionError", () => {
  it("recognizes Codex missing rollout resume failures", () => {
    expect(
      isMissingToolSessionError(
        "Error: thread/resume: thread/resume failed: no rollout found for thread id 019ddf01-0be6-7b70-b978-94fad973c9d9",
      ),
    ).toBe(true);
  });
});
