/**
 * Classificação dos insumos que já existiam (I.1a) — regra de negócio com banco, sem tela.
 *
 * A casa tem insumo cadastrado antes de a categoria existir. Esta peça os classifica SEM adivinhar calada e SEM mexer em mais
 * nada (id, nome, preço, unidade, embalagem, saldo, ficha e movimento ficam como estão):
 *  - PRÉVIA (`previaDaClassificacao`): lista cada insumo sem categoria com a sugestão pelo nome e o motivo, sem gravar;
 *  - APLICAR (`aplicarClassificacao`): só onde `categoriaId IS NULL`, numa transação, um registro antes/depois por insumo
 *    (CLASSIFICOU, origem "classificação assistida", o lote); os ambíguos vão para "Outros / a classificar" COM o motivo;
 *    rodar de novo muda 0 (nada fica sem categoria);
 *  - REVERTER (`reverterLote`): volta a "sem categoria" só os que ainda são do lote; quem uma pessoa já mexeu depois fica como
 *    está (a classificação manual tira o insumo do lote);
 *  - FILA (`filaDeRevisao`, `classificarEmLote`): os sem categoria e os de "Outros", com a contagem e o valor em estoque, e a
 *    edição em lote com o registro de cada um.
 * Categoria não entra em fotografia antiga: o DRE e o CMV de período fechado não leem nada daqui.
 */

import type { ClienteDoParceiro } from './tenant';
import { CATEGORIAS_PADRAO, CHAVE_DO_SISTEMA, chaveDoNome } from './categoria-campos';
import { sugerirCategoria, nomeDaChave } from './categoria-sugestao';
import { categoriaParaClassificar, garantirCategoriasPadrao } from './categorias';
import { pode, type Alcance } from './permissoes';

const DONO_DO_OUTROS = { categoria: { is: { chave: CHAVE_DO_SISTEMA } } } as const;
/** Sem categoria definitiva: sem nenhuma, ou em "Outros / a classificar". */
const A_REVISAR = [{ categoriaId: null }, DONO_DO_OUTROS];

/** Quantos a edição em lote aceita de uma vez. */
export const MAXIMO_EM_LOTE = 200;

/** Quantos a fila mostra por página. */
export const POR_PAGINA_DA_FILA = 100;

const TETO_DA_TRANSACAO = { timeout: 60_000, maxWait: 10_000 };

async function travarClassificacao(tx: ClienteDoParceiro) {
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:classificar:${tx.parceiroId}`}, 0))) AS "trava"`;
}

/** Um nome de lote que cabe na coluna (60) e se lê: lote-20261021-1432-a3f9. */
export function nomeDoLote(agora = new Date(), sorteio = Math.random()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const dia = `${agora.getUTCFullYear()}${p(agora.getUTCMonth() + 1)}${p(agora.getUTCDate())}`;
  const hora = `${p(agora.getUTCHours())}${p(agora.getUTCMinutes())}`;
  return `lote-${dia}-${hora}-${Math.floor(sorteio * 0xffff).toString(16).padStart(4, '0')}`;
}

// ---------------------------------------------------------- contagem e valor

export interface ResumoDoQueFalta {
  /** Insumos ativos ainda sem categoria nenhuma. */
  semCategoria: number;
  /** Insumos ativos em "Outros / a classificar". */
  emOutros: number;
  /** Soma dos dois. */
  total: number;
  /**
   * Quanto esses insumos valem em estoque hoje (nas lojas que a pessoa vê o estoque), em centavos; null = a pessoa não vê
   * estoque de nenhuma loja (o número não sai do servidor). Saldo negativo e sem preço não somam.
   */
  valorCentavos: number | null;
}

/** Em quais lojas a pessoa vê o estoque (para o valor): 'todas' as da casa que o alcance cobre. */
async function lojasComEstoque(cliente: ClienteDoParceiro, alcance: Alcance): Promise<string[]> {
  const lojas = await cliente.loja.findMany({ select: { id: true } });
  return lojas.map((l) => l.id).filter((id) => pode(alcance, 'estoque.ver', { lojaId: id }));
}

