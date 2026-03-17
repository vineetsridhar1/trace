/**
 * Provider-agnostic interface for cloud VM lifecycle.
 * Each cloud backend (Fly, AWS, GCP) implements this interface.
 * No session awareness — pure VM lifecycle operations.
 */

export interface CloudMachineProvider {
  /** Create a VM and return its provider-specific ID. */
  createVM(options: CreateVMOptions): Promise<{ providerMachineId: string }>;

  /** Wait for VM to reach "started" state. */
  waitForStarted(providerMachineId: string): Promise<void>;

  /** Get current VM state from the provider. Returns null if VM doesn't exist. */
  getVMState(providerMachineId: string): Promise<string | null>;

  /** Stop a VM (preserves filesystem, no cost). */
  stopVM(providerMachineId: string): Promise<void>;

  /** Start a stopped VM. */
  startVM(providerMachineId: string): Promise<void>;

  /** Destroy a VM permanently. */
  destroyVM(providerMachineId: string): Promise<void>;
}

export interface CreateVMOptions {
  /** Our DB ID for this cloud machine */
  cloudMachineId: string;
  /** Auth token for bridge WebSocket */
  bridgeToken: string;
  /** Server's WebSocket URL for bridge connections */
  bridgeUrl: string;
  /** Default coding tool (claude_code, codex, etc.) */
  defaultTool: string;
  /** Environment variables (API keys, etc.) */
  env: Record<string, string>;
}
