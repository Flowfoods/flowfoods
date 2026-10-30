/**
 * Precificação dentro da ficha técnica (1.9) — a parte PURA (sem banco, sem
 * Next): custo por canal em camadas, leitura das embalagens de cada canal e da
 * taxa do iFood, retrato para o histórico.
 *
 * As camadas (contrato da 1.9):
 *   Loja      = insumos (o custo de UMA porção da ficha, em cascata — 1.3/1.5)
 *   Delivery  = insumos + embalagens do delivery
 *   iFood     = insumos + embalagens do iFood + taxa do iFood
 *
 * Embalagem é item de estoque (Insumo tipo Embalagem) e entra INTEIRA: sem
 * fator de correção (rendimento ~100 %). O custo dela é o custo de referência
 * (último preço da nota, 1.5): a nota da caixa mais cara sobe o delivery e o
 * iFood na próxima leitura.
 *
 * A taxa do iFood é porcentagem do PREÇO de venda (comissão + pagamento
 * online, pontos-base). O preço é da 1.10: sem preço, a camada fica "26,2% do
 * preço" (pendente) e o total é o custo sem a taxa + essa porcentagem. Com
 * preço (`precoCentavos`), a taxa vira valor exato — a conta já está pronta.
 *
 * Tudo em fração exata (BigInt); arredonda só na tela. Incompleto sobe: insumo
 * da ficha sem preço, embalagem sem preço ou taxa do iFood não configurada.
 */

import { itensEmTexto, custoDoInsumo, type CustoDaFicha, type InsumoDaFicha } from './ficha-campos';
import type { Erros, Leitura } from './insumo-campos';
import {
  custoDoUso,
  custoPorUnidade,
  escalaDaSigla,
  formatarFracao,
  formatarPontosBase,
  lerPontosBase,
  lerQuantidadeNa,
  somar,
  UNIDADES,
  ZERO,
  type Fracao,
  type Unidade,
} from './unidades';

// ------------------------------------------------------------------ canais

export type CanalVenda = 'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD';

export const ORDEM_DOS_CANAIS: readonly CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];

export const CANAIS: Record<CanalVenda, { rotulo: string; curto: string; camada: string }> = {
  LOJA: { rotulo: 'Loja', curto: 'Loja', camada: 'Salão e balcão: só os insumos' },
  DELIVERY_PROPRIO: { rotulo: 'Delivery próprio', curto: 'Delivery', camada: 'Insumos + embalagens do delivery' },
  IFOOD: { rotulo: 'iFood', curto: 'iFood', camada: 'Insumos + embalagens do iFood + taxa do iFood' },
};

/** Os canais que levam embalagem (o banco também recusa na LOJA: CHECK da 0.1). */
export const CANAIS_COM_EMBALAGEM = ['DELIVERY_PROPRIO', 'IFOOD'] as const;
export type CanalComEmbalagem = (typeof CANAIS_COM_EMBALAGEM)[number];

export const ehCanalComEmbalagem = (c: unknown): c is CanalComEmbalagem => c === 'DELIVERY_PROPRIO' || c === 'IFOOD';

export const LIMITES_DO_CANAL = {
  /** Embalagens por canal (caixa, sacola, guardanapo, talher, sachê...). */
  embalagens: 20,
  /** Por porção vendida: 1.000 un (ou kg/L). CHECK no banco. */
  quantidadeMilesimos: 1_000_000,
} as const;

// ------------------------------------------------------------- taxa do canal

/** Taxa do canal sobre o preço, em pontos-base (23 % = 2300). */
export interface TaxaDoCanal {
  comissaoBp: number;
  pagamentoBp: number;
}

/** A meta pode existir antes da taxa. A existência da linha e seus zeros internos não comprovam taxa informada. */
export function taxaConfiguradaDaLinha(linha: { taxaConfigurada: boolean; taxaBp: number; taxaPagamentoBp: number } | null | undefined): TaxaDoCanal | null {
  return linha?.taxaConfigurada ? { comissaoBp: linha.taxaBp, pagamentoBp: linha.taxaPagamentoBp } : null;
}

export const taxaTotalBp = (t: TaxaDoCanal) => t.comissaoBp + t.pagamentoBp;

/** Exatamente `bp` pontos-base de `precoCentavos`, em fração de centavos (nada arredonda aqui). */
export function taxaSobrePreco(precoCentavos: number, bp: number): Fracao {
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos < 0) throw new RangeError('Preço inválido.');
  return { num: BigInt(precoCentavos) * BigInt(bp), den: 10_000n };
}

/** "a cada R$ 10,00 de preço, R$ 2,62 ficam com o iFood" — a taxa dita em dinheiro, sem inventar preço. */
export const taxaACadaDezReais = (bp: number) => formatarFracao(taxaSobrePreco(1000, bp));

