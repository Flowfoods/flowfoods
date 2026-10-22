/**
 * Metas por categoria (I.2a, decisões 270 a 273) — regras com banco.
 *
 * Um CONJUNTO de metas por escopo (a rede, ou uma loja) e vigência (o começo do período em curso, como a meta do DRE, 2.2b).
 * A loja SEGUE a rede (sem conjunto próprio, ou conjunto que diz `segueARede`) ou PERSONALIZA o conjunto inteiro: misturar
 * categoria herdada com categoria própria confundiria o dono. Mudar a rede só afeta as lojas que a seguem; mudar uma loja não
 * toca outra. A meta efetiva de um período P numa loja L é a do último conjunto de L com `vigenteDesde <= P.inicio`; se não houver,
 * ou se ele só diz "segue", a do último conjunto da rede.
 *
 * A meta TOTAL é a `DreMeta` da linha `cmv` do DRE (uma fonte só, decisão 272): o formulário da rede grava as duas na MESMA
 * transação, sob a mesma trava `erp-metas:<parceiro>` (pega UMA vez, sem ordem nova de travas). Já a divisão por categoria pode não
 * fechar no total: é aviso na tela, nunca bloqueio.
 *
 * Quem edita: `metas.editar`, que exige a rede inteira. O gerente de uma loja não personaliza a própria loja (decisão 281). Duas
 * pessoas salvando ao mesmo tempo: a segunda recebe o conflito (a impressão do que foi lido); nada é gravado.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { formatarData, hojeNoRio } from './compra-campos';
import {
  avisoDaSoma,
  lerMetasDoFormulario,
  metasDoModelo32,
  MODELO_32,
  percentualComDuasCasas,
  somaDasMetas,
  TOTAL_DO_MODELO_32_BP,
  type CategoriaParaMeta,
} from './cmv-categorias-campos';
import { efetivasEm, gravarMetasDasLinhas, lerTodasAsMetas, MENSAGEM_CONFLITO_DAS_METAS, travarMetas } from './dre-metas';
import { chaveDaLinha } from './dre-plano';
import { listarHistorico } from './historico';
import { periodoDe } from './periodos';
import { garantirPlano, planoDoParceiro } from './plano';
import { recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { metaParaCampo } from './dre-metas-campos';

const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);

export const MENSAGEM_CONFLITO_DAS_METAS_POR_CATEGORIA = MENSAGEM_CONFLITO_DAS_METAS;
const CHAVE_DO_CMV = 'cmv';

// ================================================================ ler o que vale

export interface ConjuntoLido {
  id: string;
  lojaId: string | null;
  vigenteDesde: string;
  segueARede: boolean;
  aplicouModelo: string | null;
  versao: number;
  atualizadoEm: Date;
  /** categoriaId → pontos-base. */
  metas: Map<string, number>;
}

/**
 * Os conjuntos que valem no começo de um período (`inicio`): o último de cada escopo até essa data. Três consultas, quantas
 * lojas forem (o número não cresce com elas): os conjuntos, as metas deles.
 */
export async function conjuntosVigentes(tx: ClienteDoParceiro, lojaIds: readonly string[], inicio: string): Promise<{ rede: ConjuntoLido | null; porLoja: Map<string, ConjuntoLido> }> {
  const linhas = await tx.sql<{ id: string; lojaId: string | null; vigenteDesde: string; segueARede: boolean; aplicouModelo: string | null; versao: number; atualizadoEm: Date }>`
    SELECT DISTINCT ON (c."lojaId") c."id", c."lojaId", to_char(c."vigenteDesde", 'YYYY-MM-DD') AS "vigenteDesde", c."segueARede", c."aplicouModelo", c."versao", c."atualizadoEm"
    FROM "MetaCmvConjunto" c
    WHERE c."parceiroId" = ${tx.parceiroId} AND c."vigenteDesde" <= ${inicio}::date AND (c."lojaId" IS NULL OR c."lojaId" = ANY(${[...lojaIds]}::text[]))
    ORDER BY c."lojaId", c."vigenteDesde" DESC`;
  const metas = linhas.length ? await tx.metaCmvCategoria.findMany({ where: { conjuntoId: { in: linhas.map((l) => l.id) } }, select: { conjuntoId: true, categoriaId: true, percentualBp: true } }) : [];
  const porConjunto = new Map<string, Map<string, number>>();
  for (const m of metas) {
    if (!porConjunto.has(m.conjuntoId)) porConjunto.set(m.conjuntoId, new Map());
    porConjunto.get(m.conjuntoId)!.set(m.categoriaId, m.percentualBp);
  }
  let rede: ConjuntoLido | null = null;
  const porLoja = new Map<string, ConjuntoLido>();
  for (const l of linhas) {
    const c: ConjuntoLido = { ...l, metas: porConjunto.get(l.id) ?? new Map() };
    if (l.lojaId === null) rede = c;
    else porLoja.set(l.lojaId, c);
  }
  return { rede, porLoja };
}

