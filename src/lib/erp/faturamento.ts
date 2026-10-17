/**
 * Faturamento por canal (2.1) — regras com banco. Recebe sempre um
 * `ClienteDoParceiro` (o parceiro da sessão, pelo portão) e o `Alcance` da
 * pessoa: faturamento é por LOJA, então ler, lançar, corrigir, remover e
 * importar só valem nas lojas do alcance (`faturamento.ver` e
 * `faturamento.lancar`, as duas por loja). A action também confere; aqui é a
 * segunda trava, e a única que enxerga a loja que a linha JÁ tem.
 *
 * - UMA linha humana por loja × canal × dia (MANUAL ou IMPORTACAO), com a
 *   chave `manual:<loja>:-:<canal>:<dia>`: redigitar ou reimportar é correção,
 *   não soma (decisões 121 e 123). Regravar igual não cria linha nem histórico;
 *   a corrida de criação cai no único (INSERT … ON CONFLICT DO NOTHING) e quem
 *   perde recebe "Fulano lançou este dia agora: R$ X · N pedidos";
 * - corrigir é no lugar, condicional ao `atualizadoEm` lido de cada canal
 *   (duas abas: a segunda recebe o conflito e nada é sobrescrito); toda
 *   gravação leva o antes/depois ao histórico na MESMA transação; remover
 *   exige motivo e grava o antes (decisão 125);
 * - período FECHADO recusa gravar: toda escrita pega a trava compartilhada do
 *   faturamento e confere o período (`periodo-trava.ts`; a 2.2 fecha com a
 *   mesma chave em modo exclusivo);
 * - a leitura é UMA: `faturamentoDosGraos`. Havendo linha de INTEGRACAO no
 *   grão, vale a soma dela e a digitada vira conferência (nunca soma as duas).
 *   A integração em si NÃO existe na 2.1: só o contrato (decisão 127);
 * - ticket médio, total do dia e do mês são derivados na leitura; nada disso
 *   é gravado.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { hojeNoRio, lerData } from './compra-campos';
import { CANAIS } from './canal-campos';
import {
  CANAIS_EM_ORDEM,
  canaisEmFalta,
  chaveHumana,
  diasDoMes,
  ehCanal,
  fraseDoNumero,
  lerCanalDoDia,
  lerDataDoLancamento,
  lerGrao,
  LIMITES_DO_FATURAMENTO,
  mesmosNumeros,
  retratoDoLancamento,
  rotuloDoCanal,
  totalizar,
  type CanalVenda,
  type ErrosDoCanal,
  type GraoLido,
  type NumerosDoCanal,
  type OrigemDoLancamento,
  type TotaisDoRecorte,
} from './faturamento-campos';
import { interpretarLinha, lerPlanilhaDeFaturamento, LIMITE_DA_PLANILHA, LIMITES_DA_PLANILHA, type ErroDeLinha, type LojaParaPlanilha } from './faturamento-planilha';
import { listarHistorico } from './historico';
import { diferenca } from './insumo-campos';
import { datasEmPeriodoFechado, fraseDoPeriodoFechado, travarParaEscreverFaturamento } from './periodo-trava';
import { alcancaLoja, filtroDeLojas, recusa, type Alcance } from './permissoes';
import { checkVioladoDe, type ClienteDoParceiro } from './tenant';

export const MENSAGEM_LOJA_FORA = 'Loja não encontrada no seu acesso.';
export const MENSAGEM_CONFLITO_DO_DIA = 'Alguém alterou este dia agora há pouco. Recarregue a página para ver os números novos; nada foi gravado.';
const HUMANAS = ['MANUAL', 'IMPORTACAO'] as const;

export interface LojaDoFaturamento {
  id: string;
  nome: string;
  ativa: boolean;
  canais: CanalVenda[];
}

const SELECAO_DA_LOJA = { id: true, nome: true, ativa: true, canaisDeVenda: true } as const;
const daLoja = (l: { id: string; nome: string; ativa: boolean; canaisDeVenda: CanalVenda[] | null }): LojaDoFaturamento => ({
  id: l.id,
  nome: l.nome,
  ativa: l.ativa,
  canais: CANAIS_EM_ORDEM.filter((c) => (l.canaisDeVenda ?? []).includes(c)),
});

const isoDoDia = (d: Date) => d.toISOString().slice(0, 10);
const dataDoBanco = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** As lojas do alcance (qualquer situação), com os canais em que vendem. */
export async function lojasDoFaturamento(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>): Promise<LojaDoFaturamento[]> {
  const lojas = await cliente.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: [{ ativa: 'desc' }, { nome: 'asc' }], select: SELECAO_DA_LOJA });
  return lojas.map(daLoja);
}

/** `faturamento.ver` na loja (a regra única da 0.4): a frase da recusa, ou null. */
const semAcessoParaVer = (alcance: Alcance, lojaId: string) => recusa(alcance, 'faturamento.ver', { lojaId });
/** Gravar exige ver E lançar, na loja de CADA linha (decisão 128). */
const semAcessoParaLancar = (alcance: Alcance, lojaId: string) => recusa(alcance, 'faturamento.ver', { lojaId }) ?? recusa(alcance, 'faturamento.lancar', { lojaId });

// ================================================================ ler o dia

