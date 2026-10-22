/**
 * Categorias de insumo (I.1a) — regra de negócio com banco, sem tela. Recebe sempre um `ClienteDoParceiro`: não existe
 * função aqui que consiga tocar em categoria de outro parceiro.
 *
 * - a categoria é da REDE (do parceiro): o insumo tem UMA; a loja só vai personalizar a meta (I.2), nunca a natureza;
 * - as dez padrão nascem por `garantirCategoriasPadrao` (script `erp:semear-categorias`, e sozinha só na primeira vez, quando a casa
 *   não tem categoria nenhuma; depois, abrir tela nunca recria o que a casa excluiu), idempotente pela `chave`; a migration não semeia nada;
 * - criar, renomear, reordenar, desativar, reativar e excluir gravam o antes/depois no `HistoricoAlteracao` na MESMA
 *   transação; quem pode é `insumos.categorias` (checado na action, não aqui);
 * - "Outros / a classificar" é do sistema: não se renomeia, desativa nem exclui (regra aqui e gatilho no banco);
 * - excluir só sem uso: sem insumo nela e sem nenhuma passagem de insumo por ela no histórico (senão, desativar);
 * - desativar não apaga: o insumo que já está nela continua nela; ela só deixa de ser oferecida para o que vier.
 */

import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import {
  ACENTUADAS,
  CATEGORIAS_PADRAO,
  CHAVE_DO_SISTEMA,
  chaveDoNome,
  FRASE_CATEGORIA_DESATIVADA,
  FRASE_CATEGORIA_INEXISTENTE,
  lerNomeDaCategoria,
  NOME_DO_SISTEMA,
  SEM_ACENTO,
  type ChaveDeCategoria,
} from './categoria-campos';
import { sugerirCategoria, nomeDaChave } from './categoria-sugestao';
import type { Erros } from './insumo-campos';

export type ResultadoCategoria =
  | { ok: true; id: string; nome: string; mudou: string[] }
  | { ok: false; erros: Erros; conflito?: boolean; naoEncontrado?: boolean };

/** No máximo isto de categorias por casa (a ordem vai de 10 em 10 até 990). */
export const MAXIMO_DE_CATEGORIAS = 60;

/** Recusa no meio da transação: desfaz tudo e vira mensagem. */
class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoCategoria, { ok: false }>) {
    super('recusa');
  }
}
const recusa = (erros: Erros, extra: { conflito?: boolean; naoEncontrado?: boolean } = {}) => new Recusa({ ok: false, erros, ...extra });

export const MENSAGEM_CONFLITO_DA_CATEGORIA = 'Alguém alterou esta categoria agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
const FRASE_DO_SISTEMA = `“${NOME_DO_SISTEMA}” é do sistema: é para onde vai o que ainda não foi classificado. Ela não muda de nome, não se desativa e não se exclui.`;

/** Trava a casa inteira para mexer em categorias (criar, nomear, semear): duas pessoas ao mesmo tempo esperam uma à outra. */
async function travarCategorias(tx: ClienteDoParceiro) {
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:categorias:${tx.parceiroId}`}, 0))) AS "trava"`;
}

/** A categoria que já tem este nome (sem diferenciar maiúscula nem acento), fora a própria. */
async function comNomeParecido(tx: ClienteDoParceiro, nome: string, exceto: string | null) {
  const achadas = await tx.sql<{ id: string; nome: string }>`
    SELECT "id", "nome" FROM "CategoriaInsumo"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) = ${chaveDoNome(nome)}
      AND "id" <> ${exceto ?? ''}
    LIMIT 1`;
  return achadas[0] ?? null;
}

function erroDoBanco(e: unknown): Recusa | null {
  const check = checkVioladoDe(e);
  if (check && /sistema_protegida/.test(check)) return recusa({ geral: FRASE_DO_SISTEMA });
  if (check) return recusa({ geral: 'O banco recusou estes valores (fora da faixa permitida). Confira e tente de novo. Nada foi gravado.' });
  const msg = e instanceof Error ? e.message : '';
  if (/sistema_protegida/.test(msg)) return recusa({ geral: FRASE_DO_SISTEMA });
  return null;
}

// -------------------------------------------------------------- semear

/** Quem consta no histórico das categorias que o sistema cria sozinho: nunca a pessoa que só abriu uma tela. */
export const AUTOR_DO_SISTEMA = 'Sistema';

