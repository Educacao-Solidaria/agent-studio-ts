export type Theme = "light" | "dark" | "system";

/** Aplica o tema no elemento raiz; "system" devolve o controle ao prefers-color-scheme. */
export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, "dataset"> = document.documentElement,
) {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
