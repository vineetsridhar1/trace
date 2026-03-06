import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { gql, useSubscription } from "@apollo/client";
import {
  useConnectToInstanceMutation,
  useRelayActionMutation,
} from "./__generated__/InstanceContext.generated";
import { useInstanceStore } from "../stores/instanceStore";

export interface RelayActionResult {
  success: boolean;
  data?: unknown | null;
  error?: string | null;
}

const GQL_CONNECT_TO_INSTANCE = gql`
  mutation ConnectToInstance($instanceId: ID!, $password: String) {
    connectToInstance(instanceId: $instanceId, password: $password) {
      instanceId
      serverId
      channels {
        id
        name
        type
        baseBranch
      }
    }
  }
`;

const GQL_RELAY_ACTION = gql`
  mutation RelayAction($instanceId: ID!, $action: String!, $params: JSON!) {
    relayAction(instanceId: $instanceId, action: $action, params: $params) {
      success
      data
      error
    }
  }
`;

const GQL_INSTANCE_STATUS_CHANGED = gql`
  subscription InstanceStatusChanged($serverId: ID!) {
    instanceStatusChanged(serverId: $serverId) {
      instanceId
      isOnline
    }
  }
`;

interface InstanceContextValue {
  connectedInstanceId: string | null;
  instanceStatus: "connected" | "connecting" | "disconnected";
  connectToInstance: (
    instanceId: string,
    password?: string,
  ) => Promise<void>;
  relayAction: (
    action: string,
    params: Record<string, unknown>,
  ) => Promise<RelayActionResult>;
}

const InstanceContext = createContext<InstanceContextValue>({
  connectedInstanceId: null,
  instanceStatus: "disconnected",
  connectToInstance: async () => {},
  relayAction: async () => ({ success: false, error: "Not connected" }),
});

interface InstanceProviderProps {
  children: ReactNode;
}

export function InstanceProvider({
  children,
}: InstanceProviderProps) {
  const connectedInstanceId = useInstanceStore((s) => s.connectedInstanceId);
  const connectedServerId = useInstanceStore((s) => s.connectedServerId);
  const instanceStatus = useInstanceStore((s) => s.instanceStatus);
  const [executeConnect] = useConnectToInstanceMutation();
  const [executeRelay] = useRelayActionMutation();

  const { data: statusData } = useSubscription(GQL_INSTANCE_STATUS_CHANGED, {
    variables: { serverId: connectedServerId ?? "" },
    skip: !connectedServerId || !connectedInstanceId,
  });

  useEffect(() => {
    if (!statusData?.instanceStatusChanged) return;
    const { instanceId, isOnline } = statusData.instanceStatusChanged;
    const currentId = useInstanceStore.getState().connectedInstanceId;
    if (instanceId !== currentId) return;

    useInstanceStore
      .getState()
      .setInstanceStatus(isOnline ? "connected" : "disconnected");
  }, [statusData]);

  const connectToInstance = useCallback(
    async (instanceId: string, password?: string) => {
      useInstanceStore.getState().setInstanceStatus("connecting");
      try {
        const { data, errors } = await executeConnect({
          variables: { instanceId, password },
        });

        if (errors?.length) {
          useInstanceStore.getState().setInstanceStatus("disconnected");
          throw new Error(errors[0].message);
        }

        if (data?.connectToInstance) {
          const result = data.connectToInstance;
          useInstanceStore.getState().addAuthorizedInstance(instanceId);
          useInstanceStore.getState().setConnectedInstance(instanceId);
          useInstanceStore.getState().setConnectedServerId(result.serverId);
          useInstanceStore.getState().setChannels(
            (result.channels ?? []).map(({ id, name, type, baseBranch }) => ({
              id,
              name,
              type,
              baseBranch: baseBranch ?? null,
            })),
          );
          useInstanceStore.getState().setInstanceStatus("connected");
        }
      } catch (err) {
        useInstanceStore.getState().setInstanceStatus("disconnected");
        throw err;
      }
    },
    [executeConnect],
  );

  const relayAction = useCallback(
    async (
      action: string,
      params: Record<string, unknown>,
    ): Promise<RelayActionResult> => {
      const currentId = useInstanceStore.getState().connectedInstanceId;
      if (!currentId) {
        return { success: false, error: "Not connected to an instance" };
      }

      const { data, errors } = await executeRelay({
        variables: { instanceId: currentId, action, params },
      });

      if (errors?.length) {
        return { success: false, error: errors[0].message };
      }

      return data!.relayAction;
    },
    [executeRelay],
  );

  const value = useMemo<InstanceContextValue>(
    () => ({
      connectedInstanceId,
      instanceStatus,
      connectToInstance,
      relayAction,
    }),
    [connectedInstanceId, instanceStatus, connectToInstance, relayAction],
  );

  return (
    <InstanceContext.Provider value={value}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  return useContext(InstanceContext);
}
