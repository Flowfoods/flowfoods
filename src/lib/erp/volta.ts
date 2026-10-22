/**
 * I.1b — "Insumo que falta: cadastrar" sai da nota, da ficha ou das embalagens, cadastra e VOLTA para onde estava. O caminho
 * de volta viaja na URL (`?volta=`) e no formulário, então é dado de fora: só vale caminho INTERNO da área do ERP de quem está
 * logado (`/erp/...` para a pessoa do parceiro, `/rodolfo/erp/<slug>/...` para o nível 1). Qualquer outra coisa (endereço
 * completo, `//outro.site`, barra invertida, `..` que sai da área, caractere de controle) é ignorada, como se não houvesse
 * volta: aberto para fora seria um open redirect. A parte pura mora aqui para ter teste sem banco nem Next.
 */

const ORIGEM_FALSA = 'http://erp.interno';

/** O parâmetro que a página de origem lê para dizer "o insumo que você cadastrou já está na lista". */
export const PARAMETRO_INSUMO_CRIADO = 'insumoCriado';
/** F.1a: o mesmo para o fornecedor que a nota pediu para cadastrar ("Fornecedor novo: cadastrar"). */
export const PARAMETRO_FORNECEDOR_CRIADO = 'fornecedorCriado';

/** `maximo`: o tamanho do endereço (300; o relatório de compras com muitas lojas marcadas pede mais). `prefixo`: onde a volta tem de estar ("/erp/" ou "/rodolfo/erp/<slug>/"). Devolve o caminho limpo (com a busca) ou null. */
export function caminhoDeVolta(valor: unknown, prefixo: string, maximo = 300): string | null {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > maximo) return null;
  if (!prefixo.startsWith('/') || prefixo.startsWith('//') || !prefixo.endsWith('/')) return null;
  if (!valor.startsWith(prefixo)) return null;
  // Barra invertida, controle, espaço e invisíveis: o navegador os trata como outra coisa.
  if (/[\\\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/.test(valor)) return null;
  let u: URL;
  try {
    u = new URL(valor, ORIGEM_FALSA);
  } catch {
    return null;
  }
  if (u.origin !== ORIGEM_FALSA) return null;
  // Barra dupla no caminho ("/erp//x") não é caminho da área: o navegador a trata de outro jeito conforme o contexto.
  if (/\/\/|%2f|%5c/i.test(valor.split('?')[0])) return null;
  // Depois de normalizar ("/erp/../rodolfo"), continua dentro da área.
  if (!u.pathname.startsWith(prefixo)) return null;
  // Voltar para o cadastro de insumo ou de fornecedor faria um laço.
  if (/\/(insumos|fornecedores)\/novo(\/|$)/.test(u.pathname)) return null;
  u.searchParams.delete(PARAMETRO_INSUMO_CRIADO);
  u.searchParams.delete(PARAMETRO_FORNECEDOR_CRIADO);
  return `${u.pathname}${u.search}`;
}

/** O caminho de volta com o insumo criado (a página de origem o lê para avisar e oferecer o insumo). */
export function voltaComInsumo(caminho: string, insumoId: string): string {
  const u = new URL(caminho, ORIGEM_FALSA);
  u.searchParams.set(PARAMETRO_INSUMO_CRIADO, insumoId);
  return `${u.pathname}${u.search}`;
}

/** O caminho de volta com o fornecedor criado (a nota o lê para escolhê-lo no lugar certo). */
export function voltaComFornecedor(caminho: string, fornecedorId: string): string {
  const u = new URL(caminho, ORIGEM_FALSA);
  u.searchParams.set(PARAMETRO_FORNECEDOR_CRIADO, fornecedorId);
  return `${u.pathname}${u.search}`;
}

/** Para o botão e o texto: de onde a pessoa veio. */
export function rotuloDaVolta(caminho: string): string {
  if (/\/compras\/relatorios\//.test(caminho)) return 'o relatório de compras';
  if (/\/compras\/recebidas\//.test(caminho)) return 'a conferência da nota fiscal';
  if (/\/compras\//.test(caminho)) return 'a nota de compra';
  if (/\/fichas\/[^/]+\/canais/.test(caminho)) return 'as embalagens da ficha';
  if (/\/fichas\//.test(caminho)) return 'a ficha técnica';
  return 'a tela anterior';
}
