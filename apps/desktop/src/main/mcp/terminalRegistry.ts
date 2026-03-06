import type { TerminalTab } from '../../stores/terminalStore';

const registry = new Map<string, TerminalTab[]>();

export function updateWorkspaceTerminals(workspaceId: string, terminals: TerminalTab[]): void {
  registry.set(workspaceId, terminals);
}

export function removeWorkspaceTerminals(workspaceId: string): void {
  registry.delete(workspaceId);
}

export function resolveTerminalByName(workspaceId: string, name: string): TerminalTab | undefined {
  const terminals = registry.get(workspaceId) ?? [];
  return terminals.find((t) => t.name === name);
}

export function listWorkspaceTerminals(workspaceId: string): TerminalTab[] {
  return registry.get(workspaceId) ?? [];
}
