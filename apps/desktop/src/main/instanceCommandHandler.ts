export interface RelayCommand {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface RelayResult {
  id: string;
  type: "action-result";
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

type RelayActionHandler = (
  params: Record<string, unknown>,
) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;

const actionRegistry = new Map<string, RelayActionHandler>();

export function registerRelayAction(
  name: string,
  handler: RelayActionHandler,
): void {
  actionRegistry.set(name, handler);
}

export async function handleRelayCommand(
  command: RelayCommand,
): Promise<RelayResult> {
  try {
    const handler = actionRegistry.get(command.action);
    if (!handler) {
      return {
        id: command.id,
        type: "action-result",
        success: false,
        error: "UNKNOWN_ACTION",
      };
    }

    const { success, error, ...data } = await handler(command.params);
    return {
      id: command.id,
      type: "action-result",
      success,
      data: Object.keys(data).length > 0
        ? (data as Record<string, unknown>)
        : undefined,
      error,
    };
  } catch (err) {
    return {
      id: command.id,
      type: "action-result",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
