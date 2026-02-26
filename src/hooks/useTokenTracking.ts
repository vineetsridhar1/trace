import { useCallback, useRef, useState } from 'react';
import type { ServerEvent } from '../types';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function useTokenTracking() {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
  const [latestContextTokens, setLatestContextTokens] = useState(0);
  const [cliCostUsd, setCliCostUsd] = useState<number | null>(null);
  const lastSeenUsageRef = useRef<{ input: number; output: number }>({
    input: 0,
    output: 0,
  });
  const runAccumulatedRef = useRef<{ input: number; output: number; total: number }>({
    input: 0,
    output: 0,
    total: 0,
  });

  const applyCliUsage = useCallback(
    (payload: Record<string, unknown>) => {
      const cliUsage = payload?.cli_usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (!cliUsage) return false;

      const runInput = cliUsage.input_tokens ?? 0;
      const runOutput = cliUsage.output_tokens ?? 0;
      const acc = runAccumulatedRef.current;
      setTokenUsage((prev) => ({
        inputTokens: prev.inputTokens - acc.input + runInput,
        outputTokens: prev.outputTokens - acc.output + runOutput,
        totalTokens: prev.totalTokens - acc.total + runInput + runOutput,
      }));
      runAccumulatedRef.current = { input: 0, output: 0, total: 0 };
      // Use per-call usage for context tokens (context window size), not
      // cli_usage which is the cumulative session total.
      const perCallUsage = payload?.usage as
        | { input_tokens?: number }
        | undefined;
      if (perCallUsage?.input_tokens) {
        setLatestContextTokens(perCallUsage.input_tokens);
      }
      if (typeof payload?.cli_cost_usd === 'number') {
        setCliCostUsd((prev) => (prev ?? 0) + (payload.cli_cost_usd as number));
      }
      return true;
    },
    [],
  );

  const trackEventTokens = useCallback(
    (event: ServerEvent) => {
      const payload = event.rawPayload as Record<string, unknown>;

      if (applyCliUsage(payload)) return;

      // Fall back to per-event incremental tracking (dedup-based).
      const usage = payload?.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage) {
        const curInput = usage.input_tokens ?? 0;
        const curOutput = usage.output_tokens ?? 0;
        if (
          curInput !== lastSeenUsageRef.current.input ||
          curOutput !== lastSeenUsageRef.current.output
        ) {
          lastSeenUsageRef.current = { input: curInput, output: curOutput };
          setTokenUsage((prev) => ({
            inputTokens: prev.inputTokens + curInput,
            outputTokens: prev.outputTokens + curOutput,
            totalTokens: prev.totalTokens + curInput + curOutput,
          }));
          runAccumulatedRef.current = {
            input: runAccumulatedRef.current.input + curInput,
            output: runAccumulatedRef.current.output + curOutput,
            total: runAccumulatedRef.current.total + curInput + curOutput,
          };
        }
        if (curInput) {
          setLatestContextTokens(curInput);
        }
      }
    },
    [applyCliUsage],
  );

  const trackEventTokenUpdate = useCallback(
    (event: ServerEvent) => {
      const payload = event.rawPayload as Record<string, unknown>;
      applyCliUsage(payload);
    },
    [applyCliUsage],
  );

  const resetTokenTracking = useCallback(() => {
    setTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    setLatestContextTokens(0);
    setCliCostUsd(null);
    lastSeenUsageRef.current = { input: 0, output: 0 };
    runAccumulatedRef.current = { input: 0, output: 0, total: 0 };
  }, []);

  const applyLoadedTokenData = useCallback(
    (data: {
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
      latestContextTokens?: number | null;
      cliCostUsd?: number | null;
      lastEvent?: ServerEvent | null;
    }) => {
      if (data.tokenUsage) {
        setTokenUsage({
          inputTokens: data.tokenUsage.inputTokens,
          outputTokens: data.tokenUsage.outputTokens,
          totalTokens: data.tokenUsage.totalTokens,
        });
      }
      setLatestContextTokens(data.latestContextTokens ?? 0);
      setCliCostUsd(data.cliCostUsd ?? null);

      if (data.lastEvent) {
        const lastUsage = (data.lastEvent.rawPayload as Record<string, unknown>)?.usage as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;
        lastSeenUsageRef.current = {
          input: lastUsage?.input_tokens ?? 0,
          output: lastUsage?.output_tokens ?? 0,
        };
      }
    },
    [],
  );

  return {
    tokenUsage,
    latestContextTokens,
    cliCostUsd,
    trackEventTokens,
    trackEventTokenUpdate,
    resetTokenTracking,
    applyLoadedTokenData,
  };
}
