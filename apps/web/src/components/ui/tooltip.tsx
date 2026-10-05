import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";
import { popoverClass } from "./overlay.ts";

/** Um provider por app controla o atraso compartilhado entre tooltips. */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** Abre no hover e no foco do teclado; o texto é ligado ao gatilho via aria-describedby. */
export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(popoverClass, "px-2 py-1 text-xs", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
