export function runtimeDebug(message: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(`[runtime-debug] ${message}`, data);
    return;
  }

  console.log(`[runtime-debug] ${message}`);
}
