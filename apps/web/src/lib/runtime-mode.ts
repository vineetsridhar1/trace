function toBool(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export const isLocalMode = toBool(import.meta.env.VITE_TRACE_LOCAL_MODE);
