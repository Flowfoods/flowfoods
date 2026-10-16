/**
 * Destino depois de entrar, só dentro da casa. O `callbackUrl` vem da URL (dá
 * para forjar): `javascript:...`, `//outro.site`, `https://outro.site` ou um
 * caminho fora da área viram o destino padrão. Puro (navegador e servidor).
 */
export function destinoSeguro(
  pedido: string | null | undefined,
  origem: string,
  area: RegExp,
  padrao: string,
): string {
  if (!pedido) return padrao;
  let url: URL;
  try {
    url = new URL(pedido, origem);
  } catch {
    return padrao;
  }
  if (url.origin !== new URL(origem).origin) return padrao;
  if (!area.test(url.pathname)) return padrao;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Área do nível 1 (/rodolfo e o que vem abaixo). */
export const AREA_DO_RODOLFO = /^\/rodolfo(\/|$)/;
/** Área da pessoa do parceiro depois de entrar. */
export const AREA_DO_ERP = /^\/(erp|entrar\/escolher)(\/|$)/;
