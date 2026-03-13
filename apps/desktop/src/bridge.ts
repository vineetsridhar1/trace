import WebSocket from "ws";

export class BridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  connect() {
    this.ws = new WebSocket(`${this.serverUrl}/bridge`);

    this.ws.on("open", () => {
      console.log("[bridge] connected to server");
    });

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.handleMessage(msg);
    });

    this.ws.on("close", () => {
      console.log("[bridge] disconnected, reconnecting in 3s...");
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      console.error("[bridge] error:", err.message);
    });
  }

  private handleMessage(msg: { type: string; sessionId?: string; event?: unknown }) {
    switch (msg.type) {
      case "send":
        // TODO: forward event to local session adapter
        console.log("[bridge] send event to session", msg.sessionId);
        break;
      case "pause":
        // TODO: pause local session
        console.log("[bridge] pause session", msg.sessionId);
        break;
      case "resume":
        // TODO: resume local session
        console.log("[bridge] resume session", msg.sessionId);
        break;
      case "terminate":
        // TODO: terminate local session
        console.log("[bridge] terminate session", msg.sessionId);
        break;
    }
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