/**
 * As dez padrão deste parceiro. Abrir tela NUNCA recria o que a casa tirou (decisão 249):
 * - sem `completar` (telas, ficha, classificação): semeia as dez só quando a casa NÃO tem categoria nenhuma (a primeira vez) e,
 *   de resto, garante apenas "Outros / a classificar", que é do sistema e não se exclui. Uma padrão excluída continua excluída.
 *   O histórico sai em nome do Sistema, não de quem abriu a tela (que pode nem ter `insumos.categorias`).
 * - `completar: true` (o script `erp:semear-categorias`, ato explícito de quem administra): devolve também as padrão que faltam.
 * Pela chave, o que já existe fica como está, inclusive o nome que a casa mudou; uma categoria da casa sem chave com o mesmo
 * nome de uma padrão é ADOTADA (ganha a chave) em vez de brigar com o nome único. Cada criação vai para o histórico.
 * Parceiro somente leitura (suspenso) não semeia. Devolve quantas criou.
 */
export async function garantirCategoriasPadrao(cliente: ClienteDoParceiro, opcoes: { completar?: boolean; autorNome?: string } = {}): Promise<number> {
  if (cliente.somenteLeitura) return 0;
  const completar = opcoes.completar === true;
  const autorNome = opcoes.autorNome ?? AUTOR_DO_SISTEMA;
  const todas = await cliente.categoriaInsumo.count();
  if (!completar && todas > 0) {
    // A casa já foi semeada ou montada à mão. Só "Outros" é recriado, se por algum motivo não existir.
    if ((await cliente.categoriaInsumo.count({ where: { chave: CHAVE_DO_SISTEMA } })) > 0) return 0;
  } else if (completar) {
    const prontas = await cliente.categoriaInsumo.count({ where: { chave: { in: CATEGORIAS_PADRAO.map((c) => c.chave) } } });
    if (prontas >= CATEGORIAS_PADRAO.length) return 0;
  }
  return cliente.transacao(async (tx) => {
    await travarCategorias(tx);
    const existentes = await tx.categoriaInsumo.findMany({ select: { id: true, chave: true, nome: true } });
    // Relê sob a trava: quem chegou primeiro já pode ter semeado.
    const soOutros = !completar && existentes.length > 0;
    if (!completar && existentes.length > 0 && existentes.some((e) => e.chave === CHAVE_DO_SISTEMA)) return 0;
    const comChave = new Set(existentes.map((e) => e.chave).filter(Boolean));
    const porNome = new Map(existentes.filter((e) => !e.chave).map((e) => [chaveDoNome(e.nome), e] as const));
    let criadas = 0;
    for (const p of CATEGORIAS_PADRAO) {
      if (soOutros && p.chave !== CHAVE_DO_SISTEMA) continue;
      if (comChave.has(p.chave)) continue;
      const adotada = porNome.get(chaveDoNome(p.nome));
      if (adotada) {
        await tx.categoriaInsumo.updateMany({ where: { id: adotada.id }, data: { chave: p.chave, sistema: p.chave === CHAVE_DO_SISTEMA } });
        continue;
      }
      const nova = await tx.categoriaInsumo.create({
        data: { parceiroId: tx.parceiroId, chave: p.chave, nome: p.nome, ordem: p.ordem, sistema: p.chave === CHAVE_DO_SISTEMA },
        select: { id: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CategoriaInsumo',
          entidadeId: nova.id,
          acao: 'CRIOU',
          depois: { nome: p.nome, posicao: p.ordem / 10, ativo: true },
          motivo: 'Categoria padrão',
          autorNome,
        },
      });
      criadas++;
    }
    return criadas;
  });
}

// -------------------------------------------------------------- listar

export interface LinhaDeCategoria {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  sistema: boolean;
  ativa: boolean;
  desativadaEm: string | null;
  /** O `atualizadoEm` lido (a edição só passa se ainda for ele). */
  versao: string;
  /** Quantos insumos estão nela (ativos e desativados). */
  nInsumos: number;
  /** Quantos insumos ativos estão nela. */
  nAtivos: number;
}

