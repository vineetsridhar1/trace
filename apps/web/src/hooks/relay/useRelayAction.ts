import type { RelayActionResult } from "../../context/InstanceContext";

export interface RelayResult<TData = void> {
  success: boolean;
  data: TData | undefined;
  error: string | undefined;
}

export type RelayActionFn = (
  action: string,
  params: Record<string, unknown>,
) => Promise<RelayActionResult>;

export async function typedRelay<TData = void>(
  relayAction: RelayActionFn,
  actionName: string,
  params: Record<string, unknown> | object,
): Promise<RelayResult<TData>> {
  const result = await relayAction(actionName, params as Record<string, unknown>);
  return {
    success: result.success,
    data: result.data as TData | undefined,
    error: result.error ?? undefined,
  };
}
