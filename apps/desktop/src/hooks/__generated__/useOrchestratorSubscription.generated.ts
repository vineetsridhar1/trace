import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type OrchestratorTriggerSubscriptionVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
}>;


export type OrchestratorTriggerSubscription = { __typename?: 'Subscription', orchestratorTrigger: { __typename?: 'OrchestratorTriggerPayload', channelId: string, workspaceId: string, newStatus: string, ticketTitle: string, orchestratorWorkspaceId: string } };


export const OrchestratorTriggerDocument = gql`
    subscription OrchestratorTrigger($serverId: ID!) {
  orchestratorTrigger(serverId: $serverId) {
    channelId
    workspaceId
    newStatus
    ticketTitle
    orchestratorWorkspaceId
  }
}
    `;

/**
 * __useOrchestratorTriggerSubscription__
 *
 * To run a query within a React component, call `useOrchestratorTriggerSubscription` and pass it any options that fit your needs.
 * When your component renders, `useOrchestratorTriggerSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOrchestratorTriggerSubscription({
 *   variables: {
 *      serverId: // value for 'serverId'
 *   },
 * });
 */
export function useOrchestratorTriggerSubscription(baseOptions: Apollo.SubscriptionHookOptions<OrchestratorTriggerSubscription, OrchestratorTriggerSubscriptionVariables> & ({ variables: OrchestratorTriggerSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<OrchestratorTriggerSubscription, OrchestratorTriggerSubscriptionVariables>(OrchestratorTriggerDocument, options);
      }
export type OrchestratorTriggerSubscriptionHookResult = ReturnType<typeof useOrchestratorTriggerSubscription>;
export type OrchestratorTriggerSubscriptionResult = Apollo.SubscriptionResult<OrchestratorTriggerSubscription>;