export interface LancamentoLido extends NumerosDoCanal {
  id: string;
  origem: OrigemDoLancamento;
  /** O `atualizadoEm` lido: a tela devolve e a gravação confere (duas abas). */
  versao: string;
  atualizadoEm: Date;
  atualizadoPorNome: string;
}

export interface CanalNoDia {
  canal: CanalVenda;
  /** A loja vende neste canal hoje (canal desligado só aparece se já tem lançamento). */
  ativo: boolean;
  /** O que a casa digitou ou importou. */
  humano: LancamentoLido | null;
  /** O que vale (a integração, se existe; senão o humano) e a conferência. */
  valendo: GraoLido | null;
}

export interface DiaDaLojaLido {
  loja: LojaDoFaturamento;
  data: string;
  canais: CanalNoDia[];
  /** Nome do período fechado que cobre o dia, se houver. */
  fechado: string | null;
  historico: Awaited<ReturnType<typeof listarHistorico>>;
}

/** O dia de uma loja, para a tela de lançar. Loja de outro parceiro, fora do alcance ou inexistente = null (404). */
export async function obterDia(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, data: string): Promise<DiaDaLojaLido | null> {
  if (semAcessoParaVer(alcance, lojaId)) return null;
  return cliente.transacao(async (tx) => {
    const l = await tx.loja.findUnique({ where: { id: lojaId }, select: SELECAO_DA_LOJA });
    if (!l || !alcancaLoja(alcance, l.id)) return null;
    const loja = daLoja(l);
    const linhas = await tx.faturamentoLancamento.findMany({ where: { lojaId, data: dataDoBanco(data) }, orderBy: { criadoEm: 'asc' } });
    const fechado = (await datasEmPeriodoFechado(tx, [data])).get(data) ?? null;
    const historico = await listarHistorico(tx, { faturamentoDoDia: { lojaId, dia: data }, verFaturamento: true, verPrecos: false, limite: 10 });
    const canais: CanalNoDia[] = CANAIS_EM_ORDEM.map((canal) => {
      const dele = linhas.filter((x) => x.canal === canal);
      const h = dele.find((x) => x.origem !== 'INTEGRACAO');
      return {
        canal,
        ativo: loja.canais.includes(canal),
        humano: h
          ? {
              id: h.id,
              origem: h.origem,
              versao: h.atualizadoEm.toISOString(),
              atualizadoEm: h.atualizadoEm,
              atualizadoPorNome: h.atualizadoPorNome,
              valorCentavos: h.valorCentavos,
              pedidos: h.pedidos,
              clientes: h.clientes,
            }
          : null,
        valendo: lerGrao(dele),
      };
    }).filter((c) => c.ativo || c.valendo);
    return { loja, data, canais, fechado, historico };
  });
}

// ================================================================ lançar o dia

export interface EntradaDoCanal {
  canal: string;
  valor: string;
  pedidos: string;
  clientes: string;
  naoVendeu: boolean;
  /** O `atualizadoEm` que a tela leu ('' = ainda sem lançamento). */
  versao: string;
}

export interface EntradaDoDia {
  lojaId: string;
  data: string;
  canais: EntradaDoCanal[];
}

export type SituacaoDoCanal = 'criado' | 'alterado' | 'igual';

export type ResultadoDoDia =
  | { ok: true; canais: Partial<Record<CanalVenda, SituacaoDoCanal>> }
  | {
      ok: false;
      erros: { geral?: string; data?: string };
      porCanal: Partial<Record<CanalVenda, ErrosDoCanal>>;
      conflito?: boolean;
      naoEncontrado?: boolean;
    };

type Recusada = Extract<ResultadoDoDia, { ok: false }>;
const recusar = (geral: string, extra: Partial<Recusada> = {}): Recusada => ({ ok: false, erros: geral ? { geral } : {}, porCanal: {}, ...extra });

/** Interrompe a transação (e desfaz tudo) com a resposta para a tela. */
class Recusa extends Error {
  constructor(readonly resultado: Recusada) {
    super('recusa');
  }
}

const motivoLimpo = (t: unknown) => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 200) : '');

/** "Ana lançou o iFood deste dia agora: R$ 3.210,00 · 41 pedidos. Recarregue…" */
function fraseDoConflito(canal: CanalVenda, quem: string, n: NumerosDoCanal | null): string {
  if (!n) return `O lançamento do ${rotuloDoCanal(canal)} deste dia foi removido agora há pouco. Recarregue a página; nada foi gravado.`;
  return `${quem || 'Alguém'} lançou o ${rotuloDoCanal(canal)} deste dia agora: ${fraseDoNumero(n)}. Recarregue a página para ver; nada foi gravado.`;
}

/** Lê e confere as pré-condições de escrita dentro da transação: trava, período, loja e canais. */
async function prepararEscrita(tx: ClienteDoParceiro, alcance: Alcance, lojaId: string, datas: readonly string[]): Promise<LojaDoFaturamento> {
  await travarParaEscreverFaturamento(tx);
  const l = await tx.loja.findUnique({ where: { id: lojaId }, select: SELECAO_DA_LOJA });
  if (!l || !alcancaLoja(alcance, l.id)) throw new Recusa(recusar(MENSAGEM_LOJA_FORA, { naoEncontrado: true }));
  const fechada = await datasEmPeriodoFechado(tx, datas);
  const primeira = datas.find((d) => fechada.has(d));
  if (primeira) throw new Recusa(recusar(fraseDoPeriodoFechado(fechada.get(primeira)!)));
  return daLoja(l);
}