/**
 * Formulário da taxa do iFood → pontos-base. Comissão obrigatória (o plano do
 * iFood sempre tem); pagamento online vazio = 0. Cada uma de 0 a 100 %; as
 * duas juntas abaixo de 100 % (com 100 % nenhum preço cobre o custo).
 */
export function lerTaxaDoCanal(entrada: { comissao?: unknown; pagamento?: unknown }): Leitura<TaxaDoCanal> {
  const erros: Erros = {};
  const ler = (v: unknown, campo: 'comissao' | 'pagamento', obrigatorio: boolean): number | null => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t) {
      if (obrigatorio) erros[campo] = 'Diga a comissão do seu plano no iFood, em %. Ex.: 23 ou 12,5.';
      return obrigatorio ? null : 0;
    }
    const bp = lerPontosBase(t);
    if (bp === null) erros[campo] = 'Porcentagem inválida. Ex.: 23 ou 3,2 (até 2 casas).';
    else if (bp > 10_000) erros[campo] = 'Porcentagem vai de 0 a 100.';
    return bp === null || bp > 10_000 ? null : bp;
  };
  const comissaoBp = ler(entrada.comissao, 'comissao', true);
  const pagamentoBp = ler(entrada.pagamento, 'pagamento', false);
  if (comissaoBp !== null && pagamentoBp !== null && comissaoBp + pagamentoBp >= 10_000) {
    erros.geral = `Comissão + pagamento dão ${formatarPontosBase(comissaoBp + pagamentoBp)} do preço: com 100% ou mais, nenhum preço cobre o custo. Confira os números.`;
  }
  if (comissaoBp === null || pagamentoBp === null || Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { comissaoBp, pagamentoBp } };
}

/** "23% de comissão + 3,2% de pagamento online = 26,2% do preço". */
export function contaDaTaxa(t: TaxaDoCanal): string {
  const total = formatarPontosBase(taxaTotalBp(t));
  if (t.pagamentoBp === 0) return `${formatarPontosBase(t.comissaoBp)} de comissão = ${total} do preço`;
  return `${formatarPontosBase(t.comissaoBp)} de comissão + ${formatarPontosBase(t.pagamentoBp)} de pagamento online = ${total} do preço`;
}

// --------------------------------------------------------------- embalagens

/** Embalagem do cadastro como a regra precisa dela. */
export interface EmbalagemDoCadastro {
  id: string;
  nome: string;
  unidade: Unidade;
  tipo: string;
  ativo: boolean;
}

/** O que chega do formulário, uma linha por embalagem. */
export interface EmbalagemDigitada {
  canal: string;
  insumoId: string;
  /** Texto, como digitado ("1", "2", "5"). */
  quantidade: string;
  /** Sigla: un, g, kg, ml, L. */
  unidade: string;
}

export interface EmbalagemDoCanal {
  canal: CanalComEmbalagem;
  insumoId: string;
  quantidadeMilesimos: number;
}

/** Chave do erro de uma linha ("emb-IFOOD-2"). */
export const chaveDaEmbalagem = (canal: string, i: number) => `emb-${canal}-${i}`;

/**
 * Formulário → embalagens por canal, prontas para gravar. `cadastro` = os
 * insumos que a entrada cita, lidos pelo portão (de outro parceiro: não estão
 * aqui). Só insumo tipo Embalagem; desativado (ou que deixou de ser
 * embalagem) só fica se já estava naquele canal (`jaNoCanal`, "CANAL:id").
 */
