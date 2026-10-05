import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";
import { fieldClass } from "./field.ts";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(fieldClass, "py-2", className)} {...props} />;
}
