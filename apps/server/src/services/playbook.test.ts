import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { DEFAULT_PLAYBOOK_CONTENT, PlaybookService } from "./playbook.js";

const prismaMock = vi.mocked(prisma, true);
const timestamp = new Date("2026-05-04T12:00:00.000Z");

function makePlaybook(overrides: Record<string, unknown> = {}) {
  return {
    id: "playbook-1",
    organizationId: "org-1",
    name: "Org playbook",
    description: null,
    isBuiltIn: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-1",
    playbookId: "playbook-1",
    version: 1,
    content: "Org default",
    metadata: {},
    createdAt: timestamp,
    playbook: makePlaybook(),
    ...overrides,
  };
}

describe("PlaybookService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
  });

  it("resolves project run override before project and organization defaults", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce({
      playbookVersionId: "run-version",
      project: { defaultPlaybookVersionId: "project-version" },
      organization: { defaultPlaybookVersionId: "org-version" },
    });
    prismaMock.playbookVersion.findUnique.mockResolvedValueOnce(
      makeVersion({ id: "run-version", content: "Run override" }),
    );

    const service = new PlaybookService();
    const resolved = await service.resolveForProjectRun("run-1", "org-1", "user", "user-1");

    expect(resolved.source).toBe("project_run");
    expect(resolved.version.id).toBe("run-version");
    expect(prismaMock.playbookVersion.findUnique).toHaveBeenCalledTimes(1);
  });

  it("creates and returns the built-in default when no configured playbook exists", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce({
      playbookVersionId: null,
      project: { defaultPlaybookVersionId: null },
      organization: { defaultPlaybookVersionId: null },
    });
    prismaMock.playbook.findFirst.mockResolvedValueOnce(null);
    prismaMock.playbook.create.mockResolvedValueOnce(
      makePlaybook({
        id: "built-in",
        organizationId: null,
        name: "Built-in default project autopilot",
        isBuiltIn: true,
      }),
    );
    prismaMock.playbookVersion.create.mockResolvedValueOnce(
      makeVersion({
        id: "built-in-version",
        playbookId: "built-in",
        content: DEFAULT_PLAYBOOK_CONTENT,
        playbook: makePlaybook({ id: "built-in", organizationId: null, isBuiltIn: true }),
      }),
    );

    const service = new PlaybookService();
    const resolved = await service.resolveForProjectRun("run-1", "org-1", "user", "user-1");

    expect(resolved.source).toBe("built_in");
    expect(resolved.version.content).toContain("Implement the current ticket");
  });
});