/** Todas as categorias, na ordem da casa (as desativadas por último dentro da mesma ordem não: a ordem manda). */
export async function listarCategorias(cliente: ClienteDoParceiro): Promise<LinhaDeCategoria[]> {
  const lidas = await cliente.categoriaInsumo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  const [todos, ativos] = await Promise.all([
    cliente.insumo.groupBy({ by: ['categoriaId'], where: { categoriaId: { not: null } }, _count: { _all: true } }),
    cliente.insumo.groupBy({ by: ['categoriaId'], where: { ativo: true, categoriaId: { not: null } }, _count: { _all: true } }),
  ]);
  const dosTodos = new Map(todos.map((a) => [a.categoriaId, a._count._all] as const));
  const dosAtivos = new Map(ativos.map((a) => [a.categoriaId, a._count._all] as const));
  return lidas.map((c) => ({
    id: c.id,
    chave: c.chave,
    nome: c.nome,
    ordem: c.ordem,
    sistema: c.sistema,
    ativa: c.ativa,
    desativadaEm: c.desativadaEm ? c.desativadaEm.toISOString() : null,
    versao: c.atualizadoEm.toISOString(),
    nInsumos: dosTodos.get(c.id) ?? 0,
    nAtivos: dosAtivos.get(c.id) ?? 0,
  }));
}

export interface OpcaoDeCategoria {
  id: string;
  chave: string | null;
  nome: string;
  ativa: boolean;
}

/** As que o formulário oferece: as ativas, na ordem da casa, mais a que o insumo já tem (se desativada, marcada). `comDesativadas`: todas (o filtro da lista). */
export async function categoriasParaEscolher(cliente: ClienteDoParceiro, atualId?: string | null, comDesativadas = false): Promise<OpcaoDeCategoria[]> {
  const lidas = await cliente.categoriaInsumo.findMany({
    where: comDesativadas ? {} : atualId ? { OR: [{ ativa: true }, { id: atualId }] } : { ativa: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, chave: true, nome: true, ativa: true },
  });
  return lidas;
}

/**
 * O que o formulário de insumo precisa: garante as dez padrão (a primeira vez que alguém abre o formulário numa casa nova) e
 * devolve as que se oferecem. Parceiro somente leitura não semeia (e o formulário vem bloqueado).
 */
export async function categoriasDoFormulario(cliente: ClienteDoParceiro, atualId?: string | null): Promise<OpcaoDeCategoria[]> {
  await garantirCategoriasPadrao(cliente);
  return categoriasParaEscolher(cliente, atualId);
}

// ------------------------------------------------------ usar numa classificação

export interface CategoriaEscolhida {
  id: string;
  nome: string;
  chave: string | null;
}

/**
 * Confere, DENTRO da transação de quem classifica, que a categoria existe neste parceiro e está ativa (a que o insumo já tem
 * pode estar desativada: não obriga a trocar). A linha fica travada em FOR SHARE: desativar ou excluir ao mesmo tempo espera.
 * Devolve a categoria ou a frase do erro.
 */
export async function categoriaParaClassificar(
  tx: ClienteDoParceiro,
  id: string,
  atualId: string | null = null,
): Promise<{ ok: true; categoria: CategoriaEscolhida } | { ok: false; erro: string }> {
  const achadas = await tx.sql<{ id: string; nome: string; chave: string | null; ativa: boolean }>`
    SELECT "id", "nome", "chave", "ativa" FROM "CategoriaInsumo"
    WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id}
    FOR SHARE`;
  const c = achadas[0];
  if (!c) return { ok: false, erro: FRASE_CATEGORIA_INEXISTENTE };
  if (!c.ativa && c.id !== atualId) return { ok: false, erro: FRASE_CATEGORIA_DESATIVADA };
  return { ok: true, categoria: { id: c.id, nome: c.nome, chave: c.chave } };
}

export interface SugestaoResolvida {
  /** A categoria da casa que a sugestão aponta (nula só se nem "Outros" existe, o que não deve acontecer). */
  categoriaId: string | null;
  chave: ChaveDeCategoria;
  nome: string;
  motivo: string | null;
  origem: 'termo' | 'tipo' | 'ambigua' | 'nenhuma';
  termos: string[];
}

/**
 * A sugestão pelo nome (`categoria-sugestao.ts`) já resolvida para as categorias DESTA casa: acha pela `chave` (o nome pode ter
 * sido mudado); se a categoria padrão foi excluída ou está desativada, cai em "Outros / a classificar" dizendo isso.
 */