/**
 * Lança (cria ou corrige) os canais de um dia. Tudo ou nada: se um canal der
 * conflito ou erro, nenhum é gravado. Canal em branco não é tocado. Regravar o
 * mesmo número é "igual": nenhuma linha, nenhum histórico.
 */
export async function lancarDia(cliente: ClienteDoParceiro, alcance: Alcance, entrada: EntradaDoDia, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDoDia> {
  const lojaId = String(entrada.lojaId ?? '');
  const negado = semAcessoParaLancar(alcance, lojaId);
  if (negado) return recusar(negado, { naoEncontrado: !alcancaLoja(alcance, lojaId) });
  const data = lerDataDoLancamento(String(entrada.data ?? ''), hoje);
  if (!data.ok) return { ok: false, erros: { data: data.erro }, porCanal: {} };

  // 1) Ler tudo do texto, sem banco: o servidor decide, a tela só mostrou prévia.
  const lidos: { canal: CanalVenda; numeros: NumerosDoCanal; versao: string }[] = [];
  const porCanal: Partial<Record<CanalVenda, ErrosDoCanal>> = {};
  const vistos = new Set<string>();
  for (const e of entrada.canais ?? []) {
    if (!ehCanal(e.canal) || vistos.has(e.canal)) return recusar('Canal inválido.');
    vistos.add(e.canal);
    const r = lerCanalDoDia({ valor: String(e.valor ?? ''), pedidos: String(e.pedidos ?? ''), clientes: String(e.clientes ?? ''), naoVendeu: e.naoVendeu === true });
    if (r.estado === 'erro') porCanal[e.canal] = r.erros;
    else if (r.estado === 'ok') lidos.push({ canal: e.canal, numeros: r.numeros, versao: String(e.versao ?? '') });
  }
  if (Object.keys(porCanal).length > 0) return { ok: false, erros: {}, porCanal };
  if (lidos.length === 0) return recusar('Nada para salvar: preencha ao menos um canal, ou marque “Não vendeu”.');

  // 2) Gravar numa transação só.
  try {
    return await cliente.transacao(async (tx) => {
      const loja = await prepararEscrita(tx, alcance, lojaId, [data.data]);
      if (!loja.ativa) throw new Recusa(recusar(`A loja ${loja.nome} está desativada: não recebe lançamento novo.`));
      const resultado: Partial<Record<CanalVenda, SituacaoDoCanal>> = {};
      for (const { canal, numeros, versao } of lidos) {
        const atual = await tx.faturamentoLancamento.findFirst({ where: { lojaId, canal, data: dataDoBanco(data.data), origem: { in: [...HUMANAS] } } });
        const ja = atual ? { valorCentavos: atual.valorCentavos, pedidos: atual.pedidos, clientes: atual.clientes } : null;
        // Igual ao que já está (duplo clique, reenvio): nada a fazer, mesmo que a versão da tela esteja velha.
        if (ja && mesmosNumeros(ja, numeros)) {
          resultado[canal] = 'igual';
          continue;
        }
        const retrato = (n: NumerosDoCanal, origem: OrigemDoLancamento) => retratoDoLancamento({ lojaId, lojaNome: loja.nome, canal, data: data.data, origem, ...n });
        if (!atual) {
          if (versao !== '') throw new Recusa(recusar(fraseDoConflito(canal, '', null), { conflito: true }));
          if (!loja.canais.includes(canal)) throw new Recusa(recusar('', { porCanal: { [canal]: { geral: `A loja ${loja.nome} não vende por ${rotuloDoCanal(canal)}.` } } }));
          const criadas = await tx.faturamentoLancamento.createManyAndReturn({
            data: [{ parceiroId: tx.parceiroId, lojaId, canal, data: dataDoBanco(data.data), ...numeros, origem: 'MANUAL', chaveIdempotencia: chaveHumana(lojaId, canal, data.data), atualizadoPorNome: autorNome.slice(0, 120) }],
            skipDuplicates: true,
            select: { id: true },
          });
          if (criadas.length === 0) {
            // Alguém criou o mesmo canal neste dia entre a leitura e a gravação.
            const quem = await tx.faturamentoLancamento.findFirst({ where: { lojaId, canal, data: dataDoBanco(data.data), origem: { in: [...HUMANAS] } } });
            const n = quem ? { valorCentavos: quem.valorCentavos, pedidos: quem.pedidos, clientes: quem.clientes } : null;
            // O mesmo número na corrida (duplo clique, reenvio): a linha é uma só, e está certa.
            if (n && mesmosNumeros(n, numeros)) {
              resultado[canal] = 'igual';
              continue;
            }
            throw new Recusa(recusar(fraseDoConflito(canal, quem?.atualizadoPorNome ?? '', n), { conflito: true }));
          }
          await tx.historicoAlteracao.create({
            data: { parceiroId: tx.parceiroId, entidade: 'FaturamentoLancamento', entidadeId: criadas[0].id, acao: 'CRIOU', depois: retrato(numeros, 'MANUAL'), autorNome },
          });
          resultado[canal] = 'criado';
          continue;
        }
        // Já existe e é diferente: só corrige quem leu a versão que está lá.
        if (versao === '' || versao !== atual.atualizadoEm.toISOString()) {
          throw new Recusa(recusar(fraseDoConflito(canal, atual.atualizadoPorNome, ja), { conflito: true }));
        }
        const r = await tx.faturamentoLancamento.updateMany({
          where: { id: atual.id, atualizadoEm: atual.atualizadoEm },
          data: { ...numeros, origem: 'MANUAL', origemRef: null, atualizadoPorNome: autorNome.slice(0, 120) },
        });
        if (r.count === 0) throw new Recusa(recusar(MENSAGEM_CONFLITO_DO_DIA, { conflito: true }));
        const d = diferenca(retrato(ja!, atual.origem), retrato(numeros, 'MANUAL'));
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'FaturamentoLancamento', entidadeId: atual.id, acao: 'ALTEROU', antes: d!.antes, depois: d!.depois, autorNome },
        });
        resultado[canal] = 'alterado';
      }
      return { ok: true as const, canais: resultado };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (checkVioladoDe(e)) return recusar('Algum número passou do limite permitido. Confira os valores e salve de novo.');
    throw e;
  }
}

