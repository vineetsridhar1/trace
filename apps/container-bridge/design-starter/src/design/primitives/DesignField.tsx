import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../lib/cn";

type DesignFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
};

export function DesignField({ id, label, hint, error, className, ...props }: DesignFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = hint || error ? `${inputId}-description` : undefined;

  return (
    <label htmlFor={inputId} className="grid gap-2 font-design-body text-sm text-design-foreground">
      <span className="font-semibold">{label}</span>
      <input
        id={inputId}
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "min-h-11 rounded-design-control border border-design-border bg-design-background px-3 text-design-foreground outline-none transition duration-design ease-design placeholder:text-design-muted focus:border-design-primary focus:ring-2 focus:ring-design-primary",
          className,
        )}
        {...props}
      />
      {descriptionId ? (
        <span
          id={descriptionId}
          className={cn("text-xs text-design-muted", error && "text-design-danger")}
        >
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}
