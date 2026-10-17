/**
 * Metas do DRE (2.2b, decisões 149 e 150) — regras com banco.
 *
 * A meta é da CASA: um percentual da receita bruta por linha do DRE, o mesmo na rede e em
 * cada loja (meta por loja e por canal ficam para a 2.4). Tem vigência: gravar vale do início
 * do período de agora em diante, e um período antigo ainda aberto segue com a meta que valia
 * no começo dele (a de maior `vigenteDesde` até o início do período) — mudar a meta nunca
 * reescreve o passado. Salvar de novo no mesmo período atualiza a MESMA linha; apagar a meta
 * grava uma linha `semMeta` (a meta anterior não volta sozinha).
 *
 * Só `metas.editar` (que exige a rede inteira) grava e abre a tela de editar; o gerente de uma
 * loja nunca chega aqui. Duas abas não se atropelam: a gravação leva a impressão das metas lidas.
 */

import { createHash } from 'node:crypto';
import { hojeNoRio, formatarData } from './compra-campos';
import { aceitaMeta, linhasDeMeta, lerMetaDigitada, metaParaCampo, textoDaMeta, type LinhaDeMeta } from './dre-metas-campos';
import { chaveDaLinha, type LinhaDoPlano } from './dre-plano';
import { listarHistorico } from './historico';
import { periodoDe } from './periodos';
import { garantirPlano, planoDoParceiro } from './plano';
import { recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);

export const MENSAGEM_CONFLITO_DAS_METAS = 'Alguém mudou as metas agora há pouco. Recarregue a página para ver as metas de agora; nada foi gravado.';

interface MetaGravada {
  id: string;
  linhaId: string;
  percentualBp: number;
  semMeta: boolean;
  vigenteDesde: string;
  atualizadoEm: Date;
}

/** Todas as metas da casa (canal nulo), da mais antiga para a mais nova. */
async function lerTodasAsMetas(tx: ClienteDoParceiro): Promise<MetaGravada[]> {
  const linhas = await tx.dreMeta.findMany({
    where: { canal: null },
    orderBy: [{ vigenteDesde: 'asc' }, { id: 'asc' }],
    select: { id: true, linhaId: true, percentualBp: true, semMeta: true, vigenteDesde: true, atualizadoEm: true },
  });
  return linhas.map((m) => ({ ...m, vigenteDesde: iso(m.vigenteDesde) }));
}

/** A meta que vale numa data: por linha, a de maior `vigenteDesde` até ela. */
function efetivasEm(todas: readonly MetaGravada[], inicio: string): Map<string, MetaGravada> {
  const out = new Map<string, MetaGravada>();
  for (const m of todas) if (m.vigenteDesde <= inicio) out.set(m.linhaId, m);
  return out;
}

