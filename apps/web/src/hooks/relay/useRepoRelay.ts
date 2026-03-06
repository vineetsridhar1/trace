import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  ListRepoFilesParams,
  ListRepoFilesResult,
  SuggestScriptsParams,
  SuggestScriptsResult,
  ValidateRepoParams,
  ValidateRepoResult,
  ListSlashCommandsParams,
  ListSlashCommandsResult,
  ReadProductDocFileParams,
  ReadProductDocFileResult,
  WriteProductDocFileParams,
} from "./types";

export function useRepoRelay() {
  const { relayAction } = useInstance();

  const listRepoFiles = useCallback(
    (params: ListRepoFilesParams) =>
      typedRelay<ListRepoFilesResult>(relayAction, "listRepoFiles", params),
    [relayAction],
  );

  const suggestScripts = useCallback(
    (params: SuggestScriptsParams) =>
      typedRelay<SuggestScriptsResult>(relayAction, "suggestScripts", params),
    [relayAction],
  );

  const validateRepo = useCallback(
    (params: ValidateRepoParams) =>
      typedRelay<ValidateRepoResult>(relayAction, "validateRepo", params),
    [relayAction],
  );

  const listSlashCommands = useCallback(
    (params: ListSlashCommandsParams) =>
      typedRelay<ListSlashCommandsResult>(relayAction, "listSlashCommands", params),
    [relayAction],
  );

  const readProductDocFile = useCallback(
    (params: ReadProductDocFileParams) =>
      typedRelay<ReadProductDocFileResult>(relayAction, "readProductDocFile", params),
    [relayAction],
  );

  const writeProductDocFile = useCallback(
    (params: WriteProductDocFileParams) =>
      typedRelay(relayAction, "writeProductDocFile", params),
    [relayAction],
  );

  return {
    listRepoFiles,
    suggestScripts,
    validateRepo,
    listSlashCommands,
    readProductDocFile,
    writeProductDocFile,
  };
}
