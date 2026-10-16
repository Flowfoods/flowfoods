/**
 * Estoque (1.6) — regras PURAS, sem banco e sem Next: estado da loja, leitura
 * do que se contou, valor pelo custo de referência, efeito da nota no estoque
 * e o livro-razão em rascunho. As telas e `estoque.ts` usam as mesmas funções
 * (a conta ao vivo da tela é a do servidor).
 *
 * Princípios (Notion "Core · Estoque unificado"):
 * - vazio = NÃO CONTADO; zero é contagem. Nada zera em silêncio;
 * - o que a pessoa digitou (embalagens fechadas + solto, kg ou g) fica
 *   separado do normalizado (milésimos da unidade base);
 * - custo ausente = valor pendente, nunca R$ 0,00 como fato;
 * - inteiros sempre (milésimos e centavos), um arredondamento por item.
 */

import { hojeNoRio } from './compra-campos';
import {
  centavosDaFracao,
  custoDoUso,
  dividirArredondado,
  formatarQuantidade,
  lerQuantidade,
  lerQuantidadeNa,
  UNIDADES,
  type Escala,
  type Fracao,
  type Unidade,
} from './unidades';

// ------------------------------------------------------------------ estado

/** Estado do estoque de uma loja, derivado da contagem de ABERTURA (sem coluna na loja). */
export type EstadoDoEstoque = 'NAO_ABERTO' | 'EM_CONTAGEM' | 'ABERTO';

export const ROTULO_DO_ESTADO: Record<EstadoDoEstoque, string> = {
  NAO_ABERTO: 'Não aberto',
  EM_CONTAGEM: 'Contagem de abertura em andamento',
  ABERTO: 'Aberto',
};

export function estadoDoEstoque(abertura: { status: 'ABERTA' | 'FECHADA' | 'CANCELADA' } | null | undefined): EstadoDoEstoque {
  if (!abertura || abertura.status === 'CANCELADA') return 'NAO_ABERTO';
  return abertura.status === 'ABERTA' ? 'EM_CONTAGEM' : 'ABERTO';
}

// --------------------------------------------------------- contar um item

/** O que a tela manda de um item: textos como digitados. */
export interface ContagemDigitada {
  /** Embalagens fechadas da embalagem padrão ("3", "1,5"); vazio = nenhuma. */
  embalagens: string;
  /** Solto, na escala escolhida ("2,4" kg, "350" g); vazio = nenhum. */
  solto: string;
  /** 'base' (kg, L, un) ou 'menor' (g, ml). */
  escala: string;
}

/** O item como foi congelado ao abrir a contagem. */
export interface ItemParaContar {
  unidade: Unidade;
  /** Conteúdo da embalagem padrão em milésimos; null/1000 = não pergunta embalagens. */
  embalagemConteudoMilesimos: number | null;
}

export interface ContagemLida {
  /** null = NÃO CONTADO (os dois campos vazios). */
  contadoMilesimos: number | null;
  embalagensMilesimos: number | null;
  soltoMilesimos: number | null;
  escala: Escala;
}

/**
 * Teto de uma contagem por item: 100 mil kg/L/un (herança a da 1.6 — o de 1
 * milhão deixava o valor estourar o INTEGER). Nenhuma loja tem 100 toneladas
 * de um insumo; acima disso é dedo errado.
 */
export const TETO_DA_CONTAGEM = 100_000_000;

/** Maior número que cabe numa coluna INTEGER do Postgres (quantidade, valor, saldo). */
export const LIMITE_DO_INTEIRO = 2_147_483_647;

/** Teto do valor de UM item numa contagem: R$ 1 milhão (acima é número errado, não estoque de restaurante). */
export const TETO_DO_VALOR_DO_ITEM = 100_000_000;

/** Cabe na coluna INTEGER (com sinal)? */
export const cabeNoInteiro = (n: number) => Number.isSafeInteger(n) && Math.abs(n) <= LIMITE_DO_INTEIRO;