export function lerEmbalagens(
  linhas: readonly EmbalagemDigitada[],
  cadastro: ReadonlyMap<string, EmbalagemDoCadastro>,
  jaNoCanal: ReadonlySet<string> = new Set(),
): Leitura<EmbalagemDoCanal[]> {
  const erros: Erros = {};
  const out: EmbalagemDoCanal[] = [];
  for (const canal of CANAIS_COM_EMBALAGEM) {
    const doCanal = linhas.filter((l) => l.canal === canal);
    if (doCanal.length > LIMITES_DO_CANAL.embalagens) erros[`emb-${canal}`] = `Até ${LIMITES_DO_CANAL.embalagens} embalagens por canal.`;
    const vistos = new Map<string, number>();
    doCanal.slice(0, LIMITES_DO_CANAL.embalagens).forEach((l, i) => {
      const chave = chaveDaEmbalagem(canal, i);
      const ins = l.insumoId ? cadastro.get(l.insumoId) : undefined;
      if (!l.insumoId) return void (erros[chave] = 'Escolha a embalagem.');
      if (!ins) return void (erros[chave] = 'Embalagem não encontrada neste cadastro.');
      const ja = jaNoCanal.has(`${canal}:${ins.id}`);
      if (ins.tipo !== 'EMBALAGEM' && !ja) return void (erros[chave] = `“${ins.nome}” não é embalagem: em Insumos, o tipo dele é outro.`);
      if (!ins.ativo && !ja) return void (erros[chave] = `“${ins.nome}” está desativada: reative em Insumos para usar.`);
      const repetida = vistos.get(ins.id);
      if (repetida !== undefined) return void (erros[chave] = `“${ins.nome}” já está neste canal (linha ${repetida + 1}).`);
      vistos.set(ins.id, i);
      const u = UNIDADES[ins.unidade];
      const escala = escalaDaSigla(l.unidade, ins.unidade);
      if (!escala)
        return void (erros[chave] = `“${ins.nome}” é medida em ${u.nome.toLowerCase()}: use ${ins.unidade === 'UN' ? 'un' : `${u.menor} ou ${u.sigla}`}.`);
      const t = l.quantidade.trim();
      if (!t) return void (erros[chave] = `Quanto de “${ins.nome}” vai em cada porção?`);
      const q = lerQuantidadeNa(t, ins.unidade, escala);
      if (q === null) return void (erros[chave] = escala === 'menor' ? `Em ${u.menor}, só números inteiros.` : 'Quantidade inválida. Ex.: 1 ou 2.');
      if (q === 0) return void (erros[chave] = 'A quantidade precisa ser maior que zero.');
      if (q > LIMITES_DO_CANAL.quantidadeMilesimos) return void (erros[chave] = `Mais de 1.000 ${u.sigla} por porção? Confira o número.`);
      out.push({ canal, insumoId: ins.id, quantidadeMilesimos: q });
    });
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: out };
}

/**
 * Impressão da lista gravada (canal, insumo, quantidade), na ordem: é o que a
 * tela leu. Gravar só passa se o banco ainda tem a MESMA lista (duas abas: a
 * segunda recebe "alguém alterou", nada é sobrescrito).
 */
export function impressaoDasEmbalagens(lista: readonly { canal: string; insumoId: string; quantidadeMilesimos: number }[]): string {
  return lista.map((e) => `${e.canal}:${e.insumoId}:${e.quantidadeMilesimos}`).join('|');
}

/** Campo do histórico de cada canal. */
export const CAMPO_DO_CANAL: Record<CanalComEmbalagem, 'embalagensDelivery' | 'embalagensIfood'> = {
  DELIVERY_PROPRIO: 'embalagensDelivery',
  IFOOD: 'embalagensIfood',
};

export const SEM_EMBALAGEM = 'Nenhuma';

/** Retrato das embalagens para o histórico da ficha: "Caixa kraft 1 un · Guardanapo 2 un" por canal. */
export function retratoDasEmbalagens(
  lista: readonly EmbalagemDoCanal[],
  nomes: ReadonlyMap<string, { nome: string; unidade: Unidade }>,
): Record<'embalagensDelivery' | 'embalagensIfood', string> {
  const doCanal = (c: CanalComEmbalagem) => {
    // Na ordem do nome (a da tela): a mesma lista em outra ordem não é mudança.
    const l = lista
      .filter((e) => e.canal === c)
      .map((e) => ({
        nome: nomes.get(e.insumoId)?.nome ?? '?',
        unidade: nomes.get(e.insumoId)?.unidade ?? ('UN' as const),
        quantidadeMilesimos: e.quantidadeMilesimos,
      }))
      .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
    if (l.length === 0) return SEM_EMBALAGEM;
    return itensEmTexto(l);
  };
  return { embalagensDelivery: doCanal('DELIVERY_PROPRIO'), embalagensIfood: doCanal('IFOOD') };
}

// ------------------------------------------------------------------ camadas

/** Embalagem com o que a conta precisa: o insumo (custo de referência, 1.5) e a quantidade por porção. */
export interface EmbalagemParaCusto {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  insumo: Pick<InsumoDaFicha, 'precoEmbalagemCentavos' | 'taxaEntregaCentavos' | 'conteudoMilesimos' | 'ultimaCompra'>;
}

export type TaxaDaCamada =
  /** O canal não cobra sobre o preço (loja e delivery próprio, na 1.9). */
  | { tipo: 'nenhuma' }
  /** Cobra, mas ninguém disse quanto: o canal fica incompleto. */
  | { tipo: 'naoConfigurada' }
  /** % do preço; `valor` só com preço (1.10), senão null = pendente de preço. */
  | { tipo: 'sobrePreco'; taxa: TaxaDoCanal; totalBp: number; valor: Fracao | null };

