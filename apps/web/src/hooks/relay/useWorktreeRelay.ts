import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  DeleteWorktreeParams,
  DeleteWorktreeResult,
  CheckWorktreeExistsParams,
  CheckWorktreeExistsResult,
  MergeWorktreeParams,
  MergeWorktreeResult,
  CommitWorktreeChangesParams,
  CommitWorktreeChangesResult,
  GetWorktreeDiffParams,
  GetWorktreeDiffResult,
  GetWorktreeBranchParams,
  GetWorktreeBranchResult,
} from "./types";

export function useWorktreeRelay() {
  const { relayAction } = useInstance();

  const deleteWorktree = useCallback(
    (params: DeleteWorktreeParams) =>
      typedRelay<DeleteWorktreeResult>(relayAction, "deleteWorktree", params),
    [relayAction],
  );

  const checkWorktreeExists = useCallback(
    (params: CheckWorktreeExistsParams) =>
      typedRelay<CheckWorktreeExistsResult>(relayAction, "checkWorktreeExists", params),
    [relayAction],
  );

  const mergeWorktree = useCallback(
    (params: MergeWorktreeParams) =>
      typedRelay<MergeWorktreeResult>(relayAction, "mergeWorktree", params),
    [relayAction],
  );

  const commitWorktreeChanges = useCallback(
    (params: CommitWorktreeChangesParams) =>
      typedRelay<CommitWorktreeChangesResult>(relayAction, "commitWorktreeChanges", params),
    [relayAction],
  );

  const getWorktreeDiff = useCallback(
    (params: GetWorktreeDiffParams) =>
      typedRelay<GetWorktreeDiffResult>(relayAction, "getWorktreeDiff", params),
    [relayAction],
  );

  const getWorktreeBranch = useCallback(
    (params: GetWorktreeBranchParams) =>
      typedRelay<GetWorktreeBranchResult>(relayAction, "getWorktreeBranch", params),
    [relayAction],
  );

  return {
    deleteWorktree,
    checkWorktreeExists,
    mergeWorktree,
    commitWorktreeChanges,
    getWorktreeDiff,
    getWorktreeBranch,
  };
}