/** A impressão das metas lidas: a gravação confere e duas abas não se atropelam. */
export function impressaoDasMetas(todas: readonly MetaGravada[]): string {
  return createHash('sha256')
    .update(todas.map((m) => `${m.id}:${m.atualizadoEm.getTime()}:${m.percentualBp}:${m.semMeta ? 1 : 0}`).join('|'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * As metas que valem num período (pelo início dele), por CHAVE da linha (`codigo` ou `id:<id>`).
 * Só as linhas com meta: "sem meta" não entra. Lê pelo portão, no escopo do parceiro.
 */
export async function metasDoPeriodo(tx: ClienteDoParceiro, plano: readonly LinhaDoPlano[], inicio: string): Promise<Map<string, number>> {
  const efetivas = efetivasEm(await lerTodasAsMetas(tx), inicio);
  const porId = new Map(plano.filter((l) => l.id).map((l) => [l.id!, l]));
  const out = new Map<string, number>();
  for (const m of efetivas.values()) {
    const linha = porId.get(m.linhaId);
    if (!linha || m.semMeta) continue;
    const chave = chaveDaLinha(linha);
    if (aceitaMeta(chave)) out.set(chave, m.percentualBp);
  }
  return out;
}

// ================================================================ a tela

export interface LinhaDaTelaDeMetas extends LinhaDeMeta {
  /** A meta de agora, em pontos-base; nula = sem meta. */
  metaBp: number | null;
  /** O texto que o campo mostra. */
  campo: string;
  /** Desde quando a meta vale (a linha que a define); nulo sem meta. */
  desde: string | null;
}

export interface SituacaoDasMetas {
  hoje: string;
  /** O período de agora: a meta gravada hoje vale do início dele em diante. */
  periodoAtual: { nome: string; inicio: string; fim: string };
  linhas: LinhaDaTelaDeMetas[];
  versao: string;
  historico: Awaited<ReturnType<typeof listarHistorico>>;
}

/** A tela das metas (quem tem `metas.editar`). Quem não tem: null. */
export async function situacaoDasMetas(cliente: ClienteDoParceiro, alcance: Alcance, hoje = hojeNoRio()): Promise<SituacaoDasMetas | null> {
  if (recusa(alcance, 'metas.editar')) return null;
  return cliente.transacao(async (tx) => {
    const periodoAtual = await periodoDe(tx, hoje);
    const plano = await planoDoParceiro(tx);
    const todas = await lerTodasAsMetas(tx);
    const efetivas = efetivasEm(todas, periodoAtual.inicio);
    const idPorChave = new Map(plano.filter((l) => l.id).map((l) => [chaveDaLinha(l), l.id!]));
    const linhas = linhasDeMeta(plano).map((l) => {
      const id = idPorChave.get(l.chave);
      const m = id ? efetivas.get(id) : undefined;
      const metaBp = m && !m.semMeta ? m.percentualBp : null;
      return { ...l, metaBp, campo: metaBp === null ? '' : metaParaCampo(metaBp), desde: metaBp === null || !m ? null : m.vigenteDesde };
    });
    const historico = await listarHistorico(tx, { entidade: 'DreMeta', verPrecos: false, verDre: true, limite: 12 });
    return { hoje, periodoAtual, linhas, versao: impressaoDasMetas(todas), historico };
  });
}

// ================================================================ gravar

export type ResultadoDasMetas =
  | { ok: true; mudou: number; valeDesde: string }
  | { ok: false; erros: Record<string, string>; conflito?: boolean };

const falha = (geral: string, conflito?: boolean): ResultadoDasMetas => ({ ok: false, erros: { geral }, ...(conflito ? { conflito } : {}) });

/**
 * Grava a tabela inteira de uma vez. `valores` = chave da linha → texto digitado (só as que o
 * formulário mandou; vazio é "sem meta"). Linha que não existe neste parceiro, ou que não aceita
 * meta (a receita), é recusada com frase e NADA é gravado; texto inválido idem, com a frase na
 * linha. O que não mudou não grava nem entra no histórico.
 */
export async function salvarMetas(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  entrada: { valores: Readonly<Record<string, string>>; versao: unknown },
  autorNome: string,
  hoje = hojeNoRio(),
): Promise<ResultadoDasMetas> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return falha(negado);
  const chaves = Object.keys(entrada.valores);
  if (chaves.length === 0) return falha('Nenhuma meta para salvar.');
  if (chaves.length > 200) return falha('Linhas demais de uma vez.');
  return await cliente.transacao(
    async (tx): Promise<ResultadoDasMetas> => {
      await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-metas:${tx.parceiroId}`}, 0))::text AS "trava"`;
      const periodo = await periodoDe(tx, hoje);
      await garantirPlano(tx);
      const plano = await planoDoParceiro(tx);
      const todas = await lerTodasAsMetas(tx);
      if (String(entrada.versao ?? '') !== impressaoDasMetas(todas)) return falha(MENSAGEM_CONFLITO_DAS_METAS, true);

      const porChave = new Map(plano.filter((l) => l.id).map((l) => [chaveDaLinha(l), l]));
      // Primeiro tudo é lido e conferido: nada grava se uma linha for forjada ou inválida.
      const erros: Record<string, string> = {};
      const lidas = new Map<string, number | null>();
      for (const chave of chaves) {
        const linha = porChave.get(chave);
        if (!linha) return falha('Uma das linhas não existe mais no plano de contas. Recarregue a página; nada foi gravado.', true);
        if (!aceitaMeta(chave)) return falha(`“${linha.nome}” não tem meta: a base dela é a própria receita. Recarregue a página; nada foi gravado.`);
        const l = lerMetaDigitada(entrada.valores[chave]);
        if (!l.ok) erros[chave] = l.erro;
        else lidas.set(chave, l.bp);
      }
      if (Object.keys(erros).length > 0) return { ok: false, erros: { ...erros, geral: 'Confira as metas marcadas; nada foi gravado.' } };

      const efetivas = efetivasEm(todas, periodo.inicio);
      const doPeriodo = new Map(todas.filter((m) => m.vigenteDesde === periodo.inicio).map((m) => [m.linhaId, m]));
      let mudou = 0;
      for (const [chave, novo] of lidas) {
        const linha = porChave.get(chave)!;
        const efetiva = efetivas.get(linha.id!);
        const antes = efetiva && !efetiva.semMeta ? efetiva.percentualBp : null;
        if (antes === novo) continue;
        const dados = { percentualBp: novo ?? 0, semMeta: novo === null, criadoPorNome: autorNome.slice(0, 120) };
        const existente = doPeriodo.get(linha.id!);
        let id: string;
        if (existente) {
          await tx.dreMeta.update({ where: { id: existente.id }, data: dados });
          id = existente.id;
        } else {
          const criada = await tx.dreMeta.create({ data: { parceiroId: tx.parceiroId, linhaId: linha.id!, canal: null, vigenteDesde: dataDoBanco(periodo.inicio), ...dados }, select: { id: true } });
          id = criada.id;
        }
        const retrato = (bp: number | null) => ({ alvo: linha.nome, meta: bp === null ? 'Sem meta' : textoDaMeta(bp), valeDesde: formatarData(periodo.inicio) });
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'DreMeta', entidadeId: id, acao: antes === null && !efetiva ? 'CRIOU' : 'ALTEROU', antes: antes === null && !efetiva ? undefined : retrato(antes), depois: retrato(novo), autorNome },
        });
        mudou++;
      }
      return { ok: true, mudou, valeDesde: periodo.inicio };
    },
    { timeout: 20_000 },
  );
}
