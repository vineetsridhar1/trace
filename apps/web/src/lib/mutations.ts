import { gql } from "@urql/core";

export const START_SESSION_MUTATION = gql`
  mutation StartSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
    }
  }
`;

export const RUN_SESSION_MUTATION = gql`
  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {
    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {
      id
    }
  }
`;

export const SEND_SESSION_MESSAGE_MUTATION = gql`
  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
      id
    }
  }
`;

export const TERMINATE_SESSION_MUTATION = gql`
  mutation TerminateSession($id: ID!) {
    terminateSession(id: $id) {
      id
    }
  }
`;
