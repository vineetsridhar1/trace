import type { ComponentType } from "react";

export function resolveScreenComponent(
  screenModules: Record<string, unknown>,
  componentPath: string,
): ComponentType | null {
  const key = `./design/${componentPath.slice(2)}`;
  const value = screenModules[key];
  if (!value || typeof value !== "object" || !("default" in value)) return null;
  const component = (value as { default?: unknown }).default;
  return typeof component === "function" ? (component as ComponentType) : null;
}
