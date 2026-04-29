import { asJsonObject, type JsonObject } from "@trace/shared";

export type SessionStatusRowTone = "success" | "error" | "stop" | "info";

export interface SessionStatusRow {
  tone: SessionStatusRowTone;
  title: string;
  detail?: string;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseJsonObject(value: string): JsonObject | undefined {
  try {
    return asJsonObject(JSON.parse(value));
  } catch {
    return undefined;
  }
}

/**
 * Extracts the useful human message from adapter errors. Some tools encode
 * provider errors as JSON strings, sometimes nested under error.message.
 */
export function extractSessionErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    const parsed = parseJsonObject(value);
    if (parsed) return extractSessionErrorMessage(parsed) ?? value.trim();
    return value.trim() || undefined;
  }

  const object = asJsonObject(value);
  if (!object) return undefined;

  const nestedError = asJsonObject(object.error);
  return (
    extractSessionErrorMessage(nestedError?.message) ??
    extractSessionErrorMessage(object.message) ??
    firstString(object.reason, object.status)
  );
}

function connectionError(payload: JsonObject): string | undefined {
  const connection = asJsonObject(payload.connection);
  return firstString(connection?.lastError, payload.message, payload.reason);
}

export function statusRowForSessionOutput(payload: JsonObject): SessionStatusRow | null {
  switch (payload.type) {
    case "result":
      if (payload.subtype === "error") {
        return {
          tone: "error",
          title: "Run failed",
          detail: extractSessionErrorMessage(payload.error ?? payload.message ?? payload.result),
        };
      }
      return { tone: "success", title: "Run ended" };
    case "error":
      return {
        tone: "error",
        title: "Run failed",
        detail: extractSessionErrorMessage(payload.message ?? payload.error),
      };
    case "connection_lost":
      return {
        tone: "error",
        title: "Runtime disconnected",
        detail: connectionError(payload),
      };
    case "recovery_failed":
      return {
        tone: "error",
        title: "Recovery failed",
        detail: connectionError(payload),
      };
    case "bridge_complete":
      if (payload.subtype === "error" || payload.agentStatus === "failed") {
        return {
          tone: "error",
          title: "Run failed",
          detail: extractSessionErrorMessage(payload.error ?? payload.message),
        };
      }
      return { tone: "success", title: "Run ended" };
    default:
      return null;
  }
}

export function statusRowForSessionTermination(payload: JsonObject): SessionStatusRow | null {
  if (payload.reason === "bridge_complete" && payload.agentStatus !== "failed") {
    return null;
  }

  if (payload.reason === "workspace_failed") {
    return {
      tone: "error",
      title: "Workspace setup failed",
      detail: extractSessionErrorMessage(payload.error ?? payload.message),
    };
  }

  if (payload.reason === "manual_stop" || payload.agentStatus === "stopped") {
    return { tone: "stop", title: "Stopped by user" };
  }

  if (payload.agentStatus === "failed" || payload.status === "failed") {
    return {
      tone: "error",
      title: "Session failed",
      detail: extractSessionErrorMessage(payload.error ?? payload.message ?? payload.reason),
    };
  }

  if (payload.sessionStatus === "merged") {
    return { tone: "success", title: "Session merged" };
  }

  if (payload.agentStatus === "done") {
    return { tone: "success", title: "Session completed" };
  }

  return { tone: "info", title: "Session terminated" };
}
