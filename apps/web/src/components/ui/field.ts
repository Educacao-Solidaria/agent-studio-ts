/** Estilo comum a Input e Textarea: borda, foco visível e estado inválido via aria-invalid. */
export const fieldClass =
  "w-full rounded-md border border-input bg-surface px-3 text-surface-foreground placeholder:text-muted-foreground " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring " +
  "aria-invalid:border-danger aria-invalid:ring-danger disabled:cursor-not-allowed disabled:opacity-50";