export async function resumoDoQueFalta(cliente: ClienteDoParceiro, alcance: Alcance): Promise<ResumoDoQueFalta> {
  const [semCategoria, emOutros, lojas] = await Promise.all([
    cliente.insumo.count({ where: { ativo: true, categoriaId: null } }),
    cliente.insumo.count({ where: { ativo: true, ...DONO_DO_OUTROS } }),
    lojasComEstoque(cliente, alcance),
  ]);
  let valorCentavos: number | null = null;
  if (lojas.length > 0) {
    const soma = await cliente.saldoEstoque.aggregate({
      _sum: { valorCentavos: true },
      where: { lojaId: { in: lojas }, quantidadeMilesimos: { gt: 0 }, valorCentavos: { gt: 0 }, insumo: { is: { ativo: true, OR: A_REVISAR } } },
    });
    valorCentavos = soma._sum.valorCentavos ?? 0;
  }
  return { semCategoria, emOutros, total: semCategoria + emOutros, valorCentavos };
}

/** O valor em estoque de cada insumo (centavos), nas lojas que a pessoa vê; vazio se ela não vê estoque. */
async function valoresDeEstoque(cliente: ClienteDoParceiro, alcance: Alcance, ids: string[]): Promise<Map<string, number> | null> {
  const lojas = await lojasComEstoque(cliente, alcance);
  if (lojas.length === 0) return null;
  const mapa = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const grupos = await cliente.saldoEstoque.groupBy({
      by: ['insumoId'],
      _sum: { valorCentavos: true },
      where: { lojaId: { in: lojas }, insumoId: { in: ids.slice(i, i + 500) }, quantidadeMilesimos: { gt: 0 }, valorCentavos: { gt: 0 } },
    });
    for (const g of grupos) mapa.set(g.insumoId, g._sum.valorCentavos ?? 0);
  }
  return mapa;
}

// ------------------------------------------------------------------ prévia

export interface LinhaDaPrevia {
  id: string;
  nome: string;
  ativo: boolean;
  /** A categoria que a classificação assistida poria. */
  categoria: string;
  chave: string;
  /** Só nos que vão para "Outros / a classificar": o porquê. */
  motivo: string | null;
  /** Valor em estoque (centavos); null = a pessoa não vê estoque. */
  valorCentavos: number | null;
}

export interface PreviaDaClassificacao {
  /** Quantos insumos estão sem categoria (todos, ativos ou não). */
  total: number;
  linhas: LinhaDaPrevia[];
  /** Quantos vão para cada categoria, na ordem da casa. */
  porCategoria: { nome: string; chave: string | null; n: number }[];
  /** Quantos vão para "Outros / a classificar" (a fila). */
  paraRevisar: number;
  /** A casa ainda não tem categoria: a tela chama `garantirCategoriasPadrao` antes (a prévia não grava nada). */
  semCategoriasNaCasa: boolean;
}

