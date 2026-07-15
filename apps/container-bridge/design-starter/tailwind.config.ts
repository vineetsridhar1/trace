import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        design: {
          background: "var(--design-color-background)",
          surface: "var(--design-color-surface)",
          foreground: "var(--design-color-foreground)",
          muted: "var(--design-color-muted)",
          border: "var(--design-color-border)",
          primary: "var(--design-color-primary)",
          "primary-foreground": "var(--design-color-primary-foreground)",
          secondary: "var(--design-color-secondary)",
          success: "var(--design-color-success)",
          warning: "var(--design-color-warning)",
          danger: "var(--design-color-danger)",
          "danger-foreground": "var(--design-color-danger-foreground)",
        },
      },
      fontFamily: {
        "design-display": "var(--design-font-display)",
        "design-body": "var(--design-font-body)",
        "design-mono": "var(--design-font-mono)",
      },
      spacing: { design: "var(--design-space)" },
      borderRadius: {
        "design-control": "var(--design-radius-control)",
        "design-surface": "var(--design-radius-surface)",
      },
      boxShadow: { "design-surface": "var(--design-shadow-surface)" },
      transitionDuration: { design: "var(--design-motion-duration)" },
      transitionTimingFunction: { design: "var(--design-motion-easing)" },
    },
  },
  plugins: [],
};

export default config;
