import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  CheckGhAuthResult,
  PushWorktreeBranchParams,
  EnsureWorktreeFromRemoteParams,
  EnsureWorktreeFromRemoteResult,
  CheckPRStatusesLocalParams,
  CheckPRStatusesLocalResult,
  CheckPRCILocalParams,
  CheckPRCILocalResult,
  ListPullRequestsParams,
  ListPullRequestsResult,
  CheckoutPullRequestParams,
  CheckoutPullRequestResult,
  DetectInstalledAppsResult,
  OpenInAppParams,
} from "./types";

export function useGitHubRelay() {
  const { relayAction } = useInstance();

  const checkGhAuth = useCallback(
    () => typedRelay<CheckGhAuthResult>(relayAction, "checkGhAuth", {}),
    [relayAction],
  );

  const pushWorktreeBranch = useCallback(
    (params: PushWorktreeBranchParams) =>
      typedRelay(relayAction, "pushWorktreeBranch", params),
    [relayAction],
  );

  const ensureWorktreeFromRemote = useCallback(
    (params: EnsureWorktreeFromRemoteParams) =>
      typedRelay<EnsureWorktreeFromRemoteResult>(relayAction, "ensureWorktreeFromRemote", params),
    [relayAction],
  );

  const checkPRStatusesLocal = useCallback(
    (params: CheckPRStatusesLocalParams) =>
      typedRelay<CheckPRStatusesLocalResult>(relayAction, "checkPRStatusesLocal", params),
    [relayAction],
  );

  const checkPRCILocal = useCallback(
    (params: CheckPRCILocalParams) =>
      typedRelay<CheckPRCILocalResult>(relayAction, "checkPRCILocal", params),
    [relayAction],
  );

  const listPullRequests = useCallback(
    (params: ListPullRequestsParams) =>
      typedRelay<ListPullRequestsResult>(relayAction, "listPullRequests", params),
    [relayAction],
  );

  const checkoutPullRequest = useCallback(
    (params: CheckoutPullRequestParams) =>
      typedRelay<CheckoutPullRequestResult>(relayAction, "checkoutPullRequest", params),
    [relayAction],
  );

  const detectInstalledApps = useCallback(
    () => typedRelay<DetectInstalledAppsResult>(relayAction, "detectInstalledApps", {}),
    [relayAction],
  );

  const openInApp = useCallback(
    (params: OpenInAppParams) =>
      typedRelay(relayAction, "openInApp", params),
    [relayAction],
  );

  return {
    checkGhAuth,
    pushWorktreeBranch,
    ensureWorktreeFromRemote,
    checkPRStatusesLocal,
    checkPRCILocal,
    listPullRequests,
    checkoutPullRequest,
    detectInstalledApps,
    openInApp,
  };
}
