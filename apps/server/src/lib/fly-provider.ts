import type { CloudMachineProvider, CreateVMOptions } from "./cloud-machine-provider.js";

const FLY_API_URL = process.env.FLY_API_URL ?? "https://api.machines.dev";
const FLY_API_TOKEN = process.env.FLY_API_TOKEN ?? "";
const FLY_APP_NAME = process.env.FLY_APP_NAME ?? "";
const CONTAINER_IMAGE = process.env.CONTAINER_IMAGE ?? "";

function machineUrl(machineId?: string): string {
  const base = `${FLY_API_URL}/v1/apps/${FLY_APP_NAME}/machines`;
  return machineId ? `${base}/${machineId}` : base;
}

async function flyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fly API ${options.method ?? "GET"} ${url} failed (${res.status}): ${body}`);
  }
  return res;
}

/**
 * Fly Machines implementation of CloudMachineProvider.
 * Contains all Fly-specific API calls — no session awareness.
 */
export class FlyProvider implements CloudMachineProvider {
  async createVM(options: CreateVMOptions): Promise<{ providerMachineId: string }> {
    const env: Record<string, string> = {
      TRACE_BRIDGE_URL: options.bridgeUrl,
      BRIDGE_TOKEN: options.bridgeToken,
      CLOUD_MACHINE_ID: options.cloudMachineId,
      CODING_TOOL: options.defaultTool,
      ...options.env,
    };

    const body = {
      config: {
        image: CONTAINER_IMAGE,
        env,
        guest: { cpu_kind: "shared", cpus: 2, memory_mb: 2048 },
        auto_destroy: false, // We manage lifecycle — don't auto-destroy on stop
      },
    };

    const res = await flyFetch(machineUrl(), {
      method: "POST",
      body: JSON.stringify(body),
    });

    const machine = (await res.json()) as { id: string };
    return { providerMachineId: machine.id };
  }

  async waitForStarted(providerMachineId: string): Promise<void> {
    await flyFetch(`${machineUrl(providerMachineId)}/wait?state=started`, {
      method: "GET",
    });
  }

  async getVMState(providerMachineId: string): Promise<string | null> {
    try {
      const res = await flyFetch(machineUrl(providerMachineId), { method: "GET" });
      const machine = (await res.json()) as { state: string };
      return machine.state;
    } catch {
      return null;
    }
  }

  async stopVM(providerMachineId: string): Promise<void> {
    await flyFetch(`${machineUrl(providerMachineId)}/stop`, { method: "POST" });
  }

  async startVM(providerMachineId: string): Promise<void> {
    await flyFetch(`${machineUrl(providerMachineId)}/start`, { method: "POST" });
  }

  async destroyVM(providerMachineId: string): Promise<void> {
    // Stop first — Fly requires stopped state before deletion
    await flyFetch(`${machineUrl(providerMachineId)}/stop`, { method: "POST" }).catch(() => {
      // May already be stopped
    });
    await flyFetch(`${machineUrl(providerMachineId)}/wait?state=stopped&timeout=30`, {
      method: "GET",
    }).catch(() => {
      // Timeout or already stopped — proceed with delete
    });

    await flyFetch(machineUrl(providerMachineId), {
      method: "DELETE",
      body: JSON.stringify({ force: true }),
    });
  }
}

export const flyProvider = new FlyProvider();
