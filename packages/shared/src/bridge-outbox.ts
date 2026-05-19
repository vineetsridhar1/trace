import type { BridgeMessage } from "./bridge.js";

const DEFAULT_MAX_OUTBOX_MESSAGES = 1_000;

const QUEUEABLE_BRIDGE_MESSAGE_TYPES = new Set<BridgeMessage["type"]>([
  "register_session",
  "session_output",
  "session_complete",
  "workspace_ready",
  "workspace_failed",
  "tool_session_id",
  "tool_session_missing",
  "git_checkpoint",
  "repo_linked",
]);

export function isQueueableBridgeMessage(message: BridgeMessage): boolean {
  return QUEUEABLE_BRIDGE_MESSAGE_TYPES.has(message.type);
}

export class BridgeOutbox {
  private readonly messages: BridgeMessage[] = [];

  constructor(private readonly maxMessages = DEFAULT_MAX_OUTBOX_MESSAGES) {}

  get size(): number {
    return this.messages.length;
  }

  enqueue(message: BridgeMessage): boolean {
    if (!isQueueableBridgeMessage(message)) return false;
    if (this.messages.length >= this.maxMessages) return false;
    this.messages.push(message);
    return true;
  }

  flush(send: (message: BridgeMessage) => boolean): number {
    let sent = 0;
    while (this.messages.length > 0) {
      const message = this.messages[0];
      if (!message || !send(message)) break;
      this.messages.shift();
      sent += 1;
    }
    return sent;
  }

  clear(): void {
    this.messages.length = 0;
  }
}
