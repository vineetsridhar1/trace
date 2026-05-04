import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context.js";

vi.mock("../services/organization.js", () => ({
  organizationService: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    addProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
  },
}));

vi.mock("../services/project-run.js", () => ({
  projectRunService: {
    listProjectRuns: vi.fn(),
    createProjectFromGoal: vi.fn(),
    createProjectRun: vi.fn(),
    updateProjectRun: vi.fn(),
  },
}));

vi.mock("../services/project-planning.js", () => ({
  projectPlanningService: {
    askQuestion: vi.fn(),
    recordAnswer: vi.fn(),
    recordDecision: vi.fn(),
    recordRisk: vi.fn(),
    updatePlanSummary: vi.fn(),
  },
}));

vi.mock("../services/agent-environment.js", () => ({
  agentEnvironmentService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/webhook.js", () => ({
  webhookService: {
    registerGitHubWebhook: vi.fn(),
    unregisterGitHubWebhook: vi.fn(),
  },
}));

vi.mock("../services/org-member.js", () => ({
  orgMemberService: {
    getUserOrgs: vi.fn(),
    assertAdmin: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    updateRole: vi.fn(),
    getMembers: vi.fn(),
  },
}));

vi.mock("../lib/pubsub.js", () => ({
  pubsub: {
    asyncIterator: vi.fn(),
  },
  topics: {
    projectEvents: (id: string) => `project:${id}:events`,
  },
}));

vi.mock("../services/access.js", () => ({
  assertScopeAccess: vi.fn(),
}));

import { organizationMutations, organizationQueries } from "./organization.js";
import { organizationService } from "../services/organization.js";
import { projectRunService } from "../services/project-run.js";
import { projectPlanningService } from "../services/project-planning.js";

const ctx = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin",
  actorType: "user",
  clientSource: null,
} as Context;

describe("organization GraphQL resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates project queries to organizationService", async () => {
    await organizationQueries.projects({}, { organizationId: "org-1", repoId: "repo-1" }, ctx);
    await organizationQueries.project({}, { id: "project-1" }, ctx);

    expect(organizationService.listProjects).toHaveBeenCalledWith("org-1", "repo-1");
    expect(organizationService.getProject).toHaveBeenCalledWith("project-1", "org-1");
  });

  it("delegates project mutations to organizationService", async () => {
    await organizationMutations.createProject(
      {},
      { input: { organizationId: "org-1", name: "Roadmap", repoId: "repo-1" } },
      ctx,
    );
    await organizationMutations.updateProject(
      {},
      { id: "project-1", input: { name: "Roadmap v2" } },
      ctx,
    );

    expect(organizationService.createProject).toHaveBeenCalledWith(
      { organizationId: "org-1", name: "Roadmap", repoId: "repo-1" },
      "user",
      "user-1",
    );
    expect(organizationService.updateProject).toHaveBeenCalledWith(
      "project-1",
      "org-1",
      { name: "Roadmap v2" },
      "user",
      "user-1",
    );
  });

  it("delegates project-run queries and mutations to projectRunService", async () => {
    await organizationQueries.projectRuns({}, { projectId: "project-1" }, ctx);
    await organizationMutations.createProjectFromGoal(
      {},
      {
        input: {
          organizationId: "org-1",
          goal: "Build planning",
          name: "Planning",
          repoId: "repo-1",
        },
      },
      ctx,
    );
    await organizationMutations.createProjectRun(
      {},
      { input: { projectId: "project-1", initialGoal: "Build planning" } },
      ctx,
    );
    await organizationMutations.updateProjectRun(
      {},
      { id: "run-1", input: { status: "planning", planSummary: "Plan v1" } },
      ctx,
    );
    await organizationMutations.askProjectQuestion(
      {},
      { input: { projectRunId: "run-1", message: "What is in scope?" } },
      ctx,
    );
    await organizationMutations.recordProjectAnswer(
      {},
      { input: { projectRunId: "run-1", message: "Web first." } },
      ctx,
    );
    await organizationMutations.recordProjectDecision(
      {},
      { input: { projectRunId: "run-1", decision: "Start with persistence." } },
      ctx,
    );
    await organizationMutations.recordProjectRisk(
      {},
      { input: { projectRunId: "run-1", risk: "Scope can expand." } },
      ctx,
    );
    await organizationMutations.updateProjectPlanSummary(
      {},
      { input: { projectRunId: "run-1", planSummary: "Plan v1", status: "planning" } },
      ctx,
    );

    expect(projectRunService.listProjectRuns).toHaveBeenCalledWith("project-1", "org-1");
    expect(projectRunService.createProjectFromGoal).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        goal: "Build planning",
        name: "Planning",
        repoId: "repo-1",
      },
      "user",
      "user-1",
    );
    expect(projectRunService.createProjectRun).toHaveBeenCalledWith(
      { projectId: "project-1", initialGoal: "Build planning" },
      "user",
      "user-1",
    );
    expect(projectRunService.updateProjectRun).toHaveBeenCalledWith(
      "run-1",
      "org-1",
      { status: "planning", planSummary: "Plan v1" },
      "user",
      "user-1",
    );
    expect(projectPlanningService.askQuestion).toHaveBeenCalledWith(
      { projectRunId: "run-1", message: "What is in scope?" },
      "org-1",
      "user",
      "user-1",
    );
    expect(projectPlanningService.recordAnswer).toHaveBeenCalledWith(
      { projectRunId: "run-1", message: "Web first." },
      "org-1",
      "user",
      "user-1",
    );
    expect(projectPlanningService.recordDecision).toHaveBeenCalledWith(
      { projectRunId: "run-1", decision: "Start with persistence." },
      "org-1",
      "user",
      "user-1",
    );
    expect(projectPlanningService.recordRisk).toHaveBeenCalledWith(
      { projectRunId: "run-1", risk: "Scope can expand." },
      "org-1",
      "user",
      "user-1",
    );
    expect(projectPlanningService.updatePlanSummary).toHaveBeenCalledWith(
      { projectRunId: "run-1", planSummary: "Plan v1", status: "planning" },
      "org-1",
      "user",
      "user-1",
    );
  });

  it("delegates project member mutations to organizationService", async () => {
    await organizationMutations.addProjectMember(
      {},
      { input: { projectId: "project-1", userId: "user-2", role: "admin" } },
      ctx,
    );
    await expect(
      organizationMutations.removeProjectMember(
        {},
        { input: { projectId: "project-1", userId: "user-2" } },
        ctx,
      ),
    ).resolves.toBe(true);

    expect(organizationService.addProjectMember).toHaveBeenCalledWith(
      "project-1",
      "user-2",
      "admin",
      "user",
      "user-1",
    );
    expect(organizationService.removeProjectMember).toHaveBeenCalledWith(
      "project-1",
      "user-2",
      "user",
      "user-1",
    );
  });
});
