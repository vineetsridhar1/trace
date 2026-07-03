import type { ProtocolNode } from "./protocol-nodes.js";

export interface NodesDelta {
  /** Replace already-emitted nodes at these positions. */
  patched: Array<{ index: number; node: ProtocolNode }>;
  /** Nodes to append after the previously emitted list. */
  appended: ProtocolNode[];
  /** When present, drop previously emitted nodes from this index first. */
  truncateFrom?: number;
  /** Node count after applying — a consistency check for the editor. */
  count: number;
}

/** Position-based diff between the previously emitted node list and the next
 *  one. Streaming updates that mutate a node in place (a read group absorbing
 *  an item, a command gaining output, optimistic reconciliation swapping IDs)
 *  become patches; new nodes become appends; removals truncate. */
export function diffNodes(previous: ProtocolNode[], next: ProtocolNode[]): NodesDelta | null {
  const patched: Array<{ index: number; node: ProtocolNode }> = [];
  const shared = Math.min(previous.length, next.length);
  for (let index = 0; index < shared; index += 1) {
    if (JSON.stringify(previous[index]) !== JSON.stringify(next[index])) {
      patched.push({ index, node: next[index] as ProtocolNode });
    }
  }
  const appended = next.length > previous.length ? next.slice(previous.length) : [];
  const truncateFrom = next.length < previous.length ? next.length : undefined;
  if (patched.length === 0 && appended.length === 0 && truncateFrom === undefined) {
    return null;
  }
  return {
    patched,
    appended,
    ...(truncateFrom !== undefined ? { truncateFrom } : {}),
    count: next.length,
  };
}
