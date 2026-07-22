import { describe, expect, it } from "vitest";
import type { DesignSystem } from "@trace/gql";
import {
  designSystemAvailabilityLabel,
  designSystemValidationErrors,
  selectableDesignSystems,
  unavailableDesignSystems,
} from "./DesignSystemCombobox";

const system = (overrides: Partial<DesignSystem>): DesignSystem => ({
  id: "system",
  name: "System",
  slug: "system",
  organizationId: "org",
  description: null,
  status: "ready",
  sourceRepoId: null,
  sourceRepo: null,
  sourceBranch: null,
  sourcePath: null,
  activeVersionId: "v1",
  activeVersion: { id: "v1", version: 1 } as DesignSystem["activeVersion"],
  latestCommitArtifactId: null,
  latestCommitArtifact: null,
  latestPushedCommitSha: null,
  authoringSessionGroupId: "group",
  authoringSessionGroup: {} as DesignSystem["authoringSessionGroup"],
  createdById: "user",
  commitArtifactStatus: null,
  commitArtifactError: null,
  publishStatus: "published",
  publishedCommitSha: null,
  publishAttemptedAt: null,
  publishError: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  archivedAt: null,
  ...overrides,
});

describe("design-system selection", () => {
  it("keeps a ready active version selectable while newer draft commits exist", () => {
    const readyWithDraft = system({
      latestPushedCommitSha: "new-draft",
      publishedCommitSha: "published",
      commitArtifactStatus: "saving",
    });
    expect(selectableDesignSystems([readyWithDraft])).toEqual([readyWithDraft]);
  });
  it("excludes draft and archived systems", () => {
    expect(
      selectableDesignSystems([
        system({ id: "draft", status: "draft", activeVersionId: null }),
        system({ id: "archived", archivedAt: "2026-01-02" }),
      ]),
    ).toEqual([]);
  });

  it("exposes non-archived drafts with an actionable unavailable reason", () => {
    const waiting = system({ id: "waiting", status: "draft", activeVersionId: null });
    const invalid = system({
      id: "invalid",
      status: "draft",
      activeVersionId: null,
      commitArtifactStatus: "saved",
      latestCommitArtifact: {
        status: "saved",
        packageValid: false,
      } as unknown as DesignSystem["latestCommitArtifact"],
    });
    const archived = system({ id: "archived", archivedAt: "2026-01-02" });

    expect(unavailableDesignSystems([waiting, invalid, archived])).toEqual([waiting, invalid]);
    expect(designSystemAvailabilityLabel(waiting)).toBe("Waiting for first commit");
    expect(designSystemAvailabilityLabel(invalid)).toBe("Needs repair");
  });

  it("exposes package validation errors for an unavailable system", () => {
    const invalid = system({
      latestCommitArtifact: {
        status: "saved",
        packageValid: false,
        validationSummary: {
          valid: false,
          errors: ["unresolved token alias in --font-sans: --font-geist-sans"],
        },
      } as DesignSystem["latestCommitArtifact"],
    });
    expect(designSystemValidationErrors(invalid)).toEqual([
      "unresolved token alias in --font-sans: --font-geist-sans",
    ]);
  });
});
