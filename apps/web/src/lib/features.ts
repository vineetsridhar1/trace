function toBool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export const features = {
  messaging: toBool(import.meta.env.VITE_ENABLE_MESSAGING, true),
  tickets: toBool(import.meta.env.VITE_ENABLE_TICKETS),
  agentDebug: toBool(import.meta.env.VITE_ENABLE_AGENT_DEBUG),
  agent: toBool(import.meta.env.VITE_ENABLE_AGENT),
};