/** O que `aplicarClassificacao` faria agora. NÃO grava nada. */
export async function previaDaClassificacao(cliente: ClienteDoParceiro, alcance: Alcance): Promise<PreviaDaClassificacao> {
  const [alvos, daCasa] = await Promise.all([
    cliente.insumo.findMany({ where: { categoriaId: null }, select: { id: true, nome: true, tipo: true, ativo: true }, orderBy: { nome: 'asc' } }),
    cliente.categoriaInsumo.findMany({ select: { id: true, chave: true, nome: true, ativa: true, ordem: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }),
  ]);
  // Casa sem nenhuma categoria ainda: a prévia mostra as dez padrão, que é o que "aplicar" semeia antes de classificar.
  const categorias: { id: string | null; chave: string | null; nome: string; ativa: boolean; ordem: number }[] =
    daCasa.length > 0 ? daCasa : CATEGORIAS_PADRAO.map((p) => ({ id: null, chave: p.chave, nome: p.nome, ativa: true, ordem: p.ordem }));
  const valores = await valoresDeEstoque(cliente, alcance, alvos.map((a) => a.id));
  const linhas: LinhaDaPrevia[] = alvos.map((a) => {
    const s = sugerirCategoria(a.nome, a.tipo);
    const destino = escolherDestino(categorias, s.chave);
    return {
      id: a.id,
      nome: a.nome,
      ativo: a.ativo,
      categoria: destino.nome,
      chave: destino.chave ?? s.chave,
      motivo: destino.chave === CHAVE_DO_SISTEMA ? (s.chave === CHAVE_DO_SISTEMA ? s.motivo : `A categoria “${nomeDaChave(s.chave)}” não está ativa nesta casa.`) : null,
      valorCentavos: valores ? (valores.get(a.id) ?? 0) : null,
    };
  });
  const contagem = new Map<string, { nome: string; chave: string | null; n: number }>();
  for (const l of linhas) {
    const c = contagem.get(l.chave) ?? { nome: l.categoria, chave: l.chave, n: 0 };
    c.n++;
    contagem.set(l.chave, c);
  }
  const ordem = new Map(categorias.map((c, i) => [c.chave, i] as const));
  return {
    total: alvos.length,
    linhas,
    porCategoria: Array.from(contagem.values()).sort((a, b) => (ordem.get(a.chave) ?? 99) - (ordem.get(b.chave) ?? 99)),
    paraRevisar: linhas.filter((l) => l.chave === CHAVE_DO_SISTEMA).length,
    semCategoriasNaCasa: daCasa.length === 0,
  };
}

/** A categoria da casa que recebe a sugestão: a da chave, se ativa; senão "Outros / a classificar". */
function escolherDestino<T extends { id: string | null; chave: string | null; nome: string; ativa: boolean }>(casa: readonly T[], chave: string): { id: string | null; chave: string | null; nome: string } {
  const dela = casa.find((c) => c.chave === chave && c.ativa);
  if (dela) return dela;
  const outros = casa.find((c) => c.chave === CHAVE_DO_SISTEMA);
  return { id: outros?.id ?? null, chave: CHAVE_DO_SISTEMA, nome: outros?.nome ?? 'Outros / a classificar' };
}

// ----------------------------------------------------------------- aplicar

export interface ResultadoDaClassificacao {
  /** O lote que ficou (nulo se não havia nada sem categoria). */
  lote: string | null;
  /** Quantos insumos receberam categoria. */
  classificados: number;
  /** Desses, quantos foram para "Outros / a classificar" (ambíguos, com o motivo). */
  emOutros: number;
}

/**
 * Classifica de verdade, só os que NÃO têm categoria: uma transação, um registro antes/depois por insumo, tudo no mesmo lote.
 * Idempotente: depois de rodar, não há mais insumo sem categoria, e a segunda vez muda 0.
 */
export async function aplicarClassificacao(cliente: ClienteDoParceiro, autorNome = 'Sistema', agora = new Date()): Promise<ResultadoDaClassificacao> {
  await garantirCategoriasPadrao(cliente, autorNome);
  return cliente.transacao(async (tx) => {
    await travarClassificacao(tx);
    const alvos = await tx.insumo.findMany({ where: { categoriaId: null }, select: { id: true, nome: true, tipo: true }, orderBy: { nome: 'asc' } });
    if (alvos.length === 0) return { lote: null, classificados: 0, emOutros: 0 };
    const casa = await tx.categoriaInsumo.findMany({ select: { id: true, chave: true, nome: true, ativa: true } });
    const lote = nomeDoLote(agora);
    // Agrupa pelo destino e pelo motivo: um UPDATE por grupo (e não um por insumo).
    type Grupo = { categoriaId: string; nome: string; chave: string | null; motivo: string | null; ids: string[]; nomes: Map<string, string> };
    const grupos = new Map<string, Grupo>();
    for (const a of alvos) {
      const s = sugerirCategoria(a.nome, a.tipo);
      const destino = escolherDestino(casa, s.chave);
      if (!destino.id) continue; // nem "Outros" existe: nada a fazer (não acontece depois de `garantirCategoriasPadrao`)
      const motivo = destino.chave === CHAVE_DO_SISTEMA ? (s.chave === CHAVE_DO_SISTEMA ? s.motivo : `A categoria “${nomeDaChave(s.chave)}” não está ativa nesta casa.`) : null;
      const k = `${destino.id}|${motivo ?? ''}`;
      const g: Grupo = grupos.get(k) ?? { categoriaId: destino.id, nome: destino.nome, chave: destino.chave, motivo, ids: [], nomes: new Map<string, string>() };
      g.ids.push(a.id);
      g.nomes.set(a.id, a.nome);
      grupos.set(k, g);
    }
    let classificados = 0;
    let emOutros = 0;
    for (const g of grupos.values()) {
      const feitos = await tx.insumo.updateManyAndReturn({
        where: { id: { in: g.ids }, categoriaId: null },
        data: { categoriaId: g.categoriaId, classificadoPor: 'MIGRACAO', classificacaoMotivo: g.motivo, classificacaoLote: lote, classificadoEm: agora },
        select: { id: true },
      });
      classificados += feitos.length;
      if (g.chave === CHAVE_DO_SISTEMA) emOutros += feitos.length;
      if (feitos.length === 0) continue;
      await tx.historicoAlteracao.createMany({
        data: feitos.map((f) => ({
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: f.id,
          acao: 'CLASSIFICOU',
          antes: { nome: g.nomes.get(f.id)!, categoria: null, categoriaId: null },
          depois: { nome: g.nomes.get(f.id)!, categoria: g.nome, categoriaId: g.categoriaId, classificadoPor: 'MIGRACAO', loteDaClassificacao: lote },
          motivo: g.motivo ? `Classificação assistida. ${g.motivo}` : 'Classificação assistida pelo nome',
          autorNome,
        })),
      });
    }
    return { lote: classificados > 0 ? lote : null, classificados, emOutros };
  }, TETO_DA_TRANSACAO);
}

// ---------------------------------------------------------------- reverter

export interface LoteDeClassificacao {
  lote: string;
  /** Quantos insumos ainda são deste lote (os que ninguém mexeu depois). */
  nInsumos: number;
  /** Quando foi aplicado. */
  em: string | null;
}

/** Os lotes que ainda podem ser desfeitos (os que têm insumo intocado), do mais novo para o mais antigo. */
export async function lotesDeClassificacao(cliente: ClienteDoParceiro): Promise<LoteDeClassificacao[]> {
  const grupos = await cliente.insumo.groupBy({
    by: ['classificacaoLote'],
    where: { classificacaoLote: { not: null } },
    _count: { _all: true },
    _min: { classificadoEm: true },
  });
  return grupos
    .map((g) => ({ lote: g.classificacaoLote!, nInsumos: g._count._all, em: g._min.classificadoEm ? g._min.classificadoEm.toISOString() : null }))
    .sort((a, b) => (b.em ?? '').localeCompare(a.em ?? ''));
}

export type ResultadoDaReversao = { ok: true; voltaram: number; mantidos: number } | { ok: false; erro: string };

/**
 * Desfaz um lote: cada insumo que AINDA é do lote volta a "sem categoria" (e o registro diz isso); o que uma pessoa já
 * reclassificou depois não é tocado (a edição tira o insumo do lote). Nome, preço, unidade e o resto nunca entram aqui.
 */
export async function reverterLote(cliente: ClienteDoParceiro, lote: unknown, autorNome = 'Sistema'): Promise<ResultadoDaReversao> {
  if (typeof lote !== 'string' || !/^lote-[0-9a-z-]{4,50}$/.test(lote)) return { ok: false, erro: 'Lote inválido.' };
  return cliente.transacao(async (tx) => {
    await travarClassificacao(tx);
    const doLote = await tx.insumo.findMany({ where: { classificacaoLote: lote }, select: { id: true, nome: true, categoriaId: true, categoria: { select: { nome: true } } } });
    const feitos = await tx.historicoAlteracao.count({
      where: { entidade: 'Insumo', acao: 'CLASSIFICOU', depois: { path: ['loteDaClassificacao'], equals: lote } },
    });
    if (doLote.length === 0 && feitos === 0) return { ok: false as const, erro: 'Esse lote não existe nesta casa.' };
    if (doLote.length === 0) return { ok: true as const, voltaram: 0, mantidos: feitos };
    const revertidos = await tx.insumo.updateManyAndReturn({
      where: { id: { in: doLote.map((i) => i.id) }, classificacaoLote: lote },
      data: { categoriaId: null, classificadoPor: null, classificacaoMotivo: null, classificacaoLote: null, classificadoEm: null },
      select: { id: true },
    });
    const ids = new Set(revertidos.map((r) => r.id));
    await tx.historicoAlteracao.createMany({
      data: doLote
        .filter((i) => ids.has(i.id))
        .map((i) => ({
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: i.id,
          acao: 'RECLASSIFICOU',
          antes: { nome: i.nome, categoria: i.categoria?.nome ?? null, categoriaId: i.categoriaId },
          depois: { nome: i.nome, categoria: null, categoriaId: null, loteDaClassificacao: lote },
          motivo: 'Reversão da classificação assistida: voltou a ficar sem categoria',
          autorNome,
        })),
    });
    return { ok: true as const, voltaram: revertidos.length, mantidos: Math.max(0, feitos - revertidos.length) };
  }, TETO_DA_TRANSACAO);
}

// -------------------------------------------------------------------- fila

export interface LinhaDaFila {
  id: string;
  nome: string;
  ativo: boolean;
  /** Nula = sem categoria nenhuma; senão, "Outros / a classificar". */
  categoria: string | null;
  motivo: string | null;
  /** O que o nome sugere hoje (para ajudar quem revisa). */
  sugestao: { nome: string; ambigua: boolean };
  valorCentavos: number | null;
}

export interface FilaDeRevisao {
  linhas: LinhaDaFila[];
  total: number;
  pagina: number;
  paginas: number;
}

/** Os insumos sem categoria definitiva (sem nenhuma, ou em "Outros"), do que mais vale em estoque para o que menos, depois por nome. */
export async function filaDeRevisao(cliente: ClienteDoParceiro, alcance: Alcance, paginaPedida = 1): Promise<FilaDeRevisao> {
  const where = { ativo: true, OR: A_REVISAR };
  const total = await cliente.insumo.count({ where });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_DA_FILA));
  const pagina = Math.min(Math.max(1, Math.trunc(paginaPedida) || 1), paginas);
  const lidos = await cliente.insumo.findMany({
    where,
    select: { id: true, nome: true, tipo: true, ativo: true, classificacaoMotivo: true, categoria: { select: { nome: true } } },
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    skip: (pagina - 1) * POR_PAGINA_DA_FILA,
    take: POR_PAGINA_DA_FILA,
  });
  const valores = await valoresDeEstoque(cliente, alcance, lidos.map((i) => i.id));
  const linhas = lidos.map((i): LinhaDaFila => {
    const s = sugerirCategoria(i.nome, i.tipo);
    return {
      id: i.id,
      nome: i.nome,
      ativo: i.ativo,
      categoria: i.categoria?.nome ?? null,
      motivo: i.classificacaoMotivo,
      sugestao: { nome: nomeDaChave(s.chave), ambigua: s.chave === CHAVE_DO_SISTEMA },
      valorCentavos: valores ? (valores.get(i.id) ?? 0) : null,
    };
  });
  return { linhas, total, pagina, paginas };
}