/** A embalagem padrão vale perguntar? (Caixa de 5 kg sim; "1 kg" é o próprio solto.) */
export const perguntaEmbalagens = (i: ItemParaContar) => !!i.embalagemConteudoMilesimos && i.embalagemConteudoMilesimos !== 1000;

/**
 * Lê o que a pessoa digitou para um item. Total = embalagens × conteúdo
 * (arredondado ao milésimo) + solto. Os dois vazios = não contado (null);
 * "0" é contagem (zero). Erros por campo, em frase.
 */
export function lerContagem(d: ContagemDigitada, item: ItemParaContar): { ok: true; lida: ContagemLida } | { ok: false; erros: Partial<Record<'embalagens' | 'solto', string>> } {
  const escala: Escala = d.escala === 'menor' && item.unidade !== 'UN' ? 'menor' : 'base';
  const erros: Partial<Record<'embalagens' | 'solto', string>> = {};
  const emb = (d.embalagens ?? '').trim();
  const sol = (d.solto ?? '').trim();
  let embalagens: number | null = null;
  let solto: number | null = null;
  if (emb) {
    if (!perguntaEmbalagens(item)) erros.embalagens = 'Este insumo não se conta por embalagem: use o campo ao lado.';
    else {
      embalagens = lerQuantidade(emb);
      if (embalagens === null) erros.embalagens = 'Embalagens: número como 3 ou 1,5.';
    }
  }
  if (sol) {
    solto = lerQuantidadeNa(sol, item.unidade, escala);
    if (solto === null) {
      const u = UNIDADES[item.unidade];
      erros.solto = escala === 'menor' ? `Em ${u.menor}, só número inteiro (ex.: 350).` : `Número como 2,4 (${u.sigla}), até 3 casas.`;
    }
  }
  if (erros.embalagens || erros.solto) return { ok: false, erros };
  if (embalagens === null && solto === null) return { ok: true, lida: { contadoMilesimos: null, embalagensMilesimos: null, soltoMilesimos: null, escala } };
  const daEmbalagem = embalagens !== null && item.embalagemConteudoMilesimos ? dividirArredondado(embalagens * item.embalagemConteudoMilesimos, 1000) : 0;
  const total = daEmbalagem + (solto ?? 0);
  if (!Number.isSafeInteger(total) || total > TETO_DA_CONTAGEM) {
    return { ok: false, erros: { solto: `Passa de ${formatarQuantidade(TETO_DA_CONTAGEM, item.unidade)}, o máximo de uma contagem: confira o número.` } };
  }
  return { ok: true, lida: { contadoMilesimos: total, embalagensMilesimos: embalagens, soltoMilesimos: solto, escala } };
}

