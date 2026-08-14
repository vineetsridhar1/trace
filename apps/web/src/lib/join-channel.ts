import { gql } from "@urql/core";
import { client } from "./urql";

const JOIN_PROJECT_MUTATION = gql`
  mutation JoinProject($channelId: ID!) {
    joinChannel(channelId: $channelId) {
      id
    }
  }
`;

export async function joinChannel(channelId: string): Promise<void> {
  await client.mutation(JOIN_PROJECT_MUTATION, { channelId }).toPromise();
}
