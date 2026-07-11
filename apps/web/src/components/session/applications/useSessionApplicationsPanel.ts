import { useEffect } from "react";
import { useSessionApplicationActions } from "./useSessionApplicationActions";
import { useSessionApplicationsData } from "./useSessionApplicationsData";

export function useSessionApplicationsPanel(sessionGroupId: string) {
  const data = useSessionApplicationsData(sessionGroupId);
  const actions = useSessionApplicationActions({
    groupKind: data.groupKind,
    loadProcessLogs: data.loadProcessLogs,
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