// ================================================================ remover

export interface EntradaDaRemocao {
  lojaId: string;
  data: string;
  canal: string;
  motivo: unknown;
  versao: string;
}

/**
 * Remove o lançamento humano de um canal num dia (loja ou dia errado). O dia
 * volta a "sem lançamento". Motivo obrigatório (3 a 200) e o antes vai ao
 * histórico. Linha de integração não se remove à mão.
 */
export async function removerLancamento(cliente: ClienteDoParceiro, alcance: Alcance, e: EntradaDaRemocao, autorNome: string): Promise<ResultadoDoDia> {
  const lojaId = String(e.lojaId ?? '');
  const negado = semAcessoParaLancar(alcance, lojaId);
  if (negado) return recusar(negado, { naoEncontrado: !alcancaLoja(alcance, lojaId) });
  if (!ehCanal(e.canal)) return recusar('Canal inválido.');
  const canal = e.canal;
  // Remover não tem janela de 3 anos (um erro antigo, descoberto tarde, precisa sair); só a data tem de existir.
  const dataLida = lerData(String(e.data ?? ''));
  if (!dataLida || dataLida < LIMITES_DO_FATURAMENTO.dataMinima) return { ok: false, erros: { data: 'Data inválida: use dd/mm/aaaa.' }, porCanal: {} };
  const dia = { data: dataLida };
  const motivo = motivoLimpo(e.motivo);
  if (motivo.length < 3) return { ok: false, erros: {}, porCanal: { [canal]: { geral: 'Diga o motivo da remoção (de 3 a 200 letras).' } } };
  try {
    return await cliente.transacao(async (tx) => {
      const loja = await prepararEscrita(tx, alcance, lojaId, [dia.data]);
      const atual = await tx.faturamentoLancamento.findFirst({ where: { lojaId, canal, data: dataDoBanco(dia.data), origem: { in: [...HUMANAS] } } });
      if (!atual) throw new Recusa(recusar(fraseDoConflito(canal, '', null), { conflito: true }));
      if (String(e.versao ?? '') !== atual.atualizadoEm.toISOString()) {
        throw new Recusa(recusar(fraseDoConflito(canal, atual.atualizadoPorNome, atual), { conflito: true }));
      }
      const r = await tx.faturamentoLancamento.deleteMany({ where: { id: atual.id, atualizadoEm: atual.atualizadoEm } });
      if (r.count === 0) throw new Recusa(recusar(MENSAGEM_CONFLITO_DO_DIA, { conflito: true }));
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'FaturamentoLancamento',
          entidadeId: atual.id,
          acao: 'EXCLUIU',
          antes: retratoDoLancamento({ lojaId, lojaNome: loja.nome, canal, data: dia.data, origem: atual.origem, valorCentavos: atual.valorCentavos, pedidos: atual.pedidos, clientes: atual.clientes }),
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, canais: {} };
    });
  } catch (err) {
    if (err instanceof Recusa) return err.resultado;
    throw err;
  }
}

// ================================================================ canais da loja

export type ResultadoDosCanais = { ok: true; mudou: boolean } | { ok: false; erro: string };

/**
 * Em quais canais a loja vende (`Loja.canaisDeVenda`, decisão 124). É cadastro
 * da rede: o chamador exige `lojas.gerir` (rede inteira). Condicional aos
 * canais lidos (duas abas); antes/depois no histórico. Desligar um canal não
 * apaga o que já foi lançado nele.
 */
export async function salvarCanaisDaLoja(cliente: ClienteDoParceiro, lojaId: string, canais: readonly string[], liaAntes: readonly string[], autorNome: string): Promise<ResultadoDosCanais> {
  const novos = CANAIS_EM_ORDEM.filter((c) => canais.includes(c));
  if (novos.length === 0 || canais.some((c) => !ehCanal(c))) return { ok: false, erro: 'Escolha pelo menos um canal em que a loja vende.' };
  return cliente.transacao(async (tx) => {
    const l = await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true, canaisDeVenda: true } });
    if (!l) return { ok: false as const, erro: MENSAGEM_LOJA_FORA };
    const atuais = CANAIS_EM_ORDEM.filter((c) => (l.canaisDeVenda ?? []).includes(c));
    if (CANAIS_EM_ORDEM.filter((c) => liaAntes.includes(c)).join() !== atuais.join()) return { ok: false as const, erro: 'Alguém mudou os canais desta loja agora há pouco. Recarregue a página; nada foi gravado.' };
    if (atuais.join() === novos.join()) return { ok: true as const, mudou: false };
    const r = await tx.loja.updateMany({ where: { id: lojaId, canaisDeVenda: { equals: atuais } }, data: { canaisDeVenda: novos } });
    if (r.count === 0) return { ok: false as const, erro: 'Alguém mudou os canais desta loja agora há pouco. Recarregue a página; nada foi gravado.' };
    const texto = (cs: readonly CanalVenda[]) => cs.map((c) => CANAIS[c].curto).join(' · ');
    await tx.historicoAlteracao.create({
      data: { parceiroId: tx.parceiroId, entidade: 'Loja', entidadeId: l.id, acao: 'ALTEROU', antes: { nome: l.nome, canaisDeVenda: texto(atuais) }, depois: { nome: l.nome, canaisDeVenda: texto(novos) }, autorNome },
    });
    return { ok: true as const, mudou: true };
  });
}

