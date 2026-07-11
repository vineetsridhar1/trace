import type { EndpointTrafficCaptureMode, SessionEndpointAccessMode } from "@prisma/client";
import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { buildEndpointUrl } from "../services/endpoint-utils.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { sessionApplicationWorkflowService } from "../services/session-application-workflow.js";

function requireUser(ctx: Context): string {
  if (!ctx.userId) throw new AuthenticationError();
  return ctx.userId;
}

export const sessionApplicationQueries = {
  sessionSetupScriptRuns: (_parent: unknown, args: { sessionGroupId: string }, ctx: Context) =>
    sessionApplicationService.listSetupScriptRuns(
      args.sessionGroupId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  sessionApplicationProcesses: (
    _parent: unknown,
    args: { sessionGroupId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.listProcesses(args.sessionGroupId, requireOrgContext(ctx), requireUser(ctx)),
  sessionApplicationWorkflowRuns: (
    _parent: unknown,
    args: { sessionGroupId: string },
    ctx: Context,
  ) =>
    sessionApplicationWorkflowService.listWorkflowRuns(
      args.sessionGroupId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  sessionApplicationLogs: (
    _parent: unknown,
    args: { processId: string; limit?: number | null; beforeSequence?: number | null },
    ctx: Context,
  ) =>
    sessionApplicationService.listLogs(args.processId, requireOrgContext(ctx), requireUser(ctx), {
      limit: args.limit,
      beforeSequence: args.beforeSequence,
    }),
  sessionEndpoints: (_parent: unknown, args: { sessionGroupId: string }, ctx: Context) =>
    sessionApplicationService.listEndpoints(
      args.sessionGroupId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  endpointTraffic: (
    _parent: unknown,
    args: { endpointId: string; limit?: number | null; before?: Date | null },
    ctx: Context,
  ) =>
    sessionApplicationService.listTraffic(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
      {
        limit: args.limit,
        before: args.before,
      },
    ),
};

export const sessionApplicationMutations = {
  runSessionGroupSetupScript: (
    _parent: unknown,
    args: { sessionGroupId: string; scriptId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.runSetupScript(
      args.sessionGroupId,
      args.scriptId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  startSessionApplication: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.startApplication(
      args.sessionGroupId,
      args.appConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  startSessionApplicationWorkflow: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationWorkflowService.startWorkflow(
      args.sessionGroupId,
      args.appConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  stopSessionApplication: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.stopApplication(
      args.sessionGroupId,
      args.appConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  startSessionProcess: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string; processConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.startProcess(
      args.sessionGroupId,
      args.appConfigId,
      args.processConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  stopSessionProcess: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string; processConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.stopProcess(
      args.sessionGroupId,
      args.appConfigId,
      args.processConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  restartSessionProcess: (
    _parent: unknown,
    args: { sessionGroupId: string; appConfigId: string; processConfigId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.restartProcess(
      args.sessionGroupId,
      args.appConfigId,
      args.processConfigId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  enableSessionEndpointForwarding: (
    _parent: unknown,
    args: { endpointId: string; accessMode?: SessionEndpointAccessMode | null },
    ctx: Context,
  ) =>
    sessionApplicationService.enableEndpoint(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
      args.accessMode,
    ),
  disableSessionEndpointForwarding: (
    _parent: unknown,
    args: { endpointId: string },
    ctx: Context,
  ) =>
    sessionApplicationService.disableEndpoint(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  rotateSessionEndpoint: (_parent: unknown, args: { endpointId: string }, ctx: Context) =>
    sessionApplicationService.rotateEndpoint(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  updateSessionEndpointTrafficCapture: (
    _parent: unknown,
    args: { endpointId: string; mode: EndpointTrafficCaptureMode },
    ctx: Context,
  ) =>
    sessionApplicationService.updateTrafficCapture(
      args.endpointId,
      args.mode,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  clearEndpointTraffic: (_parent: unknown, args: { endpointId: string }, ctx: Context) =>
    sessionApplicationService.clearTraffic(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  createSessionEndpointPreview: (_parent: unknown, args: { endpointId: string }, ctx: Context) =>
    sessionApplicationService.createEndpointPreview(
      args.endpointId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
  publishAppSession: (_parent: unknown, args: { sessionGroupId: string }, ctx: Context) =>
    sessionApplicationService.publishAppSession(
      args.sessionGroupId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
};

export const sessionApplicationTypeResolvers = {
  SessionEndpoint: {
    url: (endpoint: { key: string }) => buildEndpointUrl(endpoint.key),
  },
  SessionApplicationProcess: {
    endpoints: (process: {
      sessionGroupId: string;
      appConfigId: string;
      processConfigId: string;
    }) => sessionApplicationService.listProcessEndpoints(process),
  },
};
