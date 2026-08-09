import type { IntegrationExecutionIdentity, IntegrationRequestPhase } from "@prisma/client";
import { prisma } from "../lib/db.js";

export type IntegrationRequestAuditStart = {
  id: string;
  organizationId: string;
  sessionGroupId: string;
  bindingId: string;
  connectionId: string;
  userId: string;
  executionIdentity: IntegrationExecutionIdentity;
  method: string;
  path: string;
  startedAt: Date;
};

export interface IntegrationRequestAuditStore {
  start(input: IntegrationRequestAuditStart): Promise<void>;
  complete(
    input: IntegrationRequestAuditStart & {
      phase: Exclude<IntegrationRequestPhase, "started">;
      status?: number;
      error?: string;
      timestamp: Date;
      durationMs: number;
    },
  ): Promise<void>;
}

export const integrationRequestAuditStore: IntegrationRequestAuditStore = {
  async start(input) {
    await prisma.integrationRequestAuditEntry.create({
      data: {
        requestId: input.id,
        organizationId: input.organizationId,
        sessionGroupId: input.sessionGroupId,
        bindingId: input.bindingId,
        connectionId: input.connectionId,
        userId: input.userId,
        executionIdentity: input.executionIdentity,
        requestMethod: input.method,
        requestPath: input.path,
        phase: "started",
        timestamp: input.startedAt,
      },
    });
  },

  async complete(input) {
    await prisma.integrationRequestAuditEntry.create({
      data: {
        requestId: input.id,
        organizationId: input.organizationId,
        sessionGroupId: input.sessionGroupId,
        bindingId: input.bindingId,
        connectionId: input.connectionId,
        userId: input.userId,
        executionIdentity: input.executionIdentity,
        requestMethod: input.method,
        requestPath: input.path,
        phase: input.phase,
        responseStatus: input.status,
        error: input.error,
        timestamp: input.timestamp,
        durationMs: input.durationMs,
      },
    });
  },
};