// ================================================================ a leitura única

export interface GraoDeFaturamento extends GraoLido {
  lojaId: string;
  canal: CanalVenda;
  data: string;
}

/**
 * A leitura ÚNICA do faturamento (decisão 123): por loja × canal × dia, vale
 * a integração quando ela existe no grão, senão a digitada/importada. É por
 * aqui que a 2.2 (DRE) lê. Só traz as lojas do alcance (e opcionalmente uma).
 * Datas inclusivas, "aaaa-mm-dd".
 */
export async function faturamentoDosGraos(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, filtro: { de: string; ate: string; lojaId?: string }): Promise<GraoDeFaturamento[]> {
  if (filtro.lojaId !== undefined && !alcancaLoja(alcance, filtro.lojaId)) return [];
  const somas = await cliente.faturamentoLancamento.groupBy({
    by: ['lojaId', 'canal', 'data', 'origem'],
    where: {
      lojaId: filtro.lojaId !== undefined ? filtro.lojaId : filtroDeLojas(alcance),
      data: { gte: dataDoBanco(filtro.de), lte: dataDoBanco(filtro.ate) },
    },
    _sum: { valorCentavos: true, pedidos: true, clientes: true },
  });
  const porGrao = new Map<string, { lojaId: string; canal: CanalVenda; data: string; linhas: { origem: OrigemDoLancamento; valorCentavos: number; pedidos: number; clientes: number }[] }>();
  for (const s of somas) {
    const data = isoDoDia(s.data);
    const k = `${s.lojaId}|${s.canal}|${data}`;
    const g = porGrao.get(k) ?? { lojaId: s.lojaId, canal: s.canal, data, linhas: [] };
    g.linhas.push({ origem: s.origem, valorCentavos: s._sum.valorCentavos ?? 0, pedidos: s._sum.pedidos ?? 0, clientes: s._sum.clientes ?? 0 });
    porGrao.set(k, g);
  }
  const out: GraoDeFaturamento[] = [];
  for (const g of Array.from(porGrao.values())) {
    const lido = lerGrao(g.linhas);
    if (lido) out.push({ lojaId: g.lojaId, canal: g.canal, data: g.data, ...lido });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.lojaId.localeCompare(b.lojaId) || CANAIS_EM_ORDEM.indexOf(a.canal) - CANAIS_EM_ORDEM.indexOf(b.canal));
}

/** O mesmo, de um grão só (ou null quando o canal não foi lançado naquele dia). */
export async function faturamentoDoGrao(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, lojaId: string, canal: CanalVenda, data: string): Promise<GraoDeFaturamento | null> {
  const l = await faturamentoDosGraos(cliente, alcance, { de: data, ate: data, lojaId });
  return l.find((g) => g.canal === canal) ?? null;
}

// ================================================================ o mês

export interface DiaDaLojaNoMes {
  data: string;
  canais: Partial<Record<CanalVenda, GraoLido>>;
  /** Soma do que foi lançado no dia (null = nada lançado). */
  total: TotaisDoRecorte | null;
  faltam: CanalVenda[];
  /** Hoje: ainda dá tempo, não é falta. */
  emAberto: boolean;
  futuro: boolean;
}

export interface LojaNoMes {
  loja: LojaDoFaturamento;
  primeiraData: string | null;
  dias: DiaDaLojaNoMes[];
  porCanal: Record<CanalVenda, TotaisDoRecorte>;
  total: TotaisDoRecorte;
  faltasPorCanal: Record<CanalVenda, number>;
  faltas: number;
}

export interface MesDoFaturamento {
  mes: string;
  hoje: string;
  dias: string[];
  lojas: LojaNoMes[];
  /** A soma das lojas lidas (o alcance de quem vê, ou a loja escolhida). */
  porCanal: Record<CanalVenda, TotaisDoRecorte>;
  total: TotaisDoRecorte;
  faltas: number;
  /** Alguma linha vem da integração (a tela diz de onde vale o número). */
  temIntegracao: boolean;
}

const porCanalVazio = (): Record<CanalVenda, TotaisDoRecorte> => ({ LOJA: totalizar([]), DELIVERY_PROPRIO: totalizar([]), IFOOD: totalizar([]) });
const contagemVazia = (): Record<CanalVenda, number> => ({ LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 });

/**
 * O mês de faturamento: por loja, dia a dia, com as faltas; os totais por
 * canal; e a soma. `lojaId` ausente = todas as lojas do alcance (a rede).
 * Falta = canal que a loja vende, sem lançamento, do 1º lançamento dela até
 * ontem; hoje está "em aberto". Loja de fora do alcance nem entra na soma.
 */
