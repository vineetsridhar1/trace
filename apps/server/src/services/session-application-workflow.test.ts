import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn() },
}));

vi.mock("./session-applications.js", () => ({
  sessionApplicationService: {
    getRunnableApplication: vi.fn(),
    runSetupScript: vi.fn(),
    startProcess: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionApplicationService } from "./session-applications.js";
import { sessionApplicationWorkflowService } from "./session-application-workflow.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const serviceMock = sessionApplicationService as unknown as {
  runSetupScript: ReturnType<typeof vi.fn>;
  startProcess: ReturnType<typeof vi.fn>;
};

// Graph: setup "a" (no deps) -> process "b" (required, depends on "a").
const SETUP_CONFIG = {
  applications: {
    setupScripts: [{ id: "a", name: "Step A", command: "echo a", dependsOn: [] }],
    applications: [
      {
        id: "app",
        name: "App",
        processes: [
          { id: "b", name: "Proc B", command: "run b", required: true, dependsOn: ["a"], ports: [] },
        ],
      },
    ],
  },
};

const RUN = {
  id: "wf-1",
  organizationId: "org-1",
  sessionGroupId: "group-1",
  repoId: "repo-1",
  appConfigId: "app",
  status: "running" as const,
  lastError: null,
  startedByUserId: "user-1",
  startedAt: new Date("2026-06-16T00:00:00.000Z"),
  completedAt: null,
};

function mockState(
  setupRuns: Array<{ scriptConfigId: string; status: string }>,
  processes: Array<{ processConfigId: string; status: string }>,
) {
  prismaMock.sessionApplicationWorkflowRun.findUnique.mockResolvedValue(RUN);
  prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
    id: "group-1",
    organizationId: "org-1",
    ownerUserId: "user-1",
    visibility: "public",
    repoId: "repo-1",
    repo: { id: "repo-1", name: "App", remoteUrl: null, setupConfig: SETUP_CONFIG },
  });
  prismaMock.sessionSetupScriptRun.findMany.mockResolvedValue(setupRuns);
  prismaMock.sessionApplicationProcess.findMany.mockResolvedValue(processes);
  prismaMock.sessionApplicationWorkflowRun.update.mockImplementation(async ({ data }) => ({
    ...RUN,
    ...data,
  }));
}

describe("SessionApplicationWorkflowService.advance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches only dependency-free steps first", async () => {
    mockState([], []);
    await sessionApplicationWorkflowService.advance("wf-1");

    expect(serviceMock.runSetupScript).toHaveBeenCalledTimes(1);
    expect(serviceMock.runSetupScript).toHaveBeenCalledWith(
      "group-1",
      "a",
      "org-1",
      "user-1",
      { workflowRunId: "wf-1" },
    );
    expect(serviceMock.startProcess).not.toHaveBeenCalled();
    expect(prismaMock.sessionApplicationWorkflowRun.update).not.toHaveBeenCalled();
  });

  it("uses the built-in dev server workflow for app sessions", async () => {
    prismaMock.sessionApplicationWorkflowRun.findUnique.mockResolvedValue(RUN);
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
      id: "group-1",
      kind: "app",
      organizationId: "org-1",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: "repo-1",
      repo: { id: "repo-1", name: "App", remoteUrl: null, setupConfig: {} },
    });
    prismaMock.sessionSetupScriptRun.findMany.mockResolvedValue([]);
    prismaMock.sessionApplicationProcess.findMany.mockResolvedValue([]);

    await sessionApplicationWorkflowService.advance("wf-1");

    expect(serviceMock.startProcess).toHaveBeenCalledWith(
      "group-1",
      "app",
      "dev",
      "org-1",
      "user-1",
      { workflowRunId: "wf-1" },
    );
  });

  it("dispatches a dependent step once its dependency has completed", async () => {
    mockState([{ scriptConfigId: "a", status: "completed" }], []);
    await sessionApplicationWorkflowService.advance("wf-1");

    expect(serviceMock.runSetupScript).not.toHaveBeenCalled();
    expect(serviceMock.startProcess).toHaveBeenCalledWith(
      "group-1",
      "app",
      "b",
      "org-1",
      "user-1",
      { workflowRunId: "wf-1" },
    );
    expect(prismaMock.sessionApplicationWorkflowRun.update).not.toHaveBeenCalled();
  });

  it("completes once every required step is running/completed", async () => {
    mockState(
      [{ scriptConfigId: "a", status: "completed" }],
      [{ processConfigId: "b", status: "running" }],
    );
    await sessionApplicationWorkflowService.advance("wf-1");

    expect(prismaMock.sessionApplicationWorkflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wf-1" },
        data: expect.objectContaining({ status: "completed", lastError: null }),
      }),
    );
  });

  it("fails the workflow when a required step fails", async () => {
    mockState([{ scriptConfigId: "a", status: "failed" }], []);
    await sessionApplicationWorkflowService.advance("wf-1");

    expect(serviceMock.startProcess).not.toHaveBeenCalled();
    expect(prismaMock.sessionApplicationWorkflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wf-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("ignores runs that are no longer running", async () => {
    prismaMock.sessionApplicationWorkflowRun.findUnique.mockResolvedValue({
      ...RUN,
      status: "completed",
    });
    await sessionApplicationWorkflowService.advance("wf-1");

    expect(serviceMock.runSetupScript).not.toHaveBeenCalled();
    expect(serviceMock.startProcess).not.toHaveBeenCalled();
  });

  it("fails when an optional step a required step depends on fails", async () => {
    // Graph: optional process "o" (no deps) -> required process "r" depends on "o".
    // A failed "o" must fail the workflow instead of leaving "r" stuck pending.
    prismaMock.sessionApplicationWorkflowRun.findUnique.mockResolvedValue(RUN);
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
      id: "group-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: "repo-1",
      repo: {
        id: "repo-1",
        name: "App",
        remoteUrl: null,
        setupConfig: {
          applications: {
            setupScripts: [],
            applications: [
              {
                id: "app",
                name: "App",
                processes: [
                  { id: "o", name: "Optional", command: "run o", required: false, dependsOn: [], ports: [] },
                  { id: "r", name: "Required", command: "run r", required: true, dependsOn: ["o"], ports: [] },
                ],
              },
            ],
          },
        },
      },
    });
    prismaMock.sessionSetupScriptRun.findMany.mockResolvedValue([]);
    prismaMock.sessionApplicationProcess.findMany.mockResolvedValue([
      { processConfigId: "o", status: "failed" },
    ]);
    prismaMock.sessionApplicationWorkflowRun.update.mockImplementation(async ({ data }) => ({
      ...RUN,
      ...data,
    }));

    await sessionApplicationWorkflowService.advance("wf-1");

    expect(prismaMock.sessionApplicationWorkflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wf-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});