export interface MetasDaLoja {
  /** De onde a meta da loja vem; nulo = nenhum conjunto vale para ela. */
  origem: 'rede' | 'loja' | null;
  metas: Map<string, number> | null;
  conjunto: ConjuntoLido | null;
}

/** A meta que vale para a loja: o conjunto próprio, ou o da rede quando ela segue (ou não tem o seu). */
export function metasDaLoja(v: { rede: ConjuntoLido | null; porLoja: ReadonlyMap<string, ConjuntoLido> }, lojaId: string): MetasDaLoja {
  const dela = v.porLoja.get(lojaId);
  if (dela && !dela.segueARede) return { origem: 'loja', metas: dela.metas, conjunto: dela };
  if (v.rede) return { origem: 'rede', metas: v.rede.metas, conjunto: v.rede };
  return { origem: null, metas: null, conjunto: null };
}

/** As categorias que cada loja NÃO usa (padrão: todas as usam). Uma consulta. */
export async function categoriasQueNaoUsa(tx: ClienteDoParceiro, lojaIds: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (lojaIds.length === 0) return out;
  const linhas = await tx.categoriaNaLoja.findMany({ where: { lojaId: { in: [...lojaIds] }, usa: false }, select: { lojaId: true, categoriaId: true } });
  for (const l of linhas) {
    if (!out.has(l.lojaId)) out.set(l.lojaId, new Set());
    out.get(l.lojaId)!.add(l.categoriaId);
  }
  return out;
}

// ================================================================ a tela

export interface CategoriaDoFormulario extends CategoriaParaMeta {
  /** A loja usa esta categoria (na visão da rede, sempre). */
  usa: boolean;
  /** O texto do campo da meta de agora (vazio = sem meta). */
  campo: string;
  /** A meta do conjunto da rede, para a loja que a segue mostrar de onde vem. */
  campoDaRede: string;
}

export interface SituacaoDasMetasPorCategoria {
  hoje: string;
  periodoAtual: { nome: string; inicio: string; fim: string };
  escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string; nome: string };
  lojas: { id: string; nome: string }[];
  categorias: CategoriaDoFormulario[];
  /** A meta total (a do CMV do DRE) de agora; vazio = sem meta. */
  totalCampo: string;
  totalBp: number | null;
  totalDesde: string | null;
  /** Visão da loja: ela segue a rede? */
  segueARede: boolean;
  /** Desde quando valem as metas que a tela mostra (o conjunto efetivo do escopo); nulo = nenhuma. */
  valeDesde: string | null;
  /** Visão da rede: quem segue a rede (a mudança vale para elas) e quem tem conjunto próprio (a mudança não as toca). */
  seguem: { id: string; nome: string }[];
  personalizadas: { id: string; nome: string }[];
  /** Se o conjunto efetivo nasceu do modelo de 32 %. */
  modeloAplicado: boolean;
  versao: string;
  historico: Awaited<ReturnType<typeof listarHistorico>>;
}

