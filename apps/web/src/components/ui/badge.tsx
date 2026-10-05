import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";

const variants = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
} as const;

export type BadgeProps = ComponentProps<"span"> & { variant?: keyof typeof variants };

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 font-medium text-xs",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
