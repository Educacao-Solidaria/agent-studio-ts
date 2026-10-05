import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";
import { fieldClass } from "./field.ts";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(fieldClass, "h-10", className)} {...props} />;
}
