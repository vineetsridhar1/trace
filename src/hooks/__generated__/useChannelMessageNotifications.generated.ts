import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ChannelMessageCreatedInServerSubscriptionVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
}>;


export type ChannelMessageCreatedInServerSubscription = { __typename?: 'Subscription', channelMessageCreatedInServer: { __typename?: 'ChannelMessage', id: string, channelId: string, content: string, createdAt: string, author: { __typename?: 'ChannelMessageAuthor', id: string, name: string, avatarUrl?: string | null } } };


export const ChannelMessageCreatedInServerDocument = gql`
    subscription ChannelMessageCreatedInServer($serverId: ID!) {
  channelMessageCreatedInServer(serverId: $serverId) {
    id
    channelId
    content
    createdAt
    author {
      id
      name
      avatarUrl
    }
  }
}
    `;

/**
 * __useChannelMessageCreatedInServerSubscription__
 *
 * To run a query within a React component, call `useChannelMessageCreatedInServerSubscription` and pass it any options that fit your needs.
 * When your component renders, `useChannelMessageCreatedInServerSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useChannelMessageCreatedInServerSubscription({
 *   variables: {
 *      serverId: // value for 'serverId'
 *   },
 * });
 */
export function useChannelMessageCreatedInServerSubscription(baseOptions: Apollo.SubscriptionHookOptions<ChannelMessageCreatedInServerSubscription, ChannelMessageCreatedInServerSubscriptionVariables> & ({ variables: ChannelMessageCreatedInServerSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<ChannelMessageCreatedInServerSubscription, ChannelMessageCreatedInServerSubscriptionVariables>(ChannelMessageCreatedInServerDocument, options);
      }
export type ChannelMessageCreatedInServerSubscriptionHookResult = ReturnType<typeof useChannelMessageCreatedInServerSubscription>;
export type ChannelMessageCreatedInServerSubscriptionResult = Apollo.SubscriptionResult<ChannelMessageCreatedInServerSubscription>;