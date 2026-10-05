/** Formatadores puros de exibição. Locale padrão pt-BR; todo formatador aceita outro. */
export const DEFAULT_LOCALE = "pt-BR";

/** O que não é número finito (NaN, Infinity) vira este marcador em vez de "NaN" na tela. */
export const EMPTY = "—";

const cache = new Map<string, Intl.NumberFormat>();

/** Intl.NumberFormat é caro de construir; reaproveita por locale + opções. */
function numberFormat(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    cache.set(key, format);
  }
  return format;
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  locale = DEFAULT_LOCALE,
): string {
  return Number.isFinite(value) ? numberFormat(locale, options).format(value) : EMPTY;
}

/**
 * Moeda com 2 casas; abaixo de um centavo usa 2 dígitos significativos para o custo
 * de uma chamada barata não aparecer como "US$ 0,00".
 */
export function formatCurrency(value: number, currency = "USD", locale = DEFAULT_LOCALE): string {
  const tiny = value !== 0 && Math.abs(value) < 0.01;
  return formatNumber(
    value,
    tiny
      ? { style: "currency", currency, maximumSignificantDigits: 2 }
      : { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 },
    locale,
  );
}

const TOKEN_SUFFIXES = ["", "k", "M", "B"] as const;

/** Contagem de tokens compacta: 950 → "950", 1200 → "1,2k", 3_400_000 → "3,4M". */
export function formatTokens(value: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs < 1000) return formatNumber(value, { maximumFractionDigits: 0 }, locale);
  // Sobe de unidade enquanto o valor arredondado a 1 casa chega a 1000: 999_950 é "1M", não "1000k".
  let i = 1;
  while (i < TOKEN_SUFFIXES.length - 1 && Math.round((abs / 1000 ** i) * 10) / 10 >= 1000) i++;
  return `${formatNumber(value / 1000 ** i, { maximumFractionDigits: 1 }, locale)}${TOKEN_SUFFIXES[i]}`;
}

const unit = (value: number, name: string, locale: string, maximumFractionDigits = 0) =>
  formatNumber(
    value,
    { style: "unit", unit: name, unitDisplay: "short", maximumFractionDigits },
    locale,
  );

/**
 * Duração em milissegundos: 850 → "850 ms", 1500 → "1,5 s", 65_000 → "1 min 5 s",
 * 3_660_000 → "1 h 1 min". Acima de um minuto as partes zeradas somem.
 */
export function formatDuration(ms: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  // Compara já arredondado, como na tela: 999,6 ms é "1 s" e 59,96 s é "1 min".
  if (Math.round(ms) < 1000) return unit(Math.round(ms), "millisecond", locale);
  if (Math.round(ms / 100) < 600) return unit(ms / 1000, "second", locale, 1);

  const total = Math.round(ms / 1000);
  const parts = [
    [Math.floor(total / 3600), "hour"],
    [Math.floor((total % 3600) / 60), "minute"],
    [total % 60, "second"],
  ] as const;
  return parts
    .filter(([amount]) => amount > 0)
    .map(([amount, name]) => unit(amount, name, locale))
    .join(" ");
}
