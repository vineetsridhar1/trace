/**
 * Motion tokens. Springs are tuned for Reanimated's `withSpring`:
 * - `snap`         — fast, minimal overshoot; tap feedback, small UI toggles
 * - `smooth`       — default list reorders, screen-level state changes
 * - `gentle`       — slower, softer; banners, detented sheets
 * - `morph.open`   — bouncy unfold; pill -> panel transitions
 * - `morph.close`  — snappier collapse; panel -> pill on dismiss
 *
 * Timing durations are for fades / opacity / typing cursor blinks where a
 * spring would feel wrong. `accordion` is the inline expand/collapse used
 * by tool-call rows (paired with a custom bezier easing at call sites).
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
    morph: {
      open: SpringConfig;
      close: SpringConfig;
    };
  };
  durations: {
    instant: number;
    fast: number;
    base: number;
    slow: number;
    accordion: number;
    typingBlink: number;
  };
}

export const motion: ThemeMotion = {
  springs: {
    snap: { damping: 25, stiffness: 400, mass: 1 },
    smooth: { damping: 20, stiffness: 250, mass: 1 },
    gentle: { damping: 18, stiffness: 180, mass: 1 },
    morph: {
      open: { damping: 14, stiffness: 120, mass: 1.2 },
      close: { damping: 22, stiffness: 190, mass: 1.2 },
    },
  },
  durations: {
    instant: 80,
    fast: 150,
    base: 250,
    slow: 400,
    accordion: 220,
    typingBlink: 800,
  },
};
