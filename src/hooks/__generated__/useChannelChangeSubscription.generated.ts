import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ChannelChangedInServerSubscriptionVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
}>;


export type ChannelChangedInServerSubscription = { __typename?: 'Subscription', channelChangedInServer: { __typename?: 'ChannelChangeEvent', channelId: string, action: string } };


export const ChannelChangedInServerDocument = gql`
    subscription ChannelChangedInServer($serverId: ID!) {
  channelChangedInServer(serverId: $serverId) {
    channelId
    action
  }
}
    `;

/**
 * __useChannelChangedInServerSubscription__
 *
 * To run a query within a React component, call `useChannelChangedInServerSubscription` and pass it any options that fit your needs.
 * When your component renders, `useChannelChangedInServerSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useChannelChangedInServerSubscription({
 *   variables: {
 *      serverId: // value for 'serverId'
 *   },
 * });
 */
export function useChannelChangedInServerSubscription(baseOptions: Apollo.SubscriptionHookOptions<ChannelChangedInServerSubscription, ChannelChangedInServerSubscriptionVariables> & ({ variables: ChannelChangedInServerSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<ChannelChangedInServerSubscription, ChannelChangedInServerSubscriptionVariables>(ChannelChangedInServerDocument, options);
      }
export type ChannelChangedInServerSubscriptionHookResult = ReturnType<typeof useChannelChangedInServerSubscription>;
export type ChannelChangedInServerSubscriptionResult = Apollo.SubscriptionResult<ChannelChangedInServerSubscription>;