export interface CamadasDoCanal {
  canal: CanalVenda;
  /** Custo de UMA porção da ficha (a cascata). */
  daFicha: Fracao;
  /** Itens da ficha sem preço (até o fundo da cascata). */
  insumosSemPreco: string[];
  /** Embalagens do canal, cada uma com o custo exato (null = sem preço). LOJA: lista vazia. */
  embalagens: { insumoId: string; nome: string; unidade: Unidade; quantidadeMilesimos: number; valor: Fracao | null }[];
  embalagensTotal: Fracao;
  embalagensSemPreco: string[];
  taxa: TaxaDaCamada;
  /** Insumos + embalagens (o que não depende do preço). */
  semTaxa: Fracao;
  /** Com a taxa resolvida (preço dado) ou canal sem taxa; null = falta o preço para fechar. */
  total: Fracao | null;
  /** Algo sem preço ou taxa não configurada: o número é parcial. */
  incompleto: boolean;
}

/**
 * As camadas de um canal. `custoDaFicha` é o da ficha de PRATO (por porção =
 * `porRendimento`). `taxa`: null = o canal não cobra (loja, delivery);
 * `'naoConfigurada'` = cobra e falta configurar (iFood sem a taxa do
 * parceiro). `precoCentavos` (1.10): resolve a taxa em dinheiro.
 */
export function camadasDoCanal(p: {
  canal: CanalVenda;
  custoDaFicha: Pick<CustoDaFicha, 'porRendimento' | 'faltaPreco'>;
  embalagens: readonly EmbalagemParaCusto[];
  taxa: TaxaDoCanal | null | 'naoConfigurada';
  precoCentavos?: number | null;
}): CamadasDoCanal {
  const doCanal = p.canal === 'LOJA' ? [] : p.embalagens;
  let embalagensTotal = ZERO;
  const embalagensSemPreco: string[] = [];
  const embalagens = doCanal.map((e) => {
    const custo = custoDoInsumo(e.insumo);
    // ~100 % de rendimento: a embalagem entra inteira (fator 1).
    const valor = custo ? custoDoUso(custoPorUnidade(custo), e.quantidadeMilesimos) : null;
    if (valor) embalagensTotal = somar(embalagensTotal, valor);
    else embalagensSemPreco.push(e.nome);
    return { insumoId: e.insumoId, nome: e.nome, unidade: e.unidade, quantidadeMilesimos: e.quantidadeMilesimos, valor };
  });
  const semTaxa = somar(p.custoDaFicha.porRendimento, embalagensTotal);
  const preco = typeof p.precoCentavos === 'number' ? p.precoCentavos : null;
  let taxa: TaxaDaCamada;
  if (p.taxa === null) taxa = { tipo: 'nenhuma' };
  else if (p.taxa === 'naoConfigurada') taxa = { tipo: 'naoConfigurada' };
  else {
    const totalBp = taxaTotalBp(p.taxa);
    taxa = { tipo: 'sobrePreco', taxa: p.taxa, totalBp, valor: preco === null ? null : taxaSobrePreco(preco, totalBp) };
  }
  const total = taxa.tipo === 'nenhuma' ? semTaxa : taxa.tipo === 'sobrePreco' && taxa.valor ? somar(semTaxa, taxa.valor) : null;
  return {
    canal: p.canal,
    daFicha: p.custoDaFicha.porRendimento,
    insumosSemPreco: [...p.custoDaFicha.faltaPreco],
    embalagens,
    embalagensTotal,
    embalagensSemPreco,
    taxa,
    semTaxa,
    total,
    incompleto: p.custoDaFicha.faltaPreco.length > 0 || embalagensSemPreco.length > 0 || taxa.tipo === 'naoConfigurada',
  };
}

const citar = (nomes: readonly string[]) =>
  nomes.length === 1
    ? `“${nomes[0]}”`
    : `${nomes
        .slice(0, -1)
        .map((n) => `“${n}”`)
        .join(', ')} e “${nomes[nomes.length - 1]}”`;

/** Por que o canal está incompleto, numa frase ("falta preço em “Sacola”; taxa do iFood não configurada"). */
export function porQueIncompleto(c: CamadasDoCanal): string | null {
  const partes: string[] = [];
  const semPreco = Array.from(new Set([...c.insumosSemPreco, ...c.embalagensSemPreco]));
  if (semPreco.length) partes.push(`falta preço em ${citar(semPreco)}`);
  if (c.taxa.tipo === 'naoConfigurada') partes.push('taxa do iFood não configurada');
  return partes.length ? partes.join('; ') : null;
}

/** O total do canal por extenso: "R$ 11,10" ou, sem preço, "R$ 11,67 + 26,2% do preço". */
export function totalEmTexto(c: CamadasDoCanal): string {
  if (c.total) return formatarFracao(c.total);
  if (c.taxa.tipo === 'sobrePreco') return `${formatarFracao(c.semTaxa)} + ${formatarPontosBase(c.taxa.totalBp)} do preço`;
  return formatarFracao(c.semTaxa);
}