export async function obterMes(cliente: ClienteDoParceiro, alcance: Alcance, filtro: { mes: string; lojaId?: string }, hoje = hojeNoRio()): Promise<MesDoFaturamento> {
  const dias = diasDoMes(filtro.mes);
  const de = dias[0];
  const ate = dias[dias.length - 1];
  const todas = (await lojasDoFaturamento(cliente, alcance)).filter((l) => !recusa(alcance, 'faturamento.ver', { lojaId: l.id }));
  const lojas = filtro.lojaId ? todas.filter((l) => l.id === filtro.lojaId) : todas;
  const ids = lojas.map((l) => l.id);
  const [graos, primeiras, integradas] = ids.length
    ? await Promise.all([
        faturamentoDosGraos(cliente, alcance, { de, ate }),
        cliente.faturamentoLancamento.groupBy({ by: ['lojaId'], where: { lojaId: { in: ids } }, _min: { data: true } }),
        cliente.faturamentoLancamento.count({ where: { lojaId: { in: ids }, origem: 'INTEGRACAO', data: { gte: dataDoBanco(de), lte: dataDoBanco(ate) } } }),
      ])
    : [[], [], 0];
  const primeira = new Map(primeiras.map((p) => [p.lojaId, p._min.data ? isoDoDia(p._min.data) : null]));
  const doGrao = new Map<string, GraoLido>();
  for (const g of graos) if (ids.includes(g.lojaId)) doGrao.set(`${g.lojaId}|${g.data}|${g.canal}`, g);

  const out: LojaNoMes[] = lojas.map((loja) => {
    const prim = primeira.get(loja.id) ?? null;
    const faltasPorCanal = contagemVazia();
    const diasDaLoja: DiaDaLojaNoMes[] = dias.map((data) => {
      const canais: Partial<Record<CanalVenda, GraoLido>> = {};
      for (const c of CANAIS_EM_ORDEM) {
        const g = doGrao.get(`${loja.id}|${data}|${c}`);
        if (g) canais[c] = g;
      }
      const lancados = new Set(Object.keys(canais) as CanalVenda[]);
      // Loja desativada não cobra lançamento: só mostra o que já tem.
      const faltam = loja.ativa ? canaisEmFalta(data, hoje, prim, loja.canais, lancados) : [];
      for (const c of faltam) faltasPorCanal[c]++;
      return { data, canais, total: lancados.size ? totalizar(Object.values(canais)) : null, faltam, emAberto: data === hoje, futuro: data > hoje };
    });
    const porCanal = porCanalVazio();
    for (const c of CANAIS_EM_ORDEM) porCanal[c] = totalizar(diasDaLoja.flatMap((d) => (d.canais[c] ? [d.canais[c]!] : [])));
    return {
      loja,
      primeiraData: prim,
      dias: diasDaLoja,
      porCanal,
      total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])),
      faltasPorCanal,
      faltas: faltasPorCanal.LOJA + faltasPorCanal.DELIVERY_PROPRIO + faltasPorCanal.IFOOD,
    };
  });

  const porCanal = porCanalVazio();
  for (const c of CANAIS_EM_ORDEM) porCanal[c] = totalizar(out.map((l) => l.porCanal[c]));
  return {
    mes: filtro.mes,
    hoje,
    dias,
    lojas: out,
    porCanal,
    total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])),
    faltas: out.reduce((s, l) => s + l.faltas, 0),
    temIntegracao: integradas > 0,
  };
}

// ================================================================ planilha

export type SituacaoNaPrevia = 'nova' | 'muda' | 'igual' | 'erro';

export interface LinhaDaPrevia {
  linha: number;
  situacao: SituacaoNaPrevia;
  lojaId?: string;
  lojaNome?: string;
  canal?: CanalVenda;
  data?: string;
  depois?: NumerosDoCanal;
  antes?: NumerosDoCanal;
  erro?: string;
}

export interface PreviaDoFaturamento {
  linhas: LinhaDaPrevia[];
  /** Erros do arquivo ou de linha que nem foi interpretada (campo longo, colunas a mais). */
  erros: ErroDeLinha[];
  linhasLidas: number;
  contagem: Record<SituacaoNaPrevia, number>;
  /** Impressão da prévia: a confirmação leva de volta e a importação recusa se o mundo mudou. */
  impressao: string;
}

interface PlanoDaLinha extends LinhaDaPrevia {
  idAtual?: string;
  versaoAtual?: Date;
}

/** Tamanho e nome do arquivo antes de ler (a action usa). */
export const LIMITES_DO_ARQUIVO = { bytes: LIMITE_DA_PLANILHA, segundos: LIMITES_DA_PLANILHA.segundos } as const;

