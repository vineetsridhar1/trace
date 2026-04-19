/**
 * Motion tokens. Springs are tuned for Reanimated's `withSpring`:
 * - `snap`    — fast, minimal overshoot; tap feedback, small UI toggles
 * - `smooth`  — default list reorders, screen-level state changes
 * - `gentle`  — slower, softer; banners, detented sheets
 *
 * Timing durations are for fades / opacity / typing cursor blinks where a
 * spring would feel wrong.
 */
export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

export interface ThemeMotion {
  springs: {
    snap: SpringConfig;
    smooth: SpringConfig;
    gentle: SpringConfig;
  };
  durations: {
    instant: number;
    fast: number;
    base: number;
    slow: number;
    typingBlink: number;
  };
}

export const motion: ThemeMotion = {
  springs: {
    snap: { damping: 25, stiffness: 400, mass: 1 },
    smooth: { damping: 20, stiffness: 250, mass: 1 },
    gentle: { damping: 18, stiffness: 180, mass: 1 },
  },
  durations: {
    instant: 80,
    fast: 150,
    base: 250,
    slow: 400,
    typingBlink: 800,
  },
};
