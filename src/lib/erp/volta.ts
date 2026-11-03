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

/**
 * L.4: a tela de origem de um movimento (requisição, contagem, lote, nota) é aberta com `?volta=` apontando para os movimentos do
 * consumo; aqui o endereço é validado (só caminho interno da MESMA área) e ganha o rótulo do "Voltar para ...". `raiz`: `/erp` ou
 * `/rodolfo/erp/<slug>`. Sem volta válida, a tela de origem segue com o seu "Voltar" de sempre.
 */
export function voltaDoRelatorio(valor: unknown, raiz: string): { href: string; rotulo: string } | null {
  const href = caminhoDeVolta(valor, `${raiz}/`, 2000);
  return href ? { href, rotulo: rotuloDaVolta(href) } : null;
}

/** A Home de cada área: `/erp` (pessoa do parceiro) ou `/rodolfo/erp/<slug>` (nível 1), a mesma forma que a Home aceita. */
const HOME_DA_AREA = /^(?:\/erp|\/rodolfo\/erp\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Decisão 517 (revisão): a composição de uma linha do DRE aberta pela Home ("Conferir este valor") recebe `?volta=` com a Home
 * da área, e SÓ ela: o valor tem de ser exatamente a `raiz` de quem lê (a da sessão), sem query (as únicas que a Home lê hoje
 * são os avisos "sem acesso"/"sem módulo", que uma volta não pode trazer) e sem `%` (nada de caminho codificado, como
 * `/erp/dre/d%65spesas`, que passaria por outra tela). Qualquer outro caminho: nulo, e a tela segue com o seu Voltar de sempre.
 * A loja da Home vem da visão escolhida (cookie), que a tela de origem não toca.
 *
 * Decisão 518: a mesma regra, sem afrouxar, serve à pendência de lançamentos faltando da Home, que abre o Faturamento.
 */
export function voltaParaAHome(valor: unknown, raiz: string): VoltaParaAHome | null {
  if (typeof valor !== 'string' || !HOME_DA_AREA.test(raiz) || valor.includes('%') || valor !== raiz) return null;
  return { href: raiz, rotulo: 'o início' } as VoltaParaAHome;
}

declare const CONFERIDA: unique symbol;
/**
 * Decisão 518 (revisão): a volta conferida tem tipo próprio, marcado, que só `voltaParaAHome` produz. Um `{ href }` montado à
 * mão (vindo da URL ou do formulário) não passa no tipo de `comVoltaParaAHome`.
 */
export type VoltaParaAHome = { readonly href: string; readonly rotulo: string; readonly [CONFERIDA]: true };

/** Decisão 517: o nome de origem continua valendo para a composição do DRE. */
export const voltaDaComposicao = voltaParaAHome;

/**
 * Decisão 518: leva a volta da Home adiante, de tela em tela do mesmo circuito (mês → dia → mês). Só aceita a volta já
 * conferida por `voltaParaAHome` (o tipo marcado); sem ela, o endereço sai como entrou.
 */
export function comVoltaParaAHome(href: string, volta: VoltaParaAHome | null | undefined): string {
  if (!volta) return href;
  return `${href}${href.includes('?') ? '&' : '?'}volta=${encodeURIComponent(volta.href)}`;
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
  // Jornada 4 (decisão 464): do DRE para os registros e de volta.
  if (/\/dre\/despesas\?(.*&)?linha=/.test(caminho)) return 'o que forma o número do DRE';
  if (/\/dre\/cmv-categorias/.test(caminho)) return 'o CMV por categoria';
  if (/\/dre(\?|$)/.test(caminho)) return 'o DRE';
  if (/\/estoque\/relatorios\/consumo\/movimentos/.test(caminho)) return 'os movimentos do consumo';
  if (/\/estoque\/relatorios\/consumo/.test(caminho)) return 'o consumo e a conciliação';
  if (/\/compras\/relatorios\/comparar-/.test(caminho)) return 'a comparação de compras';
  if (/\/compras\/relatorios\//.test(caminho)) return 'o relatório de compras';
  if (/\/compras\/recebidas\//.test(caminho)) return 'a conferência da nota fiscal';
  if (/\/compras\//.test(caminho)) return 'a nota de compra';
  if (/\/fichas\/[^/]+\/canais/.test(caminho)) return 'as embalagens da ficha';
  if (/\/fichas\//.test(caminho)) return 'a ficha técnica';
  return 'a tela anterior';
}
