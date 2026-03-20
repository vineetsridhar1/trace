import type { ReactNode } from "react";

interface EntityPreviewCardProps {
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function EntityPreviewCard({
  media,
  title,
  subtitle,
  description,
  children,
  footer,
}: EntityPreviewCardProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 p-4">
        {media}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-bold text-foreground">{title}</span>
          </div>
          {subtitle ? (
            <div className="text-xs capitalize text-muted-foreground">{subtitle}</div>
          ) : null}
          {description ? (
            <div className="truncate text-xs text-muted-foreground">{description}</div>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>

      {footer ? (
        <>
          <div className="border-t border-border" />
          <div className="p-2">{footer}</div>
        </>
      ) : null}
    </div>
  );
}
