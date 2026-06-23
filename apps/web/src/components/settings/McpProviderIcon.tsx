import { Plug } from "lucide-react";

const BRAND: Record<string, { bg: string; fg: string; label: string }> = {
  linear: { bg: "#5E6AD2", fg: "#ffffff", label: "L" },
  sentry: { bg: "#362D59", fg: "#ffffff", label: "S" },
  notion: { bg: "#0F0F0F", fg: "#ffffff", label: "N" },
};

function FigmaLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 57" aria-hidden="true">
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

export function McpProviderIcon({ id, className }: { id: string; className?: string }) {
  if (id === "figma") {
    return (
      <div
        className={
          "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 " +
          (className ?? "")
        }
      >
        <FigmaLogo size={18} />
      </div>
    );
  }

  const brand = BRAND[id];
  if (brand) {
    return (
      <div
        className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + (className ?? "")}
        style={{ backgroundColor: brand.bg, color: brand.fg }}
      >
        <span className="text-sm font-semibold">{brand.label}</span>
      </div>
    );
  }

  return (
    <div
      className={
        "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground " +
        (className ?? "")
      }
    >
      <Plug size={16} />
    </div>
  );
}
