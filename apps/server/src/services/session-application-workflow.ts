import type { SessionApplicationWorkflowRun } from "@prisma/client";
import type { EventType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { AuthenticationError, AuthorizationError, ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";
import { repoApplicationConfigService } from "./repo-application-config.js";
import { sessionApplicationService } from "./session-applications.js";
import type {
  AppDefinition,
  HardcodedApplicationConfig,
} from "../config/hardcoded-applications.js";

const WORKFLOW_RUN_LIST_LIMIT = 10;

type StepKind = "setup" | "process";
type StepStatus = "pending" | "running" | "completed" | "failed";

interface WorkflowStep {
  stepId: string;
  kind: StepKind;
  label: string;
  dependsOn: string[];
  optional: boolean;
}

interface WorkflowState {
  steps: WorkflowStep[];
  status: Map<string, StepStatus>;
}

type GroupConfig = {
  group: { id: string; organizationId: string; repoId: string | null };
  config: HardcodedApplicationConfig;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// Builds the dependency graph for an application: every process the app
// declares plus the transitive closure of setup scripts they depend on.
// Throws on dangling dependencies or cycles so a malformed config fails loudly.
function buildSteps(config: HardcodedApplicationConfig, app: AppDefinition): WorkflowStep[] {
  const setupById = new Map(config.setupScripts.map((script) => [script.id, script]));
  const processById = new Map(app.processes.map((process) => [process.id, process]));

  const resolve = (stepId: string): WorkflowStep => {
    const process = processById.get(stepId);
    if (process) {
      return {
        stepId,
        kind: "process",
        label: process.name,
        dependsOn: process.dependsOn ?? [],
        optional: process.required === false,
      };
    }
    const script = setupById.get(stepId);
    if (script) {
      return {
        stepId,
        kind: "setup",
        label: script.name,
        dependsOn: script.dependsOn ?? [],
        optional: false,
      };
    }
    throw new ValidationError(`Workflow step "${stepId}" is not a known setup script or process`);
  };

  const steps = new Map<string, WorkflowStep>();
  const visiting = new Set<string>();
  const visit = (stepId: string) => {
    if (steps.has(stepId)) return;
    if (visiting.has(stepId)) {
      throw new ValidationError(`Workflow has a dependency cycle at "${stepId}"`);
    }
    visiting.add(stepId);
    const step = resolve(stepId);
    for (const dependency of step.dependsOn) visit(dependency);
    visiting.delete(stepId);
    steps.set(stepId, step);
  };

  for (const process of app.processes) visit(process.id);

  // Propagate requiredness down the graph: a dependency of a required step is
  // itself required, even if its own `required` flag is false. Otherwise a
  // required step that depends on a failed optional one would never become
  // ready and the workflow would hang instead of failing.
  const dependents = new Map<string, string[]>();
  for (const step of steps.values()) {
    for (const dependency of step.dependsOn) {
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), step.stepId]);
    }
  }
  const requiredCache = new Map<string, boolean>();
  const isRequired = (stepId: string): boolean => {
    const cached = requiredCache.get(stepId);
    if (cached !== undefined) return cached;
    // Guard against re-entrancy; the graph is already known to be acyclic.
    requiredCache.set(stepId, false);
    const required =
      !steps.get(stepId)?.optional ||
      (dependents.get(stepId) ?? []).some((dependentId) => isRequired(dependentId));
    requiredCache.set(stepId, required);
    return required;
  };

  return [...steps.values()].map((step) => ({ ...step, optional: !isRequired(step.stepId) }));
}

function setupRunStatus(status: string): StepStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "running";
}

// A long-running process is "completed" for workflow purposes once it reports
// running; anything that left the starting/running states (exited, stopped,
// failed) is a failure to keep up.
function processStatus(status: string): StepStatus {
  if (status === "running") return "completed";
  if (status === "starting") return "running";
  return "failed";
}

export class SessionApplicationWorkflowService {
  private chains = new Map<string, Promise<unknown>>();