async function planejarImportacao(tx: ClienteDoParceiro, alcance: Alcance, texto: string, hoje: string): Promise<{ planos: PlanoDaLinha[]; previa: PreviaDoFaturamento; lojas: Map<string, LojaDoFaturamento> }> {
  const leitura = lerPlanilhaDeFaturamento(texto);
  // Só as lojas em que a pessoa pode lançar; as outras são "não encontrada no seu acesso" (a mesma frase de inexistente).
  const lojas = (await lojasDoFaturamento(tx, alcance)).filter((l) => !semAcessoParaLancar(alcance, l.id));
  const paraPlanilha: LojaParaPlanilha[] = lojas.map((l) => ({ id: l.id, nome: l.nome, ativa: l.ativa, canais: l.canais }));
  const interpretadas = leitura.linhas.map((l) => ({ l, r: interpretarLinha(l, paraPlanilha, hoje) }));

  // Mesmo grão duas vezes no arquivo: erro nas duas (qual valeria?).
  const grao = (r: { lojaId: string; canal: CanalVenda; data: string }) => `${r.lojaId}|${r.canal}|${r.data}`;
  const linhasDoGrao = new Map<string, number[]>();
  for (const { l, r } of interpretadas) if (r.ok) linhasDoGrao.set(grao(r), [...(linhasDoGrao.get(grao(r)) ?? []), l.linha]);

  const boas = interpretadas.flatMap(({ r }) => (r.ok ? [r] : []));
  const fechadas = await datasEmPeriodoFechado(tx, Array.from(new Set(boas.map((b) => b.data))));
  const atuais = new Map<string, { id: string; atualizadoEm: Date } & NumerosDoCanal>();
  if (boas.length > 0) {
    const datas = boas.map((b) => b.data).sort();
    const linhas = await tx.faturamentoLancamento.findMany({
      where: { lojaId: { in: Array.from(new Set(boas.map((b) => b.lojaId))) }, data: { gte: dataDoBanco(datas[0]), lte: dataDoBanco(datas[datas.length - 1]) }, origem: { in: [...HUMANAS] } },
      select: { id: true, lojaId: true, canal: true, data: true, valorCentavos: true, pedidos: true, clientes: true, atualizadoEm: true },
    });
    for (const x of linhas) atuais.set(`${x.lojaId}|${x.canal}|${isoDoDia(x.data)}`, { id: x.id, atualizadoEm: x.atualizadoEm, valorCentavos: x.valorCentavos, pedidos: x.pedidos, clientes: x.clientes });
  }

  const planos: PlanoDaLinha[] = interpretadas.map(({ l, r }) => {
    if (!r.ok) return { linha: l.linha, situacao: 'erro', erro: r.erro };
    const base = { linha: l.linha, lojaId: r.lojaId, lojaNome: r.lojaNome, canal: r.canal, data: r.data, depois: { valorCentavos: r.valorCentavos, pedidos: r.pedidos, clientes: r.clientes } };
    const repetidas = linhasDoGrao.get(grao(r)) ?? [];
    if (repetidas.length > 1) {
      const outras = repetidas.filter((x) => x !== l.linha).join(', ');
      return { ...base, situacao: 'erro', erro: `Mesmo dia, loja e canal da linha ${outras}: deixe uma linha só.` };
    }
    const nomeFechado = fechadas.get(r.data);
    if (nomeFechado) return { ...base, situacao: 'erro', erro: fraseDoPeriodoFechado(nomeFechado) };
    const a = atuais.get(grao(r));
    if (!a) return { ...base, situacao: 'nova' };
    const antes = { valorCentavos: a.valorCentavos, pedidos: a.pedidos, clientes: a.clientes };
    if (mesmosNumeros(antes, base.depois)) return { ...base, situacao: 'igual', antes };
    return { ...base, situacao: 'muda', antes, idAtual: a.id, versaoAtual: a.atualizadoEm };
  });

  const contagem: Record<SituacaoNaPrevia, number> = { nova: 0, muda: 0, igual: 0, erro: leitura.erros.length };
  for (const p of planos) contagem[p.situacao]++;
  const linhasDaPrevia: LinhaDaPrevia[] = planos.map(({ idAtual: _a, versaoAtual: _v, ...p }) => p);
  const impressao = createHash('sha256')
    .update(JSON.stringify(planos.map((p) => [p.linha, p.situacao, p.lojaId, p.canal, p.data, p.depois, p.antes, p.erro])))
    .update(JSON.stringify(leitura.erros))
    .digest('hex')
    .slice(0, 32);
  return {
    planos,
    lojas: new Map(lojas.map((l) => [l.id, l])),
    previa: { linhas: linhasDaPrevia, erros: leitura.erros, linhasLidas: leitura.linhasLidas, contagem, impressao },
  };
}

/** Lê a planilha e diz, linha a linha, o que VAI acontecer (nova, vai mudar, igual, com erro). Não grava nada. */
export async function previaDaImportacao(cliente: ClienteDoParceiro, alcance: Alcance, texto: string, hoje = hojeNoRio()): Promise<PreviaDoFaturamento> {
  return cliente.transacao((tx) => planejarImportacao(tx, alcance, texto, hoje).then((p) => p.previa));
}

export type ResultadoDaImportacao =
  | { ok: true; criadas: number; alteradas: number; iguais: number; comErro: number }
  | { ok: false; erro: string; mudou?: boolean };

/**
 * Importa em UMA transação, só as linhas sem erro. Refaz a prévia lá dentro
 * (com a trava do faturamento) e, se a impressão não bate com a que a pessoa
 * viu, recusa tudo: o mundo mudou desde a prévia. Idempotente: reimportar a
 * mesma planilha é tudo "igual", zero gravação. `origem = IMPORTACAO`,
 * `origemRef = <arquivo>#<linha>`, motivo "Importado por planilha".
 */