/** A impressão do que a tela leu: conjuntos, metas, uso por loja e a tabela de metas do DRE. Qualquer mudança nelas é conflito. */
async function impressaoDeTudo(tx: ClienteDoParceiro): Promise<string> {
  const [conjuntos, metas, usos, dre] = await Promise.all([
    tx.metaCmvConjunto.findMany({ orderBy: { id: 'asc' }, select: { id: true, versao: true, atualizadoEm: true, segueARede: true } }),
    tx.metaCmvCategoria.findMany({ orderBy: { id: 'asc' }, select: { id: true, percentualBp: true } }),
    tx.categoriaNaLoja.findMany({ orderBy: { id: 'asc' }, select: { id: true, versao: true, usa: true } }),
    lerTodasAsMetas(tx),
  ]);
  return createHash('sha256')
    .update(
      [
        conjuntos.map((c) => `${c.id}:${c.versao}:${c.atualizadoEm.getTime()}:${c.segueARede ? 1 : 0}`).join('|'),
        metas.map((m) => `${m.id}:${m.percentualBp}`).join('|'),
        usos.map((u) => `${u.id}:${u.versao}:${u.usa ? 1 : 0}`).join('|'),
        dre.map((m) => `${m.id}:${m.atualizadoEm.getTime()}:${m.percentualBp}:${m.semMeta ? 1 : 0}`).join('|'),
      ].join('#'),
    )
    .digest('hex')
    .slice(0, 16);
}

/** As categorias da casa, na ordem dela (ativas e desativadas; a tela decide quais mostra). */
async function categoriasDaCasa(tx: ClienteDoParceiro): Promise<CategoriaParaMeta[]> {
  const lidas = await tx.categoriaInsumo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, chave: true, nome: true, ordem: true, ativa: true, sistema: true } });
  return lidas;
}

/** A meta total de agora (a linha `cmv` do DRE) e desde quando vale; nula = sem meta. */
async function metaTotalDeAgora(tx: ClienteDoParceiro, inicio: string): Promise<{ bp: number | null; desde: string | null; linhaId: string | null }> {
  const plano = await planoDoParceiro(tx);
  const linha = plano.find((l) => chaveDaLinha(l) === CHAVE_DO_CMV);
  if (!linha?.id) return { bp: null, desde: null, linhaId: null };
  const m = efetivasEm(await lerTodasAsMetas(tx), inicio).get(linha.id);
  return m && !m.semMeta ? { bp: m.percentualBp, desde: m.vigenteDesde, linhaId: linha.id } : { bp: null, desde: null, linhaId: linha.id };
}

/**
 * A tela das metas por categoria (quem tem `metas.editar`, que exige a rede inteira). `lojaId` nulo = a rede. Loja que não existe
 * ou não está ativa: null (a página responde 404).
 */
export async function situacaoDasMetasPorCategoria(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string | null, hoje = hojeNoRio()): Promise<SituacaoDasMetasPorCategoria | null> {
  if (recusa(alcance, 'metas.editar')) return null;
  return cliente.transacao(async (tx) => {
    const periodoAtual = await periodoDe(tx, hoje);
    const lojas = await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } });
    const loja = lojaId === null ? null : lojas.find((l) => l.id === lojaId);
    if (lojaId !== null && !loja) return null;
    const todas = await categoriasDaCasa(tx);
    const vigentes = await conjuntosVigentes(tx, lojas.map((l) => l.id), periodoAtual.inicio);
    const naoUsa = loja ? ((await categoriasQueNaoUsa(tx, [loja.id])).get(loja.id) ?? new Set<string>()) : new Set<string>();
    const efetivas = loja ? metasDaLoja(vigentes, loja.id) : { origem: vigentes.rede ? ('rede' as const) : null, metas: vigentes.rede?.metas ?? null, conjunto: vigentes.rede };
    const total = await metaTotalDeAgora(tx, periodoAtual.inicio);
    // Mostra as ativas e as desativadas que ainda têm meta (a meta continua valendo; apagar o campo a tira).
    const categorias: CategoriaDoFormulario[] = todas
      .filter((c) => c.ativa || efetivas.metas?.has(c.id) || vigentes.rede?.metas.has(c.id))
      .map((c) => ({
        ...c,
        usa: !naoUsa.has(c.id),
        campo: efetivas.metas?.has(c.id) ? metaParaCampo(efetivas.metas.get(c.id)!) : '',
        campoDaRede: vigentes.rede?.metas.has(c.id) ? metaParaCampo(vigentes.rede.metas.get(c.id)!) : '',
      }));
    const seguem = lojas.filter((l) => metasDaLoja(vigentes, l.id).origem !== 'loja');
    const personalizadas = lojas.filter((l) => metasDaLoja(vigentes, l.id).origem === 'loja');
    const historico = await listarHistorico(tx, { entidades: ['MetaCmvConjunto', 'CategoriaNaLoja'], verPrecos: false, verDre: true, limite: 12 });
    return {
      hoje,
      periodoAtual,
      escopo: loja ? { tipo: 'loja' as const, lojaId: loja.id, nome: loja.nome } : { tipo: 'rede' as const },
      lojas,
      categorias,
      totalCampo: total.bp === null ? '' : metaParaCampo(total.bp),
      totalBp: total.bp,
      totalDesde: total.desde,
      segueARede: loja ? efetivas.origem !== 'loja' : false,
      valeDesde: efetivas.conjunto?.vigenteDesde ?? null,
      seguem,
      personalizadas,
      modeloAplicado: efetivas.conjunto?.aplicouModelo === MODELO_32,
      versao: await impressaoDeTudo(tx),
      historico,
    };
  });
}

