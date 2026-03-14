export type OutputCallback = (data: Record<string, unknown>) => void;

/**
 * Interface for coding tool adapters (Claude Code, Cursor, etc.).
 * Implementations spawn and manage a coding tool process.
 */
export interface CodingToolAdapter {
  run(prompt: string, cwd: string, onOutput: OutputCallback, onComplete: () => void): void;
  abort(): void;
}