  async startWorkflow(
    sessionGroupId: string,
    appConfigId: string,
    organizationId: string,
    userId: string | null | undefined,
  ) {
    if (!userId) throw new AuthenticationError();
    const { group, config, app } = await sessionApplicationService.getRunnableApplication(
      sessionGroupId,
      appConfigId,
      organizationId,
      userId,
    );
    const steps = buildSteps(config, app);

    // Only one workflow may be running per app at a time: a second run would
    // overwrite the first run's process ownership (each process row holds a
    // single workflowRunId) and leave the older run stuck. Return the active
    // run if one already exists; a partial unique index backstops the race.
    const active = await this.findActiveRun(sessionGroupId, appConfigId, organizationId);
    if (active) return this.getRun(active.id, organizationId, userId);

    let run: SessionApplicationWorkflowRun;
    try {
      run = await prisma.sessionApplicationWorkflowRun.create({
        data: {
          organizationId,
          sessionGroupId,
          repoId: group.repoId ?? "",
          appConfigId,
          startedByUserId: userId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const racing = await this.findActiveRun(sessionGroupId, appConfigId, organizationId);
        if (racing) return this.getRun(racing.id, organizationId, userId);
      }
      throw err;
    }
    const pending: WorkflowState = {
      steps,
      status: new Map(steps.map((step) => [step.stepId, "pending" as StepStatus])),
    };
    await this.emit(run, "session_application_workflow_started", pending);
    await this.advance(run.id);
    return this.getRun(run.id, organizationId, userId);
  }

  async listWorkflowRuns(sessionGroupId: string, organizationId: string, userId: string | null | undefined) {
    const groupConfig = await this.resolveGroupConfig(sessionGroupId, organizationId, userId, "view");
    const runs = await prisma.sessionApplicationWorkflowRun.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: { startedAt: "desc" },
      take: WORKFLOW_RUN_LIST_LIMIT,
    });
    return Promise.all(runs.map((run) => this.publicRun(run, groupConfig)));
  }

  private findActiveRun(sessionGroupId: string, appConfigId: string, organizationId: string) {
    return prisma.sessionApplicationWorkflowRun.findFirst({
      where: { sessionGroupId, appConfigId, organizationId, status: "running" },
    });
  }

  async getRun(runId: string, organizationId: string, userId: string | null | undefined) {
    const run = await prisma.sessionApplicationWorkflowRun.findFirstOrThrow({
      where: { id: runId, organizationId },
    });
    const groupConfig = await this.resolveGroupConfig(run.sessionGroupId, organizationId, userId, "view");
    return this.publicRun(run, groupConfig);
  }

  // Re-evaluate a workflow after one of its steps settled: fail fast on a
  // required-step failure, dispatch any steps whose dependencies are now met,
  // and finalize once every required step has completed. Serialized per run so
  // concurrent settle callbacks can't double-dispatch a step.
  async advance(runId: string) {
    // advance is mostly invoked fire-and-forget from bridge settle callbacks, so
    // it must never reject into the void. A transient failure here is recovered
    // by the next settle callback re-running advance.
    return this.enqueue(runId, () =>
      this.advanceLocked(runId).catch((err) => {
        console.error(`[workflow] advance failed for run ${runId}:`, err);
      }),
    );
  }

  private async advanceLocked(runId: string) {
    const run = await prisma.sessionApplicationWorkflowRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== "running") return;
    const groupConfig = await this.resolveGroupConfig(run.sessionGroupId, run.organizationId, null, "system");
    const app = groupConfig.config.applications.find((candidate) => candidate.id === run.appConfigId);
    if (!app) {
      await this.finalize(run, "failed", "Application is no longer configured", groupConfig);
      return;
    }
    const steps = buildSteps(groupConfig.config, app);

    let state = await this.computeState(run, steps);
    const failedStep = state.steps.find(
      (step) => !step.optional && state.status.get(step.stepId) === "failed",
    );
    if (failedStep) {
      await this.finalize(run, "failed", `Step "${failedStep.label}" failed`, groupConfig);
      return;
    }

    let dispatchError: string | null = null;
    for (const step of state.steps) {
      if (state.status.get(step.stepId) !== "pending") continue;
      const ready = step.dependsOn.every((dep) => state.status.get(dep) === "completed");
      if (!ready) continue;
      try {
        await this.dispatch(run, step);
      } catch (err) {
        if (step.optional) continue;
        dispatchError = `Failed to start "${step.label}": ${errorMessage(err)}`;
        break;
      }
    }
    if (dispatchError) {
      await this.finalize(run, "failed", dispatchError, groupConfig);
      return;
    }

