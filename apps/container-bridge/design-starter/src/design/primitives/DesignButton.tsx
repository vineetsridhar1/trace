import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center rounded-design-control px-4 font-design-body text-sm font-semibold transition duration-design ease-design focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      intent: {
        primary: "bg-design-primary text-design-primary-foreground",
        secondary: "border border-design-border bg-design-surface text-design-foreground",
        ghost: "bg-transparent text-design-foreground",
        danger: "bg-design-danger text-design-danger-foreground",
      },
      size: {
        compact: "min-h-11 px-3",
        default: "min-h-12 px-5",
      },
    },
    defaultVariants: { intent: "primary", size: "default" },
  },
);

type DesignButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function DesignButton({
  className,
  intent,
  size,
  type = "button",
  ...props
}: DesignButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ intent, size }), className)} {...props} />
  );
}
