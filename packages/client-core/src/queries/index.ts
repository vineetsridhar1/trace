import { gql } from "@urql/core";

export const REPO_PULL_REQUESTS_QUERY = gql`
  query RepoPullRequests($repoId: ID!) {
    repoPullRequests(repoId: $repoId) {
      number
      title
      branch
      url
      author
      isDraft
      updatedAt
    }
  }
`;