// ================================================================ gravar

export type ResultadoDasMetasPorCategoria =
  | { ok: true; mudou: number; valeDesde: string; aviso: string | null }
  | { ok: false; erros: Record<string, string>; conflito?: boolean };

const falha = (geral: string, conflito?: boolean): ResultadoDasMetasPorCategoria => ({ ok: false, erros: { geral }, ...(conflito ? { conflito } : {}) });

export interface EntradaDasMetasPorCategoria {
  /** A loja do formulário (preso à URL); nulo = a rede. */
  lojaId: string | null;
  versao: unknown;
  /** Só na rede: o texto da meta total. Ausente na loja (o total é do DRE e não muda por loja). */
  total?: unknown;
  /** categoriaId → texto da meta. */
  campos: Readonly<Record<string, unknown>>;
  /** Só na loja: segue a rede? */
  segue?: unknown;
  /** Só na loja: categoriaId → a loja usa? Categoria ausente aqui fica como está. */
  usa?: Readonly<Record<string, unknown>>;
}

const igual = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) => a.size === b.size && Array.from(a).every(([k, v]) => b.get(k) === v);

const textoDaMetaDoHistorico = (bp: number) => percentualComDuasCasas(bp);

/** O retrato de um conjunto para o histórico: quem é, desde quando, de onde vem a meta e uma linha por categoria com meta. */
function retratoDoConjunto(escopoNome: string, valeDesde: string, segue: boolean, metas: ReadonlyMap<string, number>, nomes: ReadonlyMap<string, string>): Prisma.InputJsonObject {
  const o: Record<string, string> = { alvo: `Metas por categoria · ${escopoNome}`, valeDesde: formatarData(valeDesde), metas: segue ? 'segue a rede' : metas.size === 0 ? 'nenhuma meta própria' : 'metas próprias' };
  for (const [id, bp] of Array.from(metas).sort((a, b) => (nomes.get(a[0]) ?? '').localeCompare(nomes.get(b[0]) ?? '', 'pt-BR'))) o[`meta · ${nomes.get(id) ?? id}`] = textoDaMetaDoHistorico(bp);
  return o;
}

/**
 * Grava as metas por categoria de um escopo (a rede, ou uma loja), com a meta total na rede. Tudo numa transação, sob a trava
 * `erp-metas` (a mesma de `salvarMetas`, pega UMA vez), conferindo a impressão do que foi lido. Tudo ou nada: campo inválido
 * (100,01, negativo, três casas, notação científica) ou categoria forjada recusa sem gravar nada.
 */