export async function importarPlanilha(cliente: ClienteDoParceiro, alcance: Alcance, texto: string, impressaoVista: string, arquivo: string, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDaImportacao> {
  const nomeDoArquivo = arquivo.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 80) || 'planilha';
  try {
    return await cliente.transacao(
      async (tx) => {
        await travarParaEscreverFaturamento(tx);
        const { planos, previa, lojas } = await planejarImportacao(tx, alcance, texto, hoje);
        if (previa.impressao !== impressaoVista) {
          throw new Recusa(recusar('Os dados mudaram desde a prévia (alguém lançou ou fechou algo no meio). Veja a prévia de novo; nada foi gravado.', { conflito: true }));
        }
        const novas = planos.filter((p) => p.situacao === 'nova');
        const mudam = planos.filter((p) => p.situacao === 'muda');
        const retrato = (p: PlanoDaLinha, n: NumerosDoCanal, origem: OrigemDoLancamento) =>
          retratoDoLancamento({ lojaId: p.lojaId!, lojaNome: lojas.get(p.lojaId!)!.nome, canal: p.canal!, data: p.data!, origem, ...n });
        const motivo = 'Importado por planilha';
        const historico: Prisma.HistoricoAlteracaoCreateManyInput[] = [];

        for (let i = 0; i < novas.length; i += 500) {
          const lote = novas.slice(i, i + 500);
          const criadas = await tx.faturamentoLancamento.createManyAndReturn({
            data: lote.map((p) => ({
              parceiroId: tx.parceiroId,
              lojaId: p.lojaId!,
              canal: p.canal!,
              data: dataDoBanco(p.data!),
              ...p.depois!,
              origem: 'IMPORTACAO' as const,
              chaveIdempotencia: chaveHumana(p.lojaId!, p.canal!, p.data!),
              origemRef: `${nomeDoArquivo}#${p.linha}`,
              atualizadoPorNome: autorNome.slice(0, 120),
            })),
            skipDuplicates: true,
            select: { id: true, lojaId: true, canal: true, data: true },
          });
          if (criadas.length !== lote.length) throw new Recusa(recusar('Alguém lançou um destes dias agora há pouco. Veja a prévia de novo; nada foi gravado.', { conflito: true }));
          const idDe = new Map(criadas.map((c) => [`${c.lojaId}|${c.canal}|${isoDoDia(c.data)}`, c.id]));
          for (const p of lote) {
            historico.push({
              parceiroId: tx.parceiroId,
              entidade: 'FaturamentoLancamento',
              entidadeId: idDe.get(`${p.lojaId}|${p.canal}|${p.data}`)!,
              acao: 'CRIOU',
              depois: retrato(p, p.depois!, 'IMPORTACAO'),
              motivo,
              autorNome,
            });
          }
        }
        for (const p of mudam) {
          const r = await tx.faturamentoLancamento.updateMany({
            where: { id: p.idAtual!, atualizadoEm: p.versaoAtual! },
            data: { ...p.depois!, origem: 'IMPORTACAO', origemRef: `${nomeDoArquivo}#${p.linha}`, atualizadoPorNome: autorNome.slice(0, 120) },
          });
          if (r.count === 0) throw new Recusa(recusar('Alguém corrigiu um destes dias agora há pouco. Veja a prévia de novo; nada foi gravado.', { conflito: true }));
          const d = diferenca(retrato(p, p.antes!, 'MANUAL'), retrato(p, p.depois!, 'IMPORTACAO'));
          historico.push({ parceiroId: tx.parceiroId, entidade: 'FaturamentoLancamento', entidadeId: p.idAtual!, acao: 'ALTEROU', antes: d!.antes as Prisma.InputJsonObject, depois: d!.depois as Prisma.InputJsonObject, motivo, autorNome });
        }
        for (let i = 0; i < historico.length; i += 1000) await tx.historicoAlteracao.createMany({ data: historico.slice(i, i + 1000) });
        return { ok: true as const, criadas: novas.length, alteradas: mudam.length, iguais: previa.contagem.igual, comErro: previa.contagem.erro };
      },
      { timeout: LIMITES_DA_PLANILHA.segundos * 1000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, erro: e.resultado.erros.geral ?? 'Não foi possível importar.', mudou: e.resultado.conflito === true };
    if (checkVioladoDe(e)) return { ok: false, erro: 'Algum número passou do limite permitido. Veja a prévia de novo.' };
    throw e;
  }
}

// ================================================================ contrato de integração (SEM implementação)

/**
 * O contrato da integração futura (decisão 127) — só o formato, nada grava
 * aqui. Quando a integração do iFood (ou Anota AI, Saipos) existir, um
 * worker chama `doParceiro(parceiroId)` (o portão confere o parceiro ATIVO) e
 * grava com:
 *   origem = INTEGRACAO · chaveIdempotencia = chaveDeIntegracao(fonte, tipo, idExterno)
 *   · origemRef = idExterno · um UPSERT por chave (reenviar o mesmo pedido
 *   atualiza, nunca soma) · pedido só entra CONCLUÍDO; cancelado depois = a
 *   MESMA chave zerada.
 * Pega a MESMA trava compartilhada e respeita período fechado. A leitura
 * (`faturamentoDosGraos`) já faz a integração vencer a digitação.
 */
export interface EntradaDeIntegracao {
  fonte: string;
  tipo: 'pedido' | 'dia';
  idExterno: string;
  lojaId: string;
  canal: CanalVenda;
  data: string;
  valorCentavos: number;
  pedidos: number;
  clientes: number;
}
