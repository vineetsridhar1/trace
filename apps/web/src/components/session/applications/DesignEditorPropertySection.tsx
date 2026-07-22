import type { ReactNode } from "react";
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
  return (
    <section className="space-y-3 border-b border-border px-3.5 py-3.5">
      <h3 className="flex items-center gap-1 text-xs font-semibold text-foreground/90">
        {title}
        {collapsible ? <ChevronDown className="size-3.5 text-muted-foreground" /> : null}
      </h3>
      {children}
    </section>
  );
}
