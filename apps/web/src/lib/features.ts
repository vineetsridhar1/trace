function toBool(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export const features = {
  messaging: toBool(import.meta.env.VITE_ENABLE_MESSAGING),
  tickets: toBool(import.meta.env.VITE_ENABLE_TICKETS),
  agentDebug: toBool(import.meta.env.VITE_ENABLE_AGENT_DEBUG),
};
