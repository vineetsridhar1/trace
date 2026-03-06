import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { resolveServerUrl } from "./ipc/shared";

export interface RelayCommand {
  id: string;
  type: "action";
  action: string;
  params: Record<string, unknown>;
}

export interface RelayResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface InstanceConnectionOptions {
  serverUrl: string;
  token: string;
  instanceId: string;
  serverId: string;
  instanceName: string;
  onCommand: (command: RelayCommand) => Promise<RelayResult>;
}

const CONFIG_DIR = path.join(os.homedir(), ".trace");
const INSTANCE_CONFIG_PATH = path.join(CONFIG_DIR, "instance.json");

let storedAuthToken: string | null = null;
let storedServerId: string | null = null;

export function setAuthToken(token: string | null, serverId?: string | null): void {
  storedAuthToken = token;
  if (serverId !== undefined) storedServerId = serverId;
}

export function getAuthToken(): string | null {
  return storedAuthToken;
}

interface InstanceConfig {
  instanceId: string;
  instanceName?: string;
}

function readInstanceConfig(): InstanceConfig | null {
  try {
    const raw = fs.readFileSync(INSTANCE_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as InstanceConfig;
  } catch {
    return null;
  }
}

function writeInstanceConfig(config: InstanceConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(INSTANCE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getOrCreateInstanceId(): string {
  const existing = readInstanceConfig();
  if (existing?.instanceId) {
    return existing.instanceId;
  }
  const id = crypto.randomUUID();
  writeInstanceConfig({ instanceId: id });
  return id;
}

export function getInstanceId(): string {
  return getOrCreateInstanceId();
}

export function getInstanceName(): string {
  const existing = readInstanceConfig();
  return existing?.instanceName ?? os.hostname();
}

export function setInstanceName(name: string): void {
  const existing = readInstanceConfig();
  const config: InstanceConfig = existing ?? { instanceId: crypto.randomUUID() };
  config.instanceName = name;
  writeInstanceConfig(config);
}

export async function setPassword(
  password: string | null,
): Promise<{ success: boolean; error?: string }> {
  const serverUrl = resolveServerUrl();
  const instanceId = storedServerId ?? getInstanceId();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (storedAuthToken) {
      headers["Authorization"] = `Bearer ${storedAuthToken}`;
    }
    const res = await fetch(`${serverUrl}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `mutation SetInstancePassword($instanceId: ID!, $password: String) {
          setInstancePassword(instanceId: $instanceId, password: $password)
        }`,
        variables: { instanceId, password },
      }),
    });
    if (!res.ok) {
      return { success: false, error: `Server returned ${res.status}` };
    }
    const body = (await res.json()) as {
      data?: { setInstancePassword: boolean };
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      return { success: false, error: body.errors[0].message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export class InstanceConnection {
  private ws: WebSocket | null = null;
  private options: InstanceConnectionOptions;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(options: InstanceConnectionOptions) {
    this.options = options;
  }

  connect(): void {
    this.intentionalClose = false;
    this.createConnection();
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private createConnection(): void {
    const { serverUrl, token } = this.options;
    const url = `${serverUrl}/instance?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[InstanceConnection] connected");
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;

      const { instanceId, serverId, instanceName } = this.options;
      this.send({
        type: "register",
        instanceId,
        serverId,
        instanceName,
      });
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error("[InstanceConnection] failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[InstanceConnection] disconnected");
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      console.error("[InstanceConnection] error:", err.message);
    });
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case "registered":
        if (msg.ok) {
          console.log("[InstanceConnection] registered successfully");
        }
        break;

      case "ping":
        this.send({ type: "pong" });
        break;

      case "action": {
        const { id, action, params } = msg as unknown as {
          id: string;
          action: string;
          params: Record<string, unknown>;
        };
        this.options
          .onCommand({ id, type: "action", action, params })
          .then((result) => {
            this.send({
              type: "action-result",
              id,
              success: result.success,
              ...(result.data !== undefined && { data: result.data }),
              ...(result.error !== undefined && { error: result.error }),
            });
          })
          .catch((err: Error) => {
            this.send({
              type: "action-result",
              id,
              success: false,
              error: err.message,
            });
          });
        break;
      }

      case "error":
        console.error("[InstanceConnection] server error:", msg);
        break;

      default:
        console.warn("[InstanceConnection] unknown message type:", msg.type);
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    console.log(
      `[InstanceConnection] reconnecting in ${this.reconnectDelay}ms`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createConnection();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      MAX_RECONNECT_DELAY,
    );
  }
}
