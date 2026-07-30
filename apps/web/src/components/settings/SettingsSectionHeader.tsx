import type { ReactNode } from "react";

export function SettingsSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
