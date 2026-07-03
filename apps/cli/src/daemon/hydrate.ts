import type { AnyVariables, DocumentInput } from "@urql/core";
import type { ClientRuntime } from "../runtime.js";
import {
  HYDRATE_CHANNELS_QUERY,
  HYDRATE_REPOS_QUERY,
  HYDRATE_SESSIONS_QUERY,
  HYDRATE_TICKETS_QUERY,
} from "../documents.js";

async function fetchList<T>(
  runtime: ClientRuntime,
  document: DocumentInput<Record<string, unknown>, AnyVariables>,
  orgId: string,
  field: string,
): Promise<Array<T & { id: string }>> {
  const result = await runtime.gql.query(document, { orgId }).toPromise();
  if (result.error) {
    throw new Error(`Hydration query ${field} failed: ${result.error.message}`);
  }
  const rows = (result.data as Record<string, unknown> | undefined)?.[field];
  return Array.isArray(rows) ? (rows as Array<T & { id: string }>) : [];
}

/** Fill the entity store for the active org so snapshot methods answer from
 *  memory. Hydrate-on-initialize (vs lazy-per-method) because the session
 *  switcher needs sessions immediately after the handshake. */
export async function hydrateOrg(runtime: ClientRuntime, orgId: string): Promise<void> {
  const [channels, sessions, tickets, repos] = await Promise.all([
    fetchList(runtime, HYDRATE_CHANNELS_QUERY, orgId, "channels"),
    fetchList<{ lastMessageAt?: string | null; updatedAt?: string }>(
      runtime,
      HYDRATE_SESSIONS_QUERY,
      orgId,
      "sessions",
    ),
    fetchList(runtime, HYDRATE_TICKETS_QUERY, orgId, "tickets"),
    fetchList(runtime, HYDRATE_REPOS_QUERY, orgId, "repos"),
  ]);

  const { upsertMany } = runtime.stores.entity.getState();
  upsertMany(
    "sessions",
    sessions.map((session) => ({
      ...session,
      _sortTimestamp: session.lastMessageAt ?? session.updatedAt,
    })) as Parameters<typeof upsertMany<"sessions">>[1],
  );
  upsertMany("channels", channels as Parameters<typeof upsertMany<"channels">>[1]);
  upsertMany("tickets", tickets as Parameters<typeof upsertMany<"tickets">>[1]);
  upsertMany("repos", repos as Parameters<typeof upsertMany<"repos">>[1]);
}
