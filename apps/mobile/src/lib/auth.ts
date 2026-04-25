import { useAuthStore, useEntityStore } from "@trace/client-core";
import { recreateClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";

/**
 * Detect a 401-equivalent from urql's `CombinedError`. Covers:
 *  - HTTP 401 surfaced via `networkError` (fetch transport)
 *  - GraphQL `UNAUTHENTICATED` / `UNAUTHORIZED` codes from the server
 *  - The graphql-ws CloseEvent code 4401 (Apollo's auth-required convention)
 *
 * Moved out of `useHydrate.ts` so focused subscriptions (e.g. the session
 * events subscription in `useSessionEvents`) can handle mid-session token
 * expiry the same way hydration does.
 */
export function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    response?: { status?: number };
    networkError?: { statusCode?: number; message?: string };
    graphQLErrors?: Array<{ extensions?: { code?: string } }>;
    code?: number;
    message?: string;
  };
  if (e.response?.status === 401) return true;
  if (e.networkError?.statusCode === 401) return true;
  if (typeof e.networkError?.message === "string" && /\b401\b/.test(e.networkError.message)) {
    return true;
  }
  if (
    e.graphQLErrors?.some(
      (g) => g.extensions?.code === "UNAUTHENTICATED" || g.extensions?.code === "UNAUTHORIZED",
    )
  ) {
    return true;
  }
  if (e.code === 4401 || e.code === 4403) return true;
  return typeof e.message === "string" && /\b401\b|unauthor/i.test(e.message);
}

/**
 * Reset the entity store and sign the user out. Used by both initial
 * hydration and any focused subscription that hits a 401 mid-session.
 */
export async function handleUnauthorized(): Promise<void> {
  useEntityStore.getState().reset();
  await useAuthStore.getState().logout();
}

/**
 * Runs the full mobile sign-out cleanup before clearing auth state. This keeps
 * UI state and the current GraphQL client in sync across every sign-out entry point.
 */
export async function handleMobileSignOut(): Promise<void> {
  useMobileUIStore.getState().reset();
  recreateClient();
  await useAuthStore.getState().logout();
}
