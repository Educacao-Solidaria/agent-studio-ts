/** Fim da mensagem do Chromium ("Failed to fetch dynamically imported module: <url>") e do
 * Firefox ("error loading dynamically imported module: <url>"); a do Safari não traz a URL. */
const FAILED_FETCH = /dynamically imported module: (\S+)$/;

/** A URL do módulo que não baixou, se o erro disser qual e ela for da origem do app. */
function failedUrl(error: unknown): URL | undefined {
  const href = error instanceof Error ? FAILED_FETCH.exec(error.message)?.[1] : undefined;
  try {
    const url = new URL(href ?? "");
    return url.origin === location.origin ? url : undefined;
  } catch {
    return undefined; // mensagem sem URL (Safari, erro do próprio módulo) ou URL inválida
  }
}

/**
 * Embrulha o `import()` de um pedaço sob demanda para que "tentar de novo" funcione. O Chromium
 * guarda o `import()` que falhou na rede: a mesma URL falha de novo na hora, sem pedir o arquivo,
 * mesmo com a rede de volta (medido no 148). Por isso, depois de uma falha, o pedido seguinte busca
 * a URL do pedaço com `?retry=N` (outra entrada no mapa de módulos do navegador); os imports dele
 * caem no JS principal, já carregado. Deu certo, o módulo fica guardado, e pedidos ao mesmo tempo
 * esperam o mesmo download.
 *
 * ponytail: só o próprio pedaço se recupera. Dependência dele que falhou (outro pedaço, por import
 * estático ou modulepreload) segue envenenada até recarregar a página, e CSS próprio do pedaço não
 * viria de novo: por isso cada pedaço sob demanda depende só do principal (canvas-dialogs.ts). Sem
 * a URL na mensagem (Safari), repete o `import()` de origem. Saída completa: um plugin de build
 * que reescreva os imports dinâmicos, ou o navegador deixar de guardar a falha.
 */
export function retryImport<T>(
  load: () => Promise<T>,
  importUrl = (href: string): Promise<T> => import(/* @vite-ignore */ href),
): () => Promise<T> {
  let pending: Promise<T> | undefined;
  let failed: URL | undefined;
  let attempt = 0;
  const fetchOnce = () => {
    const url = failed && new URL(failed);
    url?.searchParams.set("retry", String(++attempt));
    return (url ? importUrl(url.href) : load()).catch((error: unknown) => {
      pending = undefined;
      failed ??= failedUrl(error);
      throw error;
    });
  };
  return () => {
    pending ??= fetchOnce();
    return pending;
  };
}
