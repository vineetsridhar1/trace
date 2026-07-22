import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function DesignEditorPropertySection({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="space-y-3 border-b border-border px-3.5 py-3.5">
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-center justify-between text-xs font-semibold text-foreground/90"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {title}
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
      ) : (
        <h3 className="text-xs font-semibold text-foreground/90">{title}</h3>
      )}
      {!collapsed ? children : null}
    </section>
  );
}
