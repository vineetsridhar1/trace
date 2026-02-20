import { Response } from 'express';

type SSEClient = {
  id: string;
  sessionId: string;
  res: Response;
};

type ChannelSSEClient = {
  id: string;
  channelId: string;
  res: Response;
};

class SSEManager {
  private clients: SSEClient[] = [];
  private channelClients: ChannelSSEClient[] = [];

  addClient(sessionId: string, res: Response): string {
    const id = Math.random().toString(36).slice(2);
    this.clients.push({ id, sessionId, res });

    res.on('close', () => {
      this.clients = this.clients.filter((c) => c.id !== id);
    });

    return id;
  }

  addChannelClient(channelId: string, res: Response): string {
    const id = Math.random().toString(36).slice(2);
    this.channelClients.push({ id, channelId, res });

    res.on('close', () => {
      this.channelClients = this.channelClients.filter((c) => c.id !== id);
    });

    return id;
  }

  broadcast(sessionId: string, eventName: string, data: unknown) {
    const targets = this.clients.filter((c) => c.sessionId === sessionId);
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of targets) {
      client.res.write(payload);
    }
  }

  broadcastChannel(channelId: string, eventName: string, data: unknown) {
    const targets = this.channelClients.filter((c) => c.channelId === channelId);
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of targets) {
      client.res.write(payload);
    }
  }
}

export const sseManager = new SSEManager();
