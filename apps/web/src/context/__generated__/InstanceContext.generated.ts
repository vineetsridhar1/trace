import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;

export type ConnectToInstanceMutationVariables = {
  instanceId: string;
  password?: string | null;
};

export type ConnectToInstanceMutation = {
  __typename?: "Mutation";
  connectToInstance: {
    __typename?: "ConnectToInstancePayload";
    instanceId: string;
    serverId: string;
    channels: Array<{
      __typename?: "InstanceChannel";
      id: string;
      name: string;
      type: string;
      baseBranch?: string | null;
      defaultRepoPath?: string | null;
    }>;
  };
};

export type RelayActionMutationVariables = {
  instanceId: string;
  action: string;
  params: unknown;
};

export type RelayActionMutation = {
  __typename?: "Mutation";
  relayAction: {
    __typename?: "RelayActionResult";
    success: boolean;
    data?: unknown | null;
    error?: string | null;
  };
};

export type InstanceStatusChangedSubscriptionVariables = {
  serverId: string;
};

export type InstanceStatusChangedSubscription = {
  __typename?: "Subscription";
  instanceStatusChanged: {
    __typename?: "InstanceStatusPayload";
    instanceId: string;
    isOnline: boolean;
  };
};

export const ConnectToInstanceDocument = gql`
  mutation ConnectToInstance($instanceId: ID!, $password: String) {
    connectToInstance(instanceId: $instanceId, password: $password) {
      instanceId
      serverId
      channels {
        id
        name
        type
        baseBranch
        defaultRepoPath
      }
    }
  }
`;

export function useConnectToInstanceMutation(
  baseOptions?: Apollo.MutationHookOptions<
    ConnectToInstanceMutation,
    ConnectToInstanceMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    ConnectToInstanceMutation,
    ConnectToInstanceMutationVariables
  >(ConnectToInstanceDocument, options);
}

export const RelayActionDocument = gql`
  mutation RelayAction($instanceId: ID!, $action: String!, $params: JSON!) {
    relayAction(instanceId: $instanceId, action: $action, params: $params) {
      success
      data
      error
    }
  }
`;

export function useRelayActionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RelayActionMutation,
    RelayActionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<RelayActionMutation, RelayActionMutationVariables>(
    RelayActionDocument,
    options,
  );
}

export const InstanceStatusChangedDocument = gql`
  subscription InstanceStatusChanged($serverId: ID!) {
    instanceStatusChanged(serverId: $serverId) {
      instanceId
      isOnline
    }
  }
`;

export function useInstanceStatusChangedSubscription(
  baseOptions?: Apollo.SubscriptionHookOptions<
    InstanceStatusChangedSubscription,
    InstanceStatusChangedSubscriptionVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useSubscription<
    InstanceStatusChangedSubscription,
    InstanceStatusChangedSubscriptionVariables
  >(InstanceStatusChangedDocument, options);
}