/** Milésimos → texto do campo, numa escala ("2,4" kg; "350" g). */
function textoNaEscala(milesimos: number, unidade: Unidade, escala: Escala): string {
  if (escala === 'menor' && unidade !== 'UN') return String(milesimos);
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`;
}

/** O que volta para os campos (outra sessão, outra pessoa): como foi digitado. */
export function camposDaContagem(i: {
  unidade: Unidade;
  embalagensMilesimos: number | null;
  soltoMilesimos: number | null;
  escalaDigitada: string | null;
}): ContagemDigitada {
  const escala: Escala = i.escalaDigitada === 'menor' && i.unidade !== 'UN' ? 'menor' : 'base';
  return {
    embalagens: i.embalagensMilesimos === null ? '' : textoNaEscala(i.embalagensMilesimos, 'UN', 'base'),
    solto: i.soltoMilesimos === null ? '' : textoNaEscala(i.soltoMilesimos, i.unidade, escala),
    escala,
  };
}

/** "3 × Caixa 5 kg + 2,4 kg = 17,4 kg" / "0 kg" / "Não contado". Para o histórico e a conferência. */
export function textoDaContagem(i: {
  unidade: Unidade;
  contadoMilesimos: number | null;
  embalagensMilesimos: number | null;
  soltoMilesimos: number | null;
  embalagemSnapshot: string | null;
}): string {
  if (i.contadoMilesimos === null) return 'Não contado';
  const total = formatarQuantidade(i.contadoMilesimos, i.unidade);
  if (!i.embalagensMilesimos) return total;
  const emb = `${textoNaEscala(i.embalagensMilesimos, 'UN', 'base')} × ${i.embalagemSnapshot ?? 'embalagem'}`;
  return i.soltoMilesimos ? `${emb} + ${formatarQuantidade(i.soltoMilesimos, i.unidade)} = ${total}` : `${emb} = ${total}`;
}

/**
 * Quando o número foi DIGITADO (decisão 76): a tela manda há quantos ms a
 * pessoa digitou (`idadeMs`, medido no relógio do próprio aparelho, então o
 * relógio errado do celular não conta); o servidor tira do seu "agora". É
 * dado do cliente, NÃO confiável: fica preso entre o início da contagem e
 * agora (nunca no futuro, nunca antes de a contagem existir). O pior que um
 * aparelho mal-intencionado consegue é dizer que contou mais tarde do que
 * contou — e o que entrou no livro entre o instante declarado e agora
 * aparece como "depois de contar" e segura o "fecha sozinha".
 */
export function instanteDigitado(agora: Date, idadeMs: unknown, inicioDaContagem: Date): Date {
  const idade = typeof idadeMs === 'number' ? idadeMs : Number(idadeMs);
  const ms = Number.isFinite(idade) && idade > 0 ? Math.trunc(idade) : 0;
  const t = Math.max(inicioDaContagem.getTime(), Math.min(agora.getTime(), agora.getTime() - ms));
  return new Date(Math.min(t, agora.getTime()));
}

// ---------------------------------------------------------------- valor

/**
 * Valor de uma quantidade pelo custo de referência POR UNIDADE (fração exata
 * de centavos por kg/L/un), com UM arredondamento (metade para cima). Sem
 * custo (sem preço, custo incompleto) = null: valor pendente, nunca R$ 0,00.
 * Quantidade negativa (saldo abaixo de zero) dá valor negativo, simétrico.
 */
export function valorDaQuantidade(porUnidade: Fracao | null, quantidadeMilesimos: number): number | null {
  if (!porUnidade) return null;
  if (quantidadeMilesimos === 0) return 0;
  const abs = Math.abs(quantidadeMilesimos);
  const v = Number(centavosDaFracao(custoDoUso(porUnidade, abs)));
  return quantidadeMilesimos < 0 ? -v : v;
}

/** Soma de valores que podem estar pendentes: o total conhecido e quantos ficaram de fora. */
export function somarValores(valores: readonly (number | null)[]): { centavos: number; pendentes: number } {
  let centavos = 0;
  let pendentes = 0;
  for (const v of valores) {
    if (v === null) pendentes++;
    else centavos += v;
  }
  return { centavos, pendentes };
}

// -------------------------------------------------------- resumo da contagem

export interface ResumoDaContagem {
  total: number;
  contados: number;
  /** Contados com zero ("não tem"): contagem válida. */
  zerados: number;
  naoContados: number;
}

export function resumoDaContagem(itens: readonly { contadoMilesimos: number | null }[]): ResumoDaContagem {
  let contados = 0;
  let zerados = 0;
  for (const i of itens) {
    if (i.contadoMilesimos === null) continue;
    contados++;
    if (i.contadoMilesimos === 0) zerados++;
  }
  return { total: itens.length, contados, zerados, naoContados: itens.length - contados };
}

/** "Faltam 12 de 40" / "Todos os 40 contados". */
export function fraseDoQueFalta(r: ResumoDaContagem): string {
  if (r.total === 0) return 'Nenhum insumo para contar.';
  if (r.naoContados === 0) return r.total === 1 ? 'O insumo foi contado' : `Todos os ${r.total} contados`;
  return `${r.naoContados === 1 ? 'Falta' : 'Faltam'} ${r.naoContados} de ${r.total}`;
}

// ------------------------------------------------------- nota × estoque

export type EfeitoDaNota =
  | { movimenta: true }
  | { movimenta: false; motivo: 'nao-aberto' | 'lancada-antes' | 'data-anterior' | 'cancelada' };

/** Data (no Rio) de um instante: "2026-10-19". A abertura vale a partir deste dia. */
export const dataNoRio = (d: Date) => hojeNoRio(d);

/**
 * A nota mexe no estoque da loja? Decisão 68: só se a loja já estava ABERTA
 * quando a nota foi lançada (lançada antes de concluir = a contagem já
 * incluiu) E a data da nota é do dia da abertura em diante (nota de data
 * anterior digitada depois = a mercadoria já estava na prateleira e foi
 * contada). Cancelada nunca mexe (o que mexia é estornado).
 */
export function efeitoDaNota(
  nota: { status: string; lancadaEm: Date | null; entradaEm: string },
  abertura: { abertoEm: Date } | null,
): EfeitoDaNota {
  if (nota.status !== 'LANCADA') return { movimenta: false, motivo: 'cancelada' };
  if (!abertura) return { movimenta: false, motivo: 'nao-aberto' };
  if (!nota.lancadaEm || nota.lancadaEm.getTime() <= abertura.abertoEm.getTime()) return { movimenta: false, motivo: 'lancada-antes' };
  if (nota.entradaEm < dataNoRio(abertura.abertoEm)) return { movimenta: false, motivo: 'data-anterior' };
  return { movimenta: true };
}

/** A frase do efeito, para o detalhe da nota e a prévia. */
export function fraseDoEfeito(e: EfeitoDaNota, loja: string, abertoEm: Date | null): string {
  const data = abertoEm ? formatarDataCurta(abertoEm) : '';
  if (e.movimenta) return `Entrou no estoque da ${loja}.`;
  switch (e.motivo) {
    case 'nao-aberto':
      return `Não mexe no estoque: o estoque da ${loja} ainda não foi aberto. A contagem de abertura inclui o que já está na loja.`;
    case 'lancada-antes':
      return `Não mexe no estoque: lançada antes da abertura do estoque da ${loja} (${data}). A contagem de abertura já incluiu.`;
    case 'data-anterior':
      return `Não mexe no estoque: a data da nota é anterior à abertura do estoque da ${loja} (${data}). A mercadoria já estava na loja e entrou na contagem.`;
    case 'cancelada':
      return 'Nota cancelada: não mexe no estoque.';
  }
}

function formatarDataCurta(d: Date): string {
  const [a, m, dia] = dataNoRio(d).split('-');
  return `${dia}/${m}/${a}`;
}

// ------------------------------------------------------------ livro-razão

export type TipoDeMovimento = 'ABERTURA' | 'ENTRADA_COMPRA' | 'REQUISICAO' | 'PRODUCAO_ENTRADA' | 'PRODUCAO_CONSUMO' | 'AJUSTE' | 'CONTAGEM' | 'PERDA';

export const ROTULO_DO_MOVIMENTO: Record<TipoDeMovimento, string> = {
  ABERTURA: 'Abertura',
  ENTRADA_COMPRA: 'Compra',
  REQUISICAO: 'Requisição',
  PRODUCAO_ENTRADA: 'Produção',
  PRODUCAO_CONSUMO: 'Consumo na produção',
  AJUSTE: 'Ajuste',
  CONTAGEM: 'Contagem',
  PERDA: 'Perda',
};

/** Rascunho de movimento: o que `gravarMovimentos` recebe (saldo antes/depois é calculado lá). */
export interface MovimentoNovo {
  lojaId: string;
  insumoId: string;
  tipo: TipoDeMovimento;
  quantidadeMilesimos: number;
  valorCentavos: number;
  insumoNome: string;
  unidade: Unidade;
  motivo: string | null;
  chave: string;
  notaId?: string | null;
  contagemItemId?: string | null;
  estornoDeId?: string | null;
}

/** Entrada de compra de cada item da nota (valor = valor do item + frete rateado). Item sem insumo ou sem quantidade fica de fora. */
export function entradasDaNota(
  nota: { id: string; lojaId: string; rotulo: string; versao: number },
  itens: readonly { insumoId: string | null; insumoNome: string; unidade: Unidade; quantidadeMilesimos: number; valorCentavos: number; freteRateadoCentavos: number; embalagem: string }[],
): MovimentoNovo[] {
  return itens
    .map((i, ordem) => ({ i, ordem }))
    .filter(({ i }) => i.insumoId && i.quantidadeMilesimos > 0)
    .map(({ i, ordem }) => ({
      lojaId: nota.lojaId,
      insumoId: i.insumoId!,
      tipo: 'ENTRADA_COMPRA' as const,
      quantidadeMilesimos: i.quantidadeMilesimos,
      valorCentavos: i.valorCentavos + i.freteRateadoCentavos,
      insumoNome: i.insumoNome,
      unidade: i.unidade,
      motivo: `${nota.rotulo} · ${i.embalagem}`,
      chave: `compra:${nota.id}:${nota.versao}:${ordem}`,
      notaId: nota.id,
    }));
}

/** O estorno de um movimento: espelho exato (o banco confere por trigger). */
export function estornoDe(
  m: { id: string; lojaId: string; insumoId: string; tipo: TipoDeMovimento; quantidadeMilesimos: number; valorCentavos: number; insumoNomeSnapshot: string; unidadeSnapshot: Unidade; notaId: string | null; contagemItemId: string | null },
  motivo: string,
): MovimentoNovo {
  return {
    lojaId: m.lojaId,
    insumoId: m.insumoId,
    tipo: m.tipo,
    quantidadeMilesimos: -m.quantidadeMilesimos,
    valorCentavos: -m.valorCentavos,
    insumoNome: m.insumoNomeSnapshot,
    unidade: m.unidadeSnapshot,
    motivo,
    chave: `estorno:${m.id}`,
    notaId: m.notaId,
    contagemItemId: m.contagemItemId,
    estornoDeId: m.id,
  };
}

/** Mesmo efeito no estoque (mesmas lojas, insumos, quantidades e valores, em qualquer ordem)? Editar sem mudar o efeito não mexe no razão. */
export function mesmoEfeito(
  a: readonly Pick<MovimentoNovo, 'lojaId' | 'insumoId' | 'quantidadeMilesimos' | 'valorCentavos'>[],
  b: readonly Pick<MovimentoNovo, 'lojaId' | 'insumoId' | 'quantidadeMilesimos' | 'valorCentavos'>[],
): boolean {
  const chave = (m: Pick<MovimentoNovo, 'lojaId' | 'insumoId' | 'quantidadeMilesimos' | 'valorCentavos'>) => `${m.lojaId}|${m.insumoId}|${m.quantidadeMilesimos}|${m.valorCentavos}`;
  const x = a.map(chave).sort();
  const y = b.map(chave).sort();
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

/**
 * Aplica os movimentos sobre os saldos, na ordem (loja, insumo, depois a ordem
 * de chegada): devolve o antes/depois de cada um e o saldo final de cada par.
 * É a mesma conta que o CHECK do banco confere (antes + quantidade = depois).
 */
export function aplicarNosSaldos(
  saldos: ReadonlyMap<string, { quantidadeMilesimos: number; valorCentavos: number }>,
  movimentos: readonly MovimentoNovo[],
): { linhas: (MovimentoNovo & { saldoAntesMilesimos: number; saldoDepoisMilesimos: number })[]; finais: Map<string, { quantidadeMilesimos: number; valorCentavos: number }> } {
  const finais = new Map<string, { quantidadeMilesimos: number; valorCentavos: number }>();
  for (const [k, v] of Array.from(saldos)) finais.set(k, { ...v });
  const ordenados = movimentos.map((m, i) => ({ m, i })).sort((p, q) => (p.m.lojaId < q.m.lojaId ? -1 : p.m.lojaId > q.m.lojaId ? 1 : p.m.insumoId < q.m.insumoId ? -1 : p.m.insumoId > q.m.insumoId ? 1 : p.i - q.i));
  const linhas = ordenados.map(({ m }) => {
    const k = chaveDoSaldo(m.lojaId, m.insumoId);
    const s = finais.get(k) ?? { quantidadeMilesimos: 0, valorCentavos: 0 };
    const antes = s.quantidadeMilesimos;
    const depois = antes + m.quantidadeMilesimos;
    finais.set(k, { quantidadeMilesimos: depois, valorCentavos: s.valorCentavos + m.valorCentavos });
    return { ...m, saldoAntesMilesimos: antes, saldoDepoisMilesimos: depois };
  });
  return { linhas, finais };
}

export const chaveDoSaldo = (lojaId: string, insumoId: string) => `${lojaId}|${insumoId}`;

/**
 * Herança a da 1.6: o que vai para o razão e para o saldo cabe no INTEGER?
 * Confere cada movimento (quantidade, valor, saldo depois) e o saldo final de
 * cada par (quantidade e valor). Devolve a frase do primeiro que estoura, ou
 * null. Quem grava recusa com a frase em vez de deixar o banco dar 500.
 */
export function estouroDoRazao(
  linhas: readonly (Pick<MovimentoNovo, 'insumoNome' | 'quantidadeMilesimos' | 'valorCentavos' | 'lojaId' | 'insumoId'> & { saldoDepoisMilesimos: number })[],
  finais: ReadonlyMap<string, { quantidadeMilesimos: number; valorCentavos: number }>,
): string | null {
  const frase = (nome: string) => `O saldo de “${nome}” passaria do limite do sistema (2,1 milhões de kg/L/un ou R$ 21 milhões). Confira os números: nada foi gravado.`;
  for (const m of linhas) {
    if (!cabeNoInteiro(m.quantidadeMilesimos) || !cabeNoInteiro(m.valorCentavos) || !cabeNoInteiro(m.saldoDepoisMilesimos)) return frase(m.insumoNome);
  }
  for (const [k, f] of Array.from(finais)) {
    if (cabeNoInteiro(f.quantidadeMilesimos) && cabeNoInteiro(f.valorCentavos)) continue;
    const m = linhas.find((l) => chaveDoSaldo(l.lojaId, l.insumoId) === k);
    return frase(m?.insumoNome ?? 'um insumo');
  }
  return null;
}

/** Recusa por teto (herança a da 1.6): a frase vai para a tela, nada é gravado. */
export class ErroDeTeto extends Error {
  constructor(frase: string) {
    super(frase);
    this.name = 'ErroDeTeto';
  }
}

/** Valor de um item acima do teto da contagem (R$ 1 milhão)? A frase, ou null. */
export function valorAcimaDoTeto(nome: string, valorCentavos: number | null): string | null {
  if (valorCentavos === null || Math.abs(valorCentavos) <= TETO_DO_VALOR_DO_ITEM) return null;
  return `“${nome}” daria mais de R$ 1.000.000,00 em estoque: confira o número contado.`;
}

/** O total de uma contagem cabe no INTEGER? A frase, ou null. */
export function totalAcimaDoLimite(totalCentavos: number): string | null {
  return cabeNoInteiro(totalCentavos) ? null : 'O valor total passa do limite do sistema (R$ 21 milhões). Confira os números contados.';
}

/** "+15 kg" / "−2,5 kg" (sinal sempre, menos tipográfico). */
export function quantidadeComSinal(milesimos: number, unidade: Unidade): string {
  const t = formatarQuantidade(Math.abs(milesimos), unidade);
  return milesimos < 0 ? `−${t}` : `+${t}`;
}
