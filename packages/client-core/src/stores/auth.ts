import { useStore } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { useAuthStore as authStore } from "./auth-store.js";
import type { AuthState } from "./auth-store.js";

export { getAuthHeaders, LOCAL_LOGIN_NAME_KEY } from "./auth-store.js";
export type { AuthState, LogoutOptions, OrgMembership } from "./auth-store.js";

/** React binding over the vanilla store from auth-store.ts — mirrors what
 *  zustand's `create` produces, so `useAuthStore(selector)` and
 *  `useAuthStore.getState()` call sites behave exactly as before. */
function useAuthStoreHook<T>(selector: (state: AuthState) => T): T {
  return useStore(authStore, selector);
}

export const useAuthStore = Object.assign(useAuthStoreHook, authStore) as UseBoundStore<
  StoreApi<AuthState>
>;
