import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  GetLocalConfigParams,
  GetLocalConfigResult,
  SetLocalConfigParams,
  GetAllLocalConfigsResult,
  DeleteLocalConfigParams,
  GetGlobalConfigResult,
  SetGlobalConfigParams,
  AllocatePortsParams,
  AllocatePortsResult,
  ReleasePortsParams,
  CheckRunningProcessesParams,
  CheckRunningProcessesResult,
} from "./types";

export function useMiscRelay() {
  const { relayAction } = useInstance();

  const getLocalConfig = useCallback(
    (params: GetLocalConfigParams) =>
      typedRelay<GetLocalConfigResult>(relayAction, "getLocalConfig", params),
    [relayAction],
  );

  const setLocalConfig = useCallback(
    (params: SetLocalConfigParams) =>
      typedRelay(relayAction, "setLocalConfig", params),
    [relayAction],
  );

  const getAllLocalConfigs = useCallback(
    () => typedRelay<GetAllLocalConfigsResult>(relayAction, "getAllLocalConfigs", {}),
    [relayAction],
  );

  const deleteLocalConfig = useCallback(
    (params: DeleteLocalConfigParams) =>
      typedRelay(relayAction, "deleteLocalConfig", params),
    [relayAction],
  );

  const getGlobalConfig = useCallback(
    () => typedRelay<GetGlobalConfigResult>(relayAction, "getGlobalConfig", {}),
    [relayAction],
  );

  const setGlobalConfig = useCallback(
    (params: SetGlobalConfigParams) =>
      typedRelay(relayAction, "setGlobalConfig", params),
    [relayAction],
  );

  const allocatePorts = useCallback(
    (params: AllocatePortsParams) =>
      typedRelay<AllocatePortsResult>(relayAction, "allocatePorts", params),
    [relayAction],
  );

  const releasePorts = useCallback(
    (params: ReleasePortsParams) =>
      typedRelay(relayAction, "releasePorts", params),
    [relayAction],
  );

  const checkRunningProcesses = useCallback(
    (params: CheckRunningProcessesParams) =>
      typedRelay<CheckRunningProcessesResult>(relayAction, "checkRunningProcesses", params),
    [relayAction],
  );

  return {
    getLocalConfig,
    setLocalConfig,
    getAllLocalConfigs,
    deleteLocalConfig,
    getGlobalConfig,
    setGlobalConfig,
    allocatePorts,
    releasePorts,
    checkRunningProcesses,
  };
}
