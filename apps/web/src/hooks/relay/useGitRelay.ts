import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  ListRepoBranchesParams,
  ListRepoBranchesResult,
  CheckBranchesMergedParams,
  CheckBranchesMergedResult,
  CheckMainStatusParams,
  CheckMainStatusResult,
  PullMainParams,
  CreateGitBranchParams,
} from "./types";

export function useGitRelay() {
  const { relayAction } = useInstance();

  const listRepoBranches = useCallback(
    (params: ListRepoBranchesParams) =>
      typedRelay<ListRepoBranchesResult>(relayAction, "listRepoBranches", params),
    [relayAction],
  );

  const checkBranchesMerged = useCallback(
    (params: CheckBranchesMergedParams) =>
      typedRelay<CheckBranchesMergedResult>(relayAction, "checkBranchesMerged", params),
    [relayAction],
  );

  const checkMainStatus = useCallback(
    (params: CheckMainStatusParams) =>
      typedRelay<CheckMainStatusResult>(relayAction, "checkMainStatus", params),
    [relayAction],
  );

  const pullMain = useCallback(
    (params: PullMainParams) =>
      typedRelay(relayAction, "pullMain", params),
    [relayAction],
  );

  const createGitBranch = useCallback(
    (params: CreateGitBranchParams) =>
      typedRelay(relayAction, "createGitBranch", params),
    [relayAction],
  );

  return {
    listRepoBranches,
    checkBranchesMerged,
    checkMainStatus,
    pullMain,
    createGitBranch,
  };
}