export type ResultadoEmLote = { ok: true; classificados: number; iguais: number; naoEncontrados: number } | { ok: false; erro: string };

/**
 * A edição em lote da fila: a mesma categoria para vários insumos de uma vez, um registro antes/depois por insumo. A
 * classificação passa a ser "escolhida por uma pessoa" e o insumo sai do lote da classificação assistida (a reversão não o
 * desfaz mais). A categoria é conferida dentro da transação (existe, é do parceiro, está ativa).
 */
export async function classificarEmLote(cliente: ClienteDoParceiro, ids: readonly string[], categoriaId: unknown, autorNome = 'Sistema'): Promise<ResultadoEmLote> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 60)));
  if (unicos.length === 0) return { ok: false, erro: 'Marque pelo menos um insumo.' };
  if (unicos.length > MAXIMO_EM_LOTE) return { ok: false, erro: `Dá para classificar até ${MAXIMO_EM_LOTE} insumos de uma vez. Marque menos e repita.` };
  if (typeof categoriaId !== 'string' || !categoriaId) return { ok: false, erro: 'Escolha a categoria para onde os marcados vão.' };
  return cliente.transacao(async (tx) => {
    await travarClassificacao(tx);
    const cat = await categoriaParaClassificar(tx, categoriaId);
    if (!cat.ok) return { ok: false as const, erro: cat.erro };
    const lidos = await tx.insumo.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true, categoriaId: true, categoria: { select: { nome: true } } } });
    const aMudar = lidos.filter((i) => i.categoriaId !== cat.categoria.id);
    const agora = new Date();
    let classificados = 0;
    for (const i of aMudar) {
      const r = await tx.insumo.updateMany({
        where: { id: i.id, categoriaId: i.categoriaId },
        data: { categoriaId: cat.categoria.id, classificadoPor: 'MANUAL', classificacaoMotivo: null, classificacaoLote: null, classificadoEm: agora },
      });
      if (r.count === 0) continue; // alguém mexeu agora mesmo: fica a escolha dela
      classificados++;
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: i.id,
          acao: i.categoriaId ? 'RECLASSIFICOU' : 'CLASSIFICOU',
          antes: { nome: i.nome, categoria: i.categoria?.nome ?? null, categoriaId: i.categoriaId },
          depois: { nome: i.nome, categoria: cat.categoria.nome, categoriaId: cat.categoria.id, classificadoPor: 'MANUAL' },
          motivo: 'Revisão em lote',
          autorNome,
        },
      });
    }
    return { ok: true as const, classificados, iguais: lidos.length - aMudar.length, naoEncontrados: unicos.length - lidos.length };
  }, TETO_DA_TRANSACAO);
}

// ------------------------------------------------------------ nomes parecidos

export interface GrupoDeNomesParecidos {
  /** Os insumos que se escrevem diferente mas são o mesmo nome para o sistema (caixa, acento, espaço). */
  itens: { id: string; nome: string; ativo: boolean }[];
}

/**
 * Insumos cujos nomes só diferem por maiúscula, acento ou espaço ("Farinha" e "farinha"). A regra nova (nome único sem
 * diferenciar isso) vale só para o que for cadastrado daqui para a frente; o que já existe NÃO é mexido: a casa decide se junta
 * ou renomeia. Só leitura.
 */
export async function nomesParecidos(cliente: ClienteDoParceiro): Promise<GrupoDeNomesParecidos[]> {
  const todos = await cliente.insumo.findMany({ select: { id: true, nome: true, ativo: true }, orderBy: { nome: 'asc' } });
  const grupos = new Map<string, GrupoDeNomesParecidos>();
  for (const i of todos) {
    const k = chaveDoNome(i.nome);
    const g = grupos.get(k) ?? { itens: [] };
    g.itens.push(i);
    grupos.set(k, g);
  }
  return Array.from(grupos.values()).filter((g) => g.itens.length > 1);
}
