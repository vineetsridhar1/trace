import * as net from "net";

const allocations = new Map<string, number[]>();

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function getAllAllocatedPorts(): Set<number> {
  const all = new Set<number>();
  for (const ports of allocations.values()) {
    for (const p of ports) all.add(p);
  }
  return all;
}

export async function allocatePorts(
  workspaceId: string,
  count: number,
): Promise<number[]> {
  // Release any previous allocation for this message
  allocations.delete(workspaceId);

  const allocated: number[] = [];
  const reserved = getAllAllocatedPorts();
  let candidate = 20000;

  while (allocated.length < count) {
    if (!reserved.has(candidate) && (await isPortAvailable(candidate))) {
      allocated.push(candidate);
      reserved.add(candidate);
    }
    candidate++;
  }

  allocations.set(workspaceId, allocated);
  return allocated;
}

export function releasePorts(workspaceId: string): void {
  allocations.delete(workspaceId);
}
