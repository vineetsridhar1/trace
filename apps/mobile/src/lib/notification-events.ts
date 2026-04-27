import type { AgentStatus } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

const agentStatusLabel: Record<AgentStatus, string> = {
  active: "Active",
  done: "Done",
  failed: "Failed",
  not_started: "Creating...",
  stopped: "Stopped",
};

export interface LocalNotificationContent {
  title: string;
  body?: string;
  deepLink: string;
}

export interface BridgeAccessNotificationPayload {
  ownerUserId: string;
  requestId: string;
  runtimeLabel: string;
  requesterName: string;
  status: "pending" | "approved" | "denied";
}

export function buildSessionAgentStatusNotification(input: {
  sessionName?: string | null;
  sessionGroupId?: string | null;
  sessionId: string;
  agentStatus: AgentStatus;
}): LocalNotificationContent {
  const name = input.sessionName?.trim() || "Untitled session";
  const label = agentStatusLabel[input.agentStatus] ?? input.agentStatus;

  return {
    title: `"${name}" is now ${label}`,
    deepLink: `trace://sessions/${input.sessionGroupId ?? ""}/${input.sessionId}`,
  };
}

export function parseBridgeAccessNotificationPayload(
  payload: unknown,
  actorName?: string | null,
): BridgeAccessNotificationPayload | null {
  const data = asJsonObject(payload);
  if (!data) return null;
  if (typeof data.ownerUserId !== "string" || typeof data.requestId !== "string") return null;
  if (data.status !== "pending" && data.status !== "approved" && data.status !== "denied") {
    return null;
  }

  const requesterUser = asJsonObject(data.requesterUser);
  const runtimeLabel =
    typeof data.runtimeLabel === "string" && data.runtimeLabel.trim() ? data.runtimeLabel.trim() : "your bridge";
  const requesterName =
    typeof requesterUser?.name === "string" && requesterUser.name.trim()
      ? requesterUser.name.trim()
      : actorName?.trim() || "A teammate";

  return {
    ownerUserId: data.ownerUserId,
    requestId: data.requestId,
    runtimeLabel,
    requesterName,
    status: data.status,
  };
}

export function buildBridgeAccessRequestedNotification(input: {
  requesterName: string;
  runtimeLabel: string;
}): LocalNotificationContent {
  return {
    title: `${input.requesterName} requested bridge access`,
    body: `Review access for ${input.runtimeLabel}`,
    deepLink: "trace://connections",
  };
}
