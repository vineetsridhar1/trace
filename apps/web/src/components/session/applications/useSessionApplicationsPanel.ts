import { useEffect } from "react";
import { useSessionApplicationActions } from "./useSessionApplicationActions";
import { useSessionApplicationsData } from "./useSessionApplicationsData";

export function useSessionApplicationsPanel(
  sessionGroupId: string,
  onOpenEndpoint: (url: string) => void,
) {
  const data = useSessionApplicationsData(sessionGroupId);
  const actions = useSessionApplicationActions({
    groupKind: data.groupKind,
    loadProcessLogs: data.loadProcessLogs,
    onOpenEndpoint,
    sessionGroupId,
  });

  useEffect(() => {
    void data.refresh().catch(actions.reportError);
  }, [actions.reportError, data.refresh]);

  return {
    ...data,
    ...actions,
    refresh: () => void data.refresh().catch(actions.reportError),
  };
}
