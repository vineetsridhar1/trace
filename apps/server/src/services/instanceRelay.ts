import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export interface ConnectedInstance {
  instanceId: string;
  userId: string;
  serverId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPingAt: Date;
}

export interface RelayCommand {
  id: string;
  type: 'action';
  action: string;
  params: Record<string, unknown>;
}

export interface RelayResult {
  id: string;
  type: 'action-result';
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface PendingCommand {
  instanceId: string;
  resolve: (result: RelayResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

class InstanceRelay {
  private instances = new Map<string, ConnectedInstance>();
  private pending = new Map<string, PendingCommand>();

  register(instance: Omit<ConnectedInstance, 'connectedAt' | 'lastPingAt'>): void {
    const now = new Date();
    this.instances.set(instance.instanceId, {
      ...instance,
      connectedAt: now,
      lastPingAt: now,
    });
  }

  unregister(instanceId: string): void {
    this.instances.delete(instanceId);

    // Reject all pending commands for this instance
    for (const [id, entry] of this.pending) {
      if (entry.instanceId === instanceId) {
        clearTimeout(entry.timeout);
        this.pending.delete(id);
        entry.reject(new Error('INSTANCE_DISCONNECTED'));
      }
    }
  }

  isOnline(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  getOnlineInstanceIds(serverId: string): string[] {
    const ids: string[] = [];
    this.instances.forEach((instance) => {
      if (instance.serverId === serverId) {
        ids.push(instance.instanceId);
      }
    });
    return ids;
  }

  sendCommand(
    instanceId: string,
    action: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<RelayResult> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return Promise.reject(new Error(`Instance ${instanceId} is not online`));
    }

    const id = randomUUID();
    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<RelayResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RELAY_TIMEOUT'));
      }, effectiveTimeout);

      this.pending.set(id, { instanceId, resolve, reject, timeout });

      const command: RelayCommand = {
        id,
        type: 'action',
        action,
        params,
      };

      instance.socket.send(JSON.stringify(command));
    });
  }

  recordPing(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.lastPingAt = new Date();
    }
  }

  getLastPingAt(instanceId: string): Date | undefined {
    return this.instances.get(instanceId)?.lastPingAt;
  }

  handleResult(result: RelayResult): void {
    const entry = this.pending.get(result.id);
    if (!entry) return;

    clearTimeout(entry.timeout);
    this.pending.delete(result.id);
    entry.resolve(result);
  }

  _reset(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeout);
    }
    this.instances.clear();
    this.pending.clear();
  }
}

export const instanceRelay = new InstanceRelay();