export async function salvarMetasPorCategoria(cliente: ClienteDoParceiro, alcance: Alcance, entrada: EntradaDasMetasPorCategoria, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDasMetasPorCategoria> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return falha(negado);
  if (Object.keys(entrada.campos).length > 200) return falha('Categorias demais de uma vez.');
  return cliente.transacao(
    async (tx): Promise<ResultadoDasMetasPorCategoria> => {
      await travarMetas(tx);
      const periodo = await periodoDe(tx, hoje);
      await garantirPlano(tx);
      if (String(entrada.versao ?? '') !== (await impressaoDeTudo(tx))) return falha(MENSAGEM_CONFLITO_DAS_METAS_POR_CATEGORIA, true);

      const lojas = await tx.loja.findMany({ where: { ativa: true }, select: { id: true, nome: true } });
      const loja = entrada.lojaId === null ? null : lojas.find((l) => l.id === entrada.lojaId);
      if (entrada.lojaId !== null && !loja) return falha('Essa loja não existe mais ou está desativada. Recarregue a página; nada foi gravado.', true);
      const categorias = await categoriasDaCasa(tx);
      const nomes = new Map(categorias.map((c) => [c.id, c.nome]));
      const lido = lerMetasDoFormulario({ total: loja ? '' : entrada.total ?? '', campos: entrada.campos }, new Set(categorias.map((c) => c.id)));
      if (!lido.ok) return { ok: false, erros: lido.erros };
      const { totalBp } = lido.lidas;

      const escopoNome = loja ? loja.nome : 'Rede';
      const vigentes = await conjuntosVigentes(tx, lojas.map((l) => l.id), periodo.inicio);
      const usaNovo = new Map<string, boolean>();
      if (loja) {
        for (const [id, v] of Object.entries(entrada.usa ?? {})) {
          if (!nomes.has(id)) return falha('Uma das categorias não existe mais. Recarregue a página; nada foi gravado.', true);
          usaNovo.set(id, v === true || v === 'sim' || v === 'on');
        }
      }
      const naoUsaAntes = loja ? ((await categoriasQueNaoUsa(tx, [loja.id])).get(loja.id) ?? new Set<string>()) : new Set<string>();
      const usaDepois = (id: string) => (usaNovo.has(id) ? usaNovo.get(id)! : !naoUsaAntes.has(id));

      // A meta de uma categoria que a loja não usa não existe: o formulário nem a mostra.
      const metas = new Map(Array.from(lido.lidas.metas).filter(([id]) => !loja || usaDepois(id)));
      const segue = loja ? entrada.segue === true || entrada.segue === 'sim' || entrada.segue === 'on' : false;

      // O modelo de 32 %: marcado SÓ quando os campos mandados são exatamente o que o modelo preenche nesta casa.
      const modeloBate = !loja && totalBp === TOTAL_DO_MODELO_32_BP && igual(metas, metasDoModelo32(categorias));
      const aplicouModelo = modeloBate ? MODELO_32 : null;

      let mudou = 0;
      // ---- a meta total (a linha CMV do DRE): só pela rede, pela MESMA função que grava a tabela de metas do DRE
      if (!loja) {
        const plano = await planoDoParceiro(tx);
        const porChave = new Map(plano.filter((l) => l.id).map((l) => [chaveDaLinha(l), l]));
        mudou += await gravarMetasDasLinhas(tx, { periodo, porChave, todas: await lerTodasAsMetas(tx) }, new Map([[CHAVE_DO_CMV, totalBp]]), autorNome);
      }

      // ---- o uso por loja
      if (loja) {
        const existentes = await tx.categoriaNaLoja.findMany({ where: { lojaId: loja.id }, select: { id: true, categoriaId: true, usa: true, versao: true } });
        const porCategoria = new Map(existentes.map((e) => [e.categoriaId, e]));
        for (const c of categorias) {
          if (!usaNovo.has(c.id)) continue;
          const atual = porCategoria.get(c.id);
          const antes = atual ? atual.usa : true;
          if (antes === usaNovo.get(c.id)) continue;
          let id: string;
          if (atual) {
            await tx.categoriaNaLoja.update({ where: { id: atual.id }, data: { usa: usaNovo.get(c.id)!, versao: atual.versao + 1, atualizadoPorNome: autorNome.slice(0, 120) } });
            id = atual.id;
          } else {
            id = (await tx.categoriaNaLoja.create({ data: { parceiroId: tx.parceiroId, lojaId: loja.id, categoriaId: c.id, usa: usaNovo.get(c.id)!, atualizadoPorNome: autorNome.slice(0, 120) }, select: { id: true } })).id;
          }
          const retrato = (u: boolean) => ({ alvo: `${c.nome} · ${loja.nome}`, situacao: u ? 'usa' : 'não usa' });
          await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'CategoriaNaLoja', entidadeId: id, acao: atual ? 'ALTEROU' : 'CRIOU', antes: atual ? retrato(antes) : undefined, depois: retrato(usaNovo.get(c.id)!), autorNome } });
          mudou++;
        }
      }

      // ---- o conjunto de metas do escopo
      const atual = loja ? metasDaLoja(vigentes, loja.id) : { origem: vigentes.rede ? ('rede' as const) : null, metas: vigentes.rede?.metas ?? null, conjunto: vigentes.rede };
      const estavaSeguindo = loja ? atual.origem !== 'loja' : false;
      const mudouConjunto = loja ? (segue ? !estavaSeguindo : estavaSeguindo || !igual(atual.metas ?? new Map(), metas)) : !igual(atual.metas ?? new Map(), metas);
      if (mudouConjunto) {
        const proprio = loja ? vigentes.porLoja.get(loja.id) : vigentes.rede;
        const doPeriodo = proprio && proprio.vigenteDesde === periodo.inicio ? proprio : null;
        const metasGravadas: ReadonlyMap<string, number> = segue ? new Map() : metas;
        let conjuntoId: string;
        if (doPeriodo) {
          conjuntoId = doPeriodo.id;
          const linhas = await tx.metaCmvCategoria.findMany({ where: { conjuntoId }, select: { id: true, categoriaId: true, percentualBp: true } });
          const sobra = linhas.filter((l) => !metasGravadas.has(l.categoriaId));
          // Segue a rede: as metas próprias saem ANTES de o conjunto passar a seguir (o banco recusa meta em conjunto que segue).
          if (sobra.length) await tx.metaCmvCategoria.deleteMany({ where: { id: { in: sobra.map((l) => l.id) } } });
          await tx.metaCmvConjunto.update({ where: { id: conjuntoId }, data: { segueARede: segue, aplicouModelo, versao: doPeriodo.versao + 1, criadoPorNome: autorNome.slice(0, 120) } });
          const existentes = new Map(linhas.map((l) => [l.categoriaId, l]));
          const novas: { parceiroId: string; conjuntoId: string; categoriaId: string; percentualBp: number }[] = [];
          for (const [categoriaId, bp] of metasGravadas) {
            const ja = existentes.get(categoriaId);
            if (!ja) novas.push({ parceiroId: tx.parceiroId, conjuntoId, categoriaId, percentualBp: bp });
            else if (ja.percentualBp !== bp) await tx.metaCmvCategoria.update({ where: { id: ja.id }, data: { percentualBp: bp } });
          }
          if (novas.length) await tx.metaCmvCategoria.createMany({ data: novas });
        } else {
          conjuntoId = (
            await tx.metaCmvConjunto.create({
              data: { parceiroId: tx.parceiroId, lojaId: loja ? loja.id : null, vigenteDesde: dataDoBanco(periodo.inicio), segueARede: segue, aplicouModelo, criadoPorNome: autorNome.slice(0, 120) },
              select: { id: true },
            })
          ).id;
          if (metasGravadas.size) await tx.metaCmvCategoria.createMany({ data: Array.from(metasGravadas).map(([categoriaId, bp]) => ({ parceiroId: tx.parceiroId, conjuntoId, categoriaId, percentualBp: bp })) });
        }
        const antesDo = atual.conjunto ? retratoDoConjunto(escopoNome, atual.conjunto.vigenteDesde, loja ? estavaSeguindo : false, atual.metas ?? new Map(), nomes) : undefined;
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'MetaCmvConjunto', entidadeId: conjuntoId, acao: antesDo ? 'ALTEROU' : 'CRIOU', antes: antesDo, depois: retratoDoConjunto(escopoNome, periodo.inicio, segue, metasGravadas, nomes), autorNome },
        });
        mudou++;
      }

      // ---- o aviso de que a divisão não fecha no total (aviso, nunca bloqueio)
      const totalParaAviso = loja ? (await metaTotalDeAgora(tx, periodo.inicio)).bp : totalBp;
      const somaParaAviso = loja && segue ? somaDasMetas(new Map(Array.from(vigentes.rede?.metas ?? new Map<string, number>()).filter(([id]) => usaDepois(id)))) : somaDasMetas(metas);
      return { ok: true, mudou, valeDesde: periodo.inicio, aviso: avisoDaSoma(somaParaAviso, totalParaAviso) };
    },
    { timeout: 20_000 },
  );
}
