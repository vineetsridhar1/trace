import { asJsonObject } from "./json.js";

/**
 * `session_output` subtype for a dispatch that did not land against a runtime
 * the directory still confirms is alive.
 *
 * Shared because the string is load-bearing in four places across three
 * packages — the server emits it, client-core treats it as a connection event,
 * and both clients render it. A typo in any one of those silently breaks the
 * chain with no compile error.
 */
export const DELIVERY_DEFERRED_OUTPUT_TYPE = "delivery_deferred";

/** Operations whose deferred command is re-sent by the user, not by Trace. */
const USER_RETRIED_OPERATIONS = new Set(["run", "send"]);

/**
 * Copy for a deferred delivery badge.
 *
 * `persistConnectionFailure` runs for ten different operations, only two of
 * which the user initiated by typing. Telling someone to "send again" after a
 * deferred workspace upgrade is wrong, and misleading recovery advice is the
 * whole class of bug this event exists to avoid.
 */
export function deferredDeliveryMessage(payload: unknown): string {
  const operation = asJsonObject(payload)?.operation;
  if (typeof operation === "string" && USER_RETRIED_OPERATIONS.has(operation)) {
    return "Couldn't reach the workspace, so this message hasn't run. Send it again to retry.";
  }
  return "Couldn't reach the workspace, so that request didn't run.";
}
