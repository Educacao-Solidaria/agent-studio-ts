import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge precisa conhecer os tokens próprios do globals.css para resolver conflitos. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["gutter", "panel"],
      animate: ["fade-in", "fade-out", "pop-in", "pop-out"],
    },
  },
});

/** Junta classes condicionais (clsx) e a última utilidade conflitante vence (tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