export async function sugestaoParaInsumo(cliente: ClienteDoParceiro, nome: string, tipo?: string | null): Promise<SugestaoResolvida> {
  const s = sugerirCategoria(nome, tipo);
  const casa = await cliente.categoriaInsumo.findMany({ where: { chave: { in: [s.chave, CHAVE_DO_SISTEMA] } }, select: { id: true, chave: true, nome: true, ativa: true } });
  const dela = casa.find((c) => c.chave === s.chave && c.ativa);
  if (dela) return { categoriaId: dela.id, chave: s.chave, nome: dela.nome, motivo: s.motivo, origem: s.origem, termos: s.termos };
  const outros = casa.find((c) => c.chave === CHAVE_DO_SISTEMA);
  const semDela = s.chave === CHAVE_DO_SISTEMA ? s.motivo : `A categoria “${nomeDaChave(s.chave)}” não está ativa nesta casa. Confira.`;
  return {
    categoriaId: outros?.id ?? null,
    chave: CHAVE_DO_SISTEMA,
    nome: outros?.nome ?? NOME_DO_SISTEMA,
    motivo: semDela,
    origem: s.chave === CHAVE_DO_SISTEMA ? s.origem : 'nenhuma',
    termos: [],
  };
}

// --------------------------------------------------------------- criar

