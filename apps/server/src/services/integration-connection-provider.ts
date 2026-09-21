import type { AgentToolSource } from "../config/supported-integrations.js";

export type IntegrationProxyResponse = {
  status: number;
  contentType: string | null;
  body: Buffer;
};

export type IntegrationToolDefinition = {
  id: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
};

export interface IntegrationToolProvider {
  listTools(input: {
    connectionId: string;
    providerConfigKey: string;
    source: Exclude<AgentToolSource, "none">;
  }): Promise<IntegrationToolDefinition[]>;
  callTool(input: {
    connectionId: string;
    providerConfigKey: string;
    source: Exclude<AgentToolSource, "none">;
    toolId: string;
    arguments: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

export interface IntegrationConnectionProvider {
  isConfigured(): boolean;
  createConnectSession(input: {
    organizationId: string;
    userId: string;
    userEmail: string;
    userName: string;
    providerConfigKey: string;
    displayName: string;
    kind: "personal" | "service";
  }): Promise<{ connectLink: string; expiresAt: Date }>;
  deleteConnection(connectionId: string, providerConfigKey: string): Promise<void>;
  proxy(input: {
    connectionId: string;
    providerConfigKey: string;
    method: string;
    path: string;
    query: string | null;
    contentType: string | null;
    body: Buffer;
  }): Promise<IntegrationProxyResponse>;
}
