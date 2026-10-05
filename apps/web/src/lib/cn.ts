// ponytail: só junta classes truthy; não resolve conflito de utilitários
// (ex.: "p-2" + "p-4"). O PR 09 troca por clsx + tailwind-merge.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
