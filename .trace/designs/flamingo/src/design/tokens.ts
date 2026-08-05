import type { CSSProperties } from "react";

export type DesignTokens = {
  direction: { name: string; rationale: string };
  color: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    dangerForeground: string;
  };
  typography: { display: string; body: string; mono: string; scale: string };
  spacing: { base: number; density: string };
  radius: { control: number; surface: number };
  elevation: { surface: string };
  motion: { duration: number; easing: string };
};

type TokenStyle = CSSProperties & Record<`--design-${string}`, string>;

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a string`);
  if (/[;{}]/.test(value)) throw new Error(`${path} contains an unsafe CSS character`);
  return value.trim();
}

function number(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${path} must be a number greater than or equal to ${minimum}`);
  }
  return value;
}

function fields<T extends Record<string, string>>(
  value: unknown,
  path: string,
  keys: readonly (keyof T)[],
): T {
  const source = record(value, path);
  return Object.fromEntries(
    keys.map((key) => [key, text(source[String(key)], `${path}.${String(key)}`)]),
  ) as T;
}

export function validateDesignTokens(value: unknown): DesignTokens {
  const source = record(value, "trace.tokens.json");
  const direction = fields<DesignTokens["direction"]>(source.direction, "direction", [
    "name",
    "rationale",
  ]);
  const color = fields<DesignTokens["color"]>(source.color, "color", [
    "background",
    "surface",
    "foreground",
    "muted",
    "border",
    "primary",
    "primaryForeground",
    "secondary",
    "success",
    "warning",
    "danger",
    "dangerForeground",
  ]);
  const typography = fields<DesignTokens["typography"]>(source.typography, "typography", [
    "display",
    "body",
    "mono",
    "scale",
  ]);
  const spacingSource = record(source.spacing, "spacing");
  const radiusSource = record(source.radius, "radius");
  const elevation = fields<DesignTokens["elevation"]>(source.elevation, "elevation", ["surface"]);
  const motionSource = record(source.motion, "motion");

  return {
    direction,
    color,
    typography,
    spacing: {
      base: number(spacingSource.base, "spacing.base", 1),
      density: text(spacingSource.density, "spacing.density"),
    },
    radius: {
      control: number(radiusSource.control, "radius.control"),
      surface: number(radiusSource.surface, "radius.surface"),
    },
    elevation,
    motion: {
      duration: number(motionSource.duration, "motion.duration"),
      easing: text(motionSource.easing, "motion.easing"),
    },
  };
}

export function designTokenStyle(tokens: DesignTokens): TokenStyle {
  return {
    "--design-color-background": tokens.color.background,
    "--design-color-surface": tokens.color.surface,
    "--design-color-foreground": tokens.color.foreground,
    "--design-color-muted": tokens.color.muted,
    "--design-color-border": tokens.color.border,
    "--design-color-primary": tokens.color.primary,
    "--design-color-primary-foreground": tokens.color.primaryForeground,
    "--design-color-secondary": tokens.color.secondary,
    "--design-color-success": tokens.color.success,
    "--design-color-warning": tokens.color.warning,
    "--design-color-danger": tokens.color.danger,
    "--design-color-danger-foreground": tokens.color.dangerForeground,
    "--design-font-display": tokens.typography.display,
    "--design-font-body": tokens.typography.body,
    "--design-font-mono": tokens.typography.mono,
    "--design-type-scale": tokens.typography.scale,
    "--design-space": `${tokens.spacing.base}px`,
    "--design-radius-control": `${tokens.radius.control}px`,
    "--design-radius-surface": `${tokens.radius.surface}px`,
    "--design-shadow-surface": tokens.elevation.surface,
    "--design-motion-duration": `${tokens.motion.duration}ms`,
    "--design-motion-easing": tokens.motion.easing,
  };
}
