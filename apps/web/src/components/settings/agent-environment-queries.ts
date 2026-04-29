import { gql } from "@urql/core";

export const AGENT_ENVIRONMENTS_SETTINGS_QUERY = gql`
  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {
    agentEnvironments(orgId: $orgId) {
      id
      orgId
      name
      adapterType
      config
      enabled
      isDefault
      createdAt
      updatedAt
    }
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

export const CREATE_AGENT_ENVIRONMENT_MUTATION = gql`
  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {
    createAgentEnvironment(input: $input) {
      id
      orgId
      name
      adapterType
      config
      enabled
      isDefault
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_AGENT_ENVIRONMENT_MUTATION = gql`
  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {
    updateAgentEnvironment(input: $input) {
      id
      orgId
      name
      adapterType
      config
      enabled
      isDefault
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_AGENT_ENVIRONMENT_MUTATION = gql`
  mutation DeleteAgentEnvironment($id: ID!) {
    deleteAgentEnvironment(id: $id)
  }
`;

export const TEST_AGENT_ENVIRONMENT_MUTATION = gql`
  mutation TestAgentEnvironment($id: ID!) {
    testAgentEnvironment(id: $id) {
      ok
      message
    }
  }
`;
