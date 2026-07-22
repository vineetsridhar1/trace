import { gql } from "@urql/core";
import type { RepoApplicationConfig } from "@trace/gql";

export const APPLICATIONS_STATE_QUERY = gql`
  query SessionApplicationsState($sessionGroupId: ID!) {
    sessionGroup(id: $sessionGroupId) {
      id
      repo {
        id
        applicationConfig {
          setupScripts {
            id
            name
            command
            workingDirectory
            env {
              key
              secretName
            }
          }
          applications {
            id
            name
            processes {
              id
              name
              command
              workingDirectory
              env {
                key
                secretName
              }
              required
              ports {
                id
                label
                port
                protocol
                defaultForwardingEnabled
                healthPath
              }
            }
          }
        }
      }
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      appConfigId
      processConfigId
      label
      status
      runtimeInstanceId
      startedAt
      stoppedAt
      exitCode
      lastError
    }
    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      scriptConfigId
      label
      command
      workingDirectory
      status
      exitCode
      outputPreview
      outputTruncated
      lastError
      startedAt
      completedAt
    }
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id
      key
      url
      sessionGroupId
      appConfigId
      processConfigId
      portConfigId
      label
      targetPort
      status
      accessMode
      trafficCaptureMode
      enabledAt
      disabledAt
      revokedAt
    }
  }
`;

export const PROCESS_LOGS_QUERY = gql`
  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {
    sessionApplicationLogs(processId: $processId, limit: $limit) {
      id
      processId
      stream
      data
      sequence
      timestamp
    }
  }
`;

export const RUN_SETUP_MUTATION = gql`
  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {
    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)
  }
`;

export const START_PROCESS_MUTATION = gql`
  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
    startSessionProcess(
      sessionGroupId: $sessionGroupId
      appConfigId: $appConfigId
      processConfigId: $processConfigId
    ) {
      id
    }
  }
`;

export const STOP_PROCESS_MUTATION = gql`
  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
    stopSessionProcess(
      sessionGroupId: $sessionGroupId
      appConfigId: $appConfigId
      processConfigId: $processConfigId
    ) {
      id
    }
  }
`;

export const ENABLE_ENDPOINT_MUTATION = gql`
  mutation EnableSessionEndpointForwarding(
    $endpointId: ID!
    $accessMode: SessionEndpointAccessMode!
  ) {
    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: $accessMode) {
      id
    }
  }
`;

export const DISABLE_ENDPOINT_MUTATION = gql`
  mutation DisableSessionEndpointForwarding($endpointId: ID!) {
    disableSessionEndpointForwarding(endpointId: $endpointId) {
      id
    }
  }
`;

export const PUBLISH_APP_MUTATION = gql`
  mutation PublishAppSession($sessionGroupId: ID!) {
    publishAppSession(sessionGroupId: $sessionGroupId) {
      id
    }
  }
`;

export const CREATE_PREVIEW_MUTATION = gql`
  mutation CreateSessionEndpointPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
      expiresAt
    }
  }
`;

export const UPDATE_PDF_FORMAT_MUTATION = gql`
  mutation UpdatePdfFormat($sessionGroupId: ID!, $width: Float!, $height: Float!, $unit: String!) {
    updatePdfSessionFormat(
      sessionGroupId: $sessionGroupId
      width: $width
      height: $height
      unit: $unit
    )
  }
`;

export const REQUEST_PDF_EXPORT_MUTATION = gql`
  mutation RequestPdfExport($sessionGroupId: ID!) {
    requestPdfSessionExport(sessionGroupId: $sessionGroupId)
  }
`;

export const PDF_SESSION_DOWNLOAD_URL_QUERY = gql`
  query PdfSessionDownloadUrl($sessionGroupId: ID!) {
    pdfSessionDownloadUrl(sessionGroupId: $sessionGroupId)
  }
`;

export const DEFAULT_APP_CONFIG: RepoApplicationConfig = {
  setupScripts: [],
  applications: [
    {
      id: "app",
      name: "App",
      processes: [
        {
          id: "dev",
          name: "Dev server",
          command: "pnpm install --prefer-offline && pnpm dev",
          workingDirectory: ".",
          required: true,
          env: [],
          ports: [
            {
              id: "web",
              label: "Preview",
              port: 3000,
              protocol: "http",
              defaultForwardingEnabled: true,
              healthPath: "/",
            },
          ],
        },
      ],
    },
  ],
};

export function displayApplicationStatus(status: string): string {
  return status.length > 0 ? `${status[0]?.toUpperCase()}${status.slice(1)}` : status;
}