    state = await this.computeState(run, steps);
    const requiredComplete = state.steps
      .filter((step) => !step.optional)
      .every((step) => state.status.get(step.stepId) === "completed");
    if (requiredComplete) {
      await this.finalize(run, "completed", null, groupConfig);
      return;
    }
    await this.emit(run, "session_application_workflow_updated", state);
  }

  private async dispatch(run: SessionApplicationWorkflowRun, step: WorkflowStep) {
    if (step.kind === "setup") {
      await sessionApplicationService.runSetupScript(
        run.sessionGroupId,
        step.stepId,
        run.organizationId,
        run.startedByUserId,
        { workflowRunId: run.id },
      );
      return;
    }
    await sessionApplicationService.startProcess(
      run.sessionGroupId,
      run.appConfigId,
      step.stepId,
      run.organizationId,
      run.startedByUserId,
      { workflowRunId: run.id },
    );
  }

  private async computeState(
    run: SessionApplicationWorkflowRun,
    steps: WorkflowStep[],
  ): Promise<WorkflowState> {
    const [setupRuns, processes] = await Promise.all([
      prisma.sessionSetupScriptRun.findMany({
        where: { workflowRunId: run.id },
        orderBy: { startedAt: "desc" },
        select: { scriptConfigId: true, status: true },
      }),
      prisma.sessionApplicationProcess.findMany({
        where: { workflowRunId: run.id, appConfigId: run.appConfigId },
        select: { processConfigId: true, status: true },
      }),
    ]);
    const latestSetup = new Map<string, string>();
    for (const setupRun of setupRuns) {
      if (!latestSetup.has(setupRun.scriptConfigId)) {
        latestSetup.set(setupRun.scriptConfigId, setupRun.status);
      }
    }
    const processByConfig = new Map(processes.map((process) => [process.processConfigId, process.status]));

    const status = new Map<string, StepStatus>();
    for (const step of steps) {
      if (step.kind === "setup") {
        const value = latestSetup.get(step.stepId);
        status.set(step.stepId, value ? setupRunStatus(value) : "pending");
      } else {
        const value = processByConfig.get(step.stepId);
        status.set(step.stepId, value ? processStatus(value) : "pending");
      }
    }
    return { steps, status };
  }

  private async finalize(
    run: SessionApplicationWorkflowRun,
    status: "completed" | "failed",
    lastError: string | null,
    groupConfig: GroupConfig,
  ) {
    const updated = await prisma.sessionApplicationWorkflowRun.update({
      where: { id: run.id },
      data: { status, lastError, completedAt: new Date() },
    });
    const app = groupConfig.config.applications.find((candidate) => candidate.id === updated.appConfigId);
    const steps = app ? buildSteps(groupConfig.config, app) : [];
    const state = await this.computeState(updated, steps);
    await this.emit(
      updated,
      status === "completed"
        ? "session_application_workflow_completed"
        : "session_application_workflow_failed",
      state,
    );
  }

  private async emit(run: SessionApplicationWorkflowRun, eventType: EventType, state: WorkflowState) {
    await eventService.create({
      organizationId: run.organizationId,
      scopeType: "session",
      scopeId: run.sessionGroupId,
      eventType,
      payload: { workflow: this.toPublic(run, state) },
      actorType: run.startedByUserId ? "user" : "system",
      actorId: run.startedByUserId ?? "session-application-workflow-service",
    });
  }

  private toPublic(run: SessionApplicationWorkflowRun, state: WorkflowState) {
    return {
      id: run.id,
      sessionGroupId: run.sessionGroupId,
      appConfigId: run.appConfigId,
      status: run.status,
      lastError: run.lastError,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      steps: state.steps.map((step) => ({
        stepId: step.stepId,
        kind: step.kind,
        label: step.label,
        status: state.status.get(step.stepId) ?? "pending",
        dependsOn: step.dependsOn,
        optional: step.optional,
      })),
    };
  }

  private async publicRun(run: SessionApplicationWorkflowRun, groupConfig: GroupConfig) {
    const app = groupConfig.config.applications.find((candidate) => candidate.id === run.appConfigId);
    const steps = app ? buildSteps(groupConfig.config, app) : [];
    const state = await this.computeState(run, steps);
    return this.toPublic(run, state);
  }

  private async resolveGroupConfig(
    sessionGroupId: string,
    organizationId: string,
    userId: string | null | undefined,
    mode: "view" | "system",
  ): Promise<GroupConfig> {
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        organizationId: true,
        ownerUserId: true,
        visibility: true,
        repoId: true,
        repo: { select: { id: true, name: true, remoteUrl: true, setupConfig: true } },
      },
    });
    if (mode === "view") {
      if (!userId) throw new AuthenticationError();
      if (!canViewSessionGroup(group, userId)) {
        throw new AuthorizationError("Not authorized for this session group");
      }
    }
    return {
      group: { id: group.id, organizationId: group.organizationId, repoId: group.repoId },
      config: repoApplicationConfigService.resolveApplicationConfig(group.repo),
    };
  }

  private enqueue<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.chains.get(runId) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(fn);
    this.chains.set(runId, next);
    // then(cleanup, cleanup) rather than void finally(...) so a rejection of
    // `next` is observed here instead of surfacing as an unhandled rejection.
    const cleanup = () => {
      if (this.chains.get(runId) === next) this.chains.delete(runId);
    };
    void next.then(cleanup, cleanup);
    return next;
  }
}

export const sessionApplicationWorkflowService = new SessionApplicationWorkflowService();
