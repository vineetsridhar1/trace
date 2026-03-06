import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { verifyJwt } from '../services/authService';
import { upsertInstance } from '../services/instanceService';
import { instanceRelay, RelayResult } from '../services/instanceRelay';
import { pubsub, TOPICS } from '../services/pubsub';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 90_000;

interface InstanceRegistration {
  type: 'register';
  instanceId: string;
  serverId: string;
  instanceName: string;
}

function send(ws: WebSocket, data: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export async function handleInstanceSocket(ws: WebSocket, req: IncomingMessage): Promise<void> {
  // --- Handshake / auth ---
  const url = new URL(req.url ?? '', 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    send(ws, { type: 'error', error: 'UNAUTHORIZED' });
    ws.close();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    send(ws, { type: 'error', error: 'UNAUTHORIZED' });
    ws.close();
    return;
  }

  const { userId } = payload;

  // --- Wait for registration message ---
  const registration = await new Promise<InstanceRegistration | null>((resolve) => {
    const onMessage = (raw: Buffer | string) => {
      ws.off('message', onMessage);
      ws.off('close', onClose);
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (msg.type === 'register') {
          resolve(msg as InstanceRegistration);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    const onClose = () => {
      ws.off('message', onMessage);
      resolve(null);
    };
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });

  if (!registration) {
    send(ws, { type: 'error', error: 'INVALID_REGISTRATION' });
    ws.close();
    return;
  }

  const { serverId, instanceName } = registration;

  // --- Persist instance and register in relay ---
  // Use the DB record's id as the relay key so myInstances resolver can match via isOnline()
  let dbInstance;
  try {
    dbInstance = await upsertInstance({ userId, serverId, name: instanceName });
  } catch {
    send(ws, { type: 'error', error: 'INVALID_SERVER' });
    ws.close();
    return;
  }
  const relayId = dbInstance.id;
  instanceRelay.register({ instanceId: relayId, userId, serverId, socket: ws });
  send(ws, { type: 'registered', ok: true });
  await pubsub.publish(TOPICS.INSTANCE_STATUS_CHANGED(serverId), { instanceStatusChanged: { instanceId: relayId, isOnline: true } });

  // --- Heartbeat ---
  let lastPingAt = Date.now();

  const pingInterval = setInterval(() => {
    if (Date.now() - lastPingAt > PONG_TIMEOUT_MS) {
      clearInterval(pingInterval);
      ws.terminate();
      return;
    }
    send(ws, { type: 'ping' });
  }, PING_INTERVAL_MS);

  // --- Message handling ---
  ws.on('message', (raw) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case 'action-result':
        instanceRelay.handleResult(message as unknown as RelayResult);
        break;
      case 'pong':
        lastPingAt = Date.now();
        instanceRelay.recordPing(relayId);
        break;
    }
  });

  // --- Disconnect cleanup ---
  ws.on('close', () => {
    clearInterval(pingInterval);
    instanceRelay.unregister(relayId);
    void pubsub.publish(TOPICS.INSTANCE_STATUS_CHANGED(serverId), { instanceStatusChanged: { instanceId: relayId, isOnline: false } });
  });
}