export async function criarCategoria(cliente: ClienteDoParceiro, entrada: Record<string, unknown>, autorNome = 'Sistema'): Promise<ResultadoCategoria> {
  const lido = lerNomeDaCategoria(entrada.nome);
  if (!lido.ok) return lido;
  try {
    return await cliente.transacao(async (tx) => {
      await travarCategorias(tx);
      const parecida = await comNomeParecido(tx, lido.nome, null);
      if (parecida) throw recusa({ nome: `Já existe a categoria “${parecida.nome}”.` });
      const todas = await tx.categoriaInsumo.findMany({ select: { id: true, ordem: true, sistema: true, nome: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
      if (todas.length >= MAXIMO_DE_CATEGORIAS) throw recusa({ nome: `A casa já tem ${MAXIMO_DE_CATEGORIAS} categorias: desative ou exclua alguma antes.` });
      const nova = await tx.categoriaInsumo.create({ data: { parceiroId: tx.parceiroId, nome: lido.nome, ordem: 0 }, select: { id: true } });
      // A nova entra antes de "Outros / a classificar", que fica sempre por último; a ordem é renumerada de 10 em 10.
      const meio = todas.filter((c) => !c.sistema).map((c) => c.id);
      const fim = todas.filter((c) => c.sistema).map((c) => c.id);
      const ordenadas = [...meio, nova.id, ...fim];
      await renumerar(tx, ordenadas, new Map(todas.map((c) => [c.id, c.ordem])));
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CategoriaInsumo',
          entidadeId: nova.id,
          acao: 'CRIOU',
          depois: { nome: lido.nome, posicao: meio.length + 1, ativo: true },
          autorNome,
        },
      });
      return { ok: true as const, id: nova.id, nome: lido.nome, mudou: [] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Já existe uma categoria com esse nome.' } };
    const b = erroDoBanco(e);
    if (b) return b.resultado;
    throw e;
  }
}

/** Dá a ordem 10, 20, 30... na sequência dada; só grava a que mudou. */
async function renumerar(tx: ClienteDoParceiro, ids: string[], ordemAtual: ReadonlyMap<string, number>) {
  for (const [i, id] of ids.entries()) {
    const ordem = (i + 1) * 10;
    if (ordemAtual.get(id) !== ordem) await tx.categoriaInsumo.updateMany({ where: { id }, data: { ordem } });
  }
}

// ------------------------------------------------------------- renomear

/** `entrada.versao` = o `atualizadoEm` que a tela leu (ISO): a gravação só passa se a linha ainda estiver nela. */
export async function renomearCategoria(cliente: ClienteDoParceiro, id: string, entrada: Record<string, unknown>, autorNome = 'Sistema'): Promise<ResultadoCategoria> {
  const lido = lerNomeDaCategoria(entrada.nome);
  if (!lido.ok) return lido;
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_CATEGORIA }, conflito: true };
  try {
    return await cliente.transacao(async (tx) => {
      await travarCategorias(tx);
      const atual = await tx.categoriaInsumo.findUnique({ where: { id } });
      if (!atual) throw recusa({ geral: 'Categoria não encontrada.' }, { naoEncontrado: true });
      if (atual.sistema) throw recusa({ geral: FRASE_DO_SISTEMA });
      if (atual.atualizadoEm.getTime() !== versao.getTime()) throw recusa({ geral: MENSAGEM_CONFLITO_DA_CATEGORIA }, { conflito: true });
      if (atual.nome === lido.nome) return { ok: true as const, id, nome: atual.nome, mudou: [] };
      const parecida = await comNomeParecido(tx, lido.nome, id);
      if (parecida) throw recusa({ nome: `Já existe a categoria “${parecida.nome}”.` });
      const r = await tx.categoriaInsumo.updateMany({ where: { id, atualizadoEm: versao }, data: { nome: lido.nome } });
      if (r.count === 0) throw recusa({ geral: MENSAGEM_CONFLITO_DA_CATEGORIA }, { conflito: true });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'CategoriaInsumo', entidadeId: id, acao: 'RENOMEOU', antes: { nome: atual.nome }, depois: { nome: lido.nome }, autorNome },
      });
      return { ok: true as const, id, nome: lido.nome, mudou: ['nome'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Já existe uma categoria com esse nome.' } };
    const b = erroDoBanco(e);
    if (b) return b.resultado;
    throw e;
  }
}

// -------------------------------------------------------------- reordenar

/** Sobe ou desce uma posição na lista da casa. "Outros / a classificar" fica sempre por último e não se move. */
export async function moverCategoria(cliente: ClienteDoParceiro, id: string, direcao: 'subir' | 'descer', autorNome = 'Sistema'): Promise<ResultadoCategoria> {
  try {
    return await cliente.transacao(async (tx) => {
      await travarCategorias(tx);
      const todas = await tx.categoriaInsumo.findMany({ select: { id: true, nome: true, ordem: true, sistema: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
      const meio = todas.filter((c) => !c.sistema);
      const de = meio.findIndex((c) => c.id === id);
      if (de < 0) {
        if (todas.some((c) => c.id === id)) throw recusa({ geral: 'A categoria do sistema fica sempre por último.' });
        throw recusa({ geral: 'Categoria não encontrada.' }, { naoEncontrado: true });
      }
      const para = direcao === 'subir' ? de - 1 : de + 1;
      if (para < 0 || para >= meio.length) return { ok: true as const, id, nome: meio[de].nome, mudou: [] };
      const ids = meio.map((c) => c.id);
      [ids[de], ids[para]] = [ids[para], ids[de]];
      await renumerar(tx, [...ids, ...todas.filter((c) => c.sistema).map((c) => c.id)], new Map(todas.map((c) => [c.id, c.ordem])));
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CategoriaInsumo',
          entidadeId: id,
          acao: 'REORDENOU',
          antes: { nome: meio[de].nome, posicao: de + 1 },
          depois: { nome: meio[de].nome, posicao: para + 1 },
          autorNome,
        },
      });
      return { ok: true as const, id, nome: meio[de].nome, mudou: ['posicao'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

// ------------------------------------------------------ desativar / reativar

export async function mudarSituacaoCategoria(
  cliente: ClienteDoParceiro,
  id: string,
  ativa: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoCategoria> {
  const motivo = typeof motivoTexto === 'string' ? motivoTexto.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  try {
    return await cliente.transacao(async (tx) => {
      // FOR UPDATE: quem classifica agora (FOR SHARE) termina antes; quem chegar depois já vê a situação nova.
      const lidas = await tx.sql<{ id: string; nome: string; sistema: boolean; ativa: boolean }>`
        SELECT "id", "nome", "sistema", "ativa" FROM "CategoriaInsumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`;
      const atual = lidas[0];
      if (!atual) throw recusa({ geral: 'Categoria não encontrada.' }, { naoEncontrado: true });
      if (atual.sistema) throw recusa({ geral: FRASE_DO_SISTEMA });
      if (atual.ativa === ativa) throw recusa({ geral: ativa ? 'Esta categoria já está ativa.' : 'Esta categoria já estava desativada.' }, { conflito: true });
      await tx.categoriaInsumo.updateMany({ where: { id, ativa: !ativa }, data: { ativa, desativadaEm: ativa ? null : new Date() } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CategoriaInsumo',
          entidadeId: id,
          acao: ativa ? 'REATIVOU' : 'DESATIVOU',
          antes: { nome: atual.nome, ativo: !ativa },
          depois: { nome: atual.nome, ativo: ativa },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    const b = erroDoBanco(e);
    if (b) return b.resultado;
    throw e;
  }
}

// ---------------------------------------------------------------- excluir

/**
 * Quantas vezes a categoria foi usada: insumos que a têm hoje (ativos ou não) e passagens de insumo por ela no histórico
 * (uma classificação desfeita também conta: o registro de que ela existiu e foi usada não se perde).
 */
export async function usosDaCategoria(tx: ClienteDoParceiro, id: string): Promise<{ nInsumos: number; nHistorico: number }> {
  const nInsumos = await tx.insumo.count({ where: { categoriaId: id } });
  const nHistorico = await tx.historicoAlteracao.count({
    where: { entidade: 'Insumo', OR: [{ antes: { path: ['categoriaId'], equals: id } }, { depois: { path: ['categoriaId'], equals: id } }] },
  });
  return { nInsumos, nHistorico };
}

/** Só sem uso. Com uso, a frase manda desativar (o histórico e os insumos ficam como estão). */
export async function excluirCategoria(cliente: ClienteDoParceiro, id: string, autorNome = 'Sistema'): Promise<ResultadoCategoria> {
  try {
    return await cliente.transacao(async (tx) => {
      const lidas = await tx.sql<{ id: string; nome: string; sistema: boolean }>`
        SELECT "id", "nome", "sistema" FROM "CategoriaInsumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`;
      const atual = lidas[0];
      if (!atual) throw recusa({ geral: 'Categoria não encontrada.' }, { naoEncontrado: true });
      if (atual.sistema) throw recusa({ geral: FRASE_DO_SISTEMA });
      // I.2a: a categoria com meta por categoria (de qualquer vigência) ou no estoque guardado de um fechamento não se exclui; a FK do banco é a última palavra.
      const nMetas = await tx.metaCmvCategoria.count({ where: { categoriaId: id } });
      if (nMetas > 0) {
        throw recusa({ geral: `“${atual.nome}” tem meta nas metas por categoria: não dá para excluir. Tire a meta de Metas por categoria e, se ela já valeu em períodos passados, desative a categoria (o que já aconteceu não se apaga).` });
      }
      const nRetratos = await tx.contagemRetratoItem.count({ where: { categoriaIdNaHora: id } });
      if (nRetratos > 0) throw recusa({ geral: `“${atual.nome}” está no estoque guardado de uma abertura ou de um fechamento: não dá para excluir. Desative a categoria.` });
      const uso = await usosDaCategoria(tx, id);
      if (uso.nInsumos > 0) {
        throw recusa({
          geral: `“${atual.nome}” tem ${uso.nInsumos} ${uso.nInsumos === 1 ? 'insumo' : 'insumos'}: não dá para excluir. Desative a categoria (os insumos ficam nela e o histórico continua) ou passe os insumos para outra antes.`,
        });
      }
      if (uso.nHistorico > 0) {
        throw recusa({ geral: `“${atual.nome}” já foi usada por insumos e isso está no histórico: não dá para excluir. Desative a categoria.` });
      }
      // O uso por loja é só configuração ("esta loja não usa"): sai junto com a categoria.
      await tx.categoriaNaLoja.deleteMany({ where: { categoriaId: id } });
      await tx.categoriaInsumo.deleteMany({ where: { id } });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'CategoriaInsumo', entidadeId: id, acao: 'EXCLUIU', antes: { nome: atual.nome, ativo: true }, autorNome },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['excluida'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    const b = erroDoBanco(e);
    if (b) return b.resultado;
    // A FK (Restrict) é a última palavra: um insumo entrou nela no meio do caminho.
    if (/MetaCmvCategoria_parceiroId_categoriaId_fkey/i.test(e instanceof Error ? e.message : '')) {
      return { ok: false, erros: { geral: 'A categoria passou a ter meta agora há pouco: não dá para excluir. Desative-a.' } };
    }
    if (/foreign key|Insumo_parceiroId_categoriaId_fkey/i.test(e instanceof Error ? e.message : '')) {
      return { ok: false, erros: { geral: 'A categoria passou a ter insumos agora há pouco: não dá para excluir. Desative-a.' } };
    }
    throw e;
  }
}
