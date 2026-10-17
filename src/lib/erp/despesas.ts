/**
 * Despesas manuais do DRE (2.2a) — regras com banco. Recebe sempre o cliente do
 * portão (o parceiro da sessão) e o `Alcance` da pessoa.
 *
 * Quem vê e quem lança (decisão 147):
 *  - VER (lista, detalhe): `dre.ver` OU `despesas.lancar` (o administrativo lança
 *    sem ver o resultado). Despesa de LOJA só nas lojas do alcance; despesa da
 *    REDE (loja nula) só para quem tem a rede inteira — a consulta de quem tem
 *    lojas filtra `lojaId IN alcance`, e nulo nunca entra;
 *  - LANÇAR, editar, remover, pagar: `despesas.lancar` na loja de ANTES e na de
 *    DEPOIS; a da rede, com a rede inteira. Loja desativada, linha oculta ou
 *    calculada não recebem despesa nova.
 *
 * Regras de gravação:
 *  - competência, não caixa: intervalo de dias (dia, mês, até 366 dias);
 *  - período FECHADO recusa criar, editar (a de antes e a de depois), remover; a
 *    escrita pega a trava COMPARTILHADA do período (`periodo-trava.ts`) e o fechamento
 *    da 2.2b pega a mesma, exclusiva. Pagar, vencimento e "não repete mais" não
 *    mudam o DRE e passam;
 *  - duplo envio: o formulário leva um `envio` aleatório (`chaveIdempotencia =
 *    manual:<envio>`); o segundo envio devolve a mesma despesa, "já lançada";
 *  - editar é condicional ao `atualizadoEm` lido (duas abas); remover exige motivo e
 *    deixa o antes no histórico; tudo grava antes/depois na MESMA transação;
 *  - recorrente (só mês inteiro): "Lançar as do mês passado" cria uma filha por
 *    despesa que repete, apontando a de origem (`repeteDeId`, único): a mesma não se
 *    lança duas vezes, nem em duas abas.
 */

import type { Prisma } from '@prisma/client';
import { hojeNoRio } from './compra-campos';
import { somarDias } from './contagem-campos';
import {
  apropriar,
  chaveDoEnvio,
  competenciaDoMes,
  diaNoMes,
  ENVIO_VALIDO,
  ehFiltroDeSituacao,
  lerDataDoPagamento,
  lerDespesa,
  lerValorDaDespesa,
  mesesDoIntervalo,
  retratoDaDespesa,
  situacaoDoPagamento,
  tipoDaCompetencia,
  DESPESAS_POR_PAGINA,
  LIMITES_DA_DESPESA,
  type Competencia,
  type ErrosDaDespesa,
  type FiltroDeSituacao,
  type SituacaoDoPagamento,
  type TextosDaDespesa,
} from './despesa-campos';
import { garantirPlano, resolverLinha } from './plano';
import { mesVizinho } from './faturamento-campos';
import { listarHistorico } from './historico';
import { diferenca } from './insumo-campos';
import { fraseDoPeriodoFechado, intervaloEmPeriodoFechado, travarParaEscrever } from './periodo-trava';
import { alcancaLoja, pode, recusa, type Alcance } from './permissoes';
import { checkVioladoDe, type ClienteDoParceiro } from './tenant';

export const MENSAGEM_DESPESA_NAO_ENCONTRADA = 'Despesa não encontrada no seu acesso.';
export const MENSAGEM_CONFLITO_DA_DESPESA = 'Alguém mudou esta despesa agora há pouco. Recarregue a página para ver a versão de agora; nada foi gravado.';
const SO_A_REDE = 'Só quem tem a rede inteira lança despesa da rede (a que não é de uma loja).';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);

// ================================================================ quem pode

/** Vê despesas: `dre.ver` ou `despesas.lancar`. */
export const podeVerDespesas = (alcance: Alcance) => pode(alcance, 'dre.ver') || pode(alcance, 'despesas.lancar');

/** O filtro de consulta: quem tem a rede inteira lê tudo (inclusive loja nula); quem tem lojas lê só `lojaId IN` elas. */
export const escopoDasDespesas = (alcance: Pick<Alcance, 'lojas'>): Prisma.DespesaWhereInput => (alcance.lojas === 'todas' ? {} : { lojaId: { in: [...alcance.lojas] } });

/** Frase da recusa de LANÇAR na loja (nula = a rede), ou null se pode. */
export function recusaDeLancar(alcance: Alcance, lojaId: string | null): string | null {
  if (lojaId === null) {
    if (alcance.lojas !== 'todas') return SO_A_REDE;
    return recusa(alcance, 'despesas.lancar');
  }
  return recusa(alcance, 'despesas.lancar', { lojaId });
}

// ================================================================ formas de resposta

export type ResultadoDaDespesa =
  | { ok: true; id: string; jaLancada: boolean; mudou: boolean }
  | { ok: false; erros: ErrosDaDespesa; conflito?: boolean; naoEncontrado?: boolean };

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoDaDespesa, { ok: false }>) {
    super('recusa');
  }
}
const recusar = (geral: string, extra: Partial<Extract<ResultadoDaDespesa, { ok: false }>> = {}): Extract<ResultadoDaDespesa, { ok: false }> => ({ ok: false, erros: { geral }, ...extra });
const naoAchou = () => recusar(MENSAGEM_DESPESA_NAO_ENCONTRADA, { naoEncontrado: true });

// ================================================================ lojas para o formulário

export interface LojaParaDespesa {
  id: string;
  nome: string;
  ativa: boolean;
}

/** As lojas em que a pessoa pode lançar despesa (as ativas do alcance) e se pode lançar da rede. */
export async function lojasParaDespesa(cliente: ClienteDoParceiro, alcance: Alcance): Promise<{ lojas: LojaParaDespesa[]; podeRede: boolean }> {
  const lojas = await cliente.loja.findMany({
    where: alcance.lojas === 'todas' ? { ativa: true } : { ativa: true, id: { in: [...alcance.lojas] } },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, ativa: true },
  });
  return { lojas, podeRede: alcance.lojas === 'todas' && pode(alcance, 'despesas.lancar') };
}

// ================================================================ ler

export interface DespesaLida {
  id: string;
  lojaId: string | null;
  lojaNome: string | null;
  linhaId: string;
  linhaNome: string;
  linhaChave: string;
  linhaOculta: boolean;
  descricao: string;
  valorCentavos: number;
  competencia: Competencia;
  recorrente: boolean;
  repeteDeId: string | null;
  vencimento: string | null;
  pagaEm: string | null;
  atualizadoPorNome: string;
  /** O `atualizadoEm` lido: a edição confere. */
  versao: string;
  atualizadoEm: Date;
  criadoEm: Date;
}

const INCLUIR = {
  loja: { select: { nome: true } },
  linha: { select: { nome: true, codigo: true, ativa: true } },
} as const;

type DoBanco = Prisma.DespesaGetPayload<{ include: typeof INCLUIR }>;

function lida(d: DoBanco): DespesaLida {
  return {
    id: d.id,
    lojaId: d.lojaId,
    lojaNome: d.loja?.nome ?? null,
    linhaId: d.linhaId,
    linhaNome: d.linha.nome,
    linhaChave: d.linha.codigo ?? `id:${d.linhaId}`,
    linhaOculta: !d.linha.ativa,
    descricao: d.descricao,
    valorCentavos: d.valorCentavos,
    competencia: { inicio: iso(d.competencia), fim: iso(d.competenciaFim ?? d.competencia) },
    recorrente: d.recorrente,
    repeteDeId: d.repeteDeId,
    vencimento: d.vencimento ? iso(d.vencimento) : null,
    pagaEm: d.pagaEm ? iso(d.pagaEm) : null,
    atualizadoPorNome: d.atualizadoPorNome,
    versao: d.atualizadoEm.toISOString(),
    atualizadoEm: d.atualizadoEm,
    criadoEm: d.criadoEm,
  };
}

const paraHistorico = (d: DespesaLida) =>
  retratoDaDespesa({ linhaNome: d.linhaNome, lojaNome: d.lojaNome, descricao: d.descricao, valorCentavos: d.valorCentavos, competencia: d.competencia, recorrente: d.recorrente, vencimento: d.vencimento, pagaEm: d.pagaEm });

export interface FiltroDeDespesas {
  /** "aaaa-mm": a competência cruza o mês. Ignorado em "a pagar". */
  mes?: string;
  situacao: FiltroDeSituacao;
  lojaId?: string;
  pagina: number;
}

export interface ItemDaLista extends DespesaLida {
  pagamento: SituacaoDoPagamento;
}

/** A lista de despesas que a pessoa pode ver, com o filtro. Sem permissão de ver, vazia. */
export async function listarDespesas(cliente: ClienteDoParceiro, alcance: Alcance, filtro: FiltroDeDespesas, hoje = hojeNoRio()) {
  const vazia = { itens: [] as ItemDaLista[], total: 0, pagina: 1, porPagina: DESPESAS_POR_PAGINA, aPagar: { vencidas: 0, venceLogo: 0, total: 0, totalCentavos: 0 } };
  if (!podeVerDespesas(alcance)) return vazia;
  const situacao = ehFiltroDeSituacao(filtro.situacao) ? filtro.situacao : 'todas';
  const escopoDaLoja: Prisma.DespesaWhereInput = filtro.lojaId ? (alcancaLoja(alcance, filtro.lojaId) ? { lojaId: filtro.lojaId } : { id: '' }) : {};
  const base: Prisma.DespesaWhereInput = { AND: [escopoDasDespesas(alcance), escopoDaLoja] };
  const deMes: Prisma.DespesaWhereInput[] = [];
  if (filtro.mes && situacao !== 'a-pagar') {
    const c = competenciaDoMes(filtro.mes);
    deMes.push({ competencia: { lte: dataDoBanco(c.fim) } }, { OR: [{ competenciaFim: { gte: dataDoBanco(c.inicio) } }, { competenciaFim: null, competencia: { gte: dataDoBanco(c.inicio) } }] });
  }
  const onde: Prisma.DespesaWhereInput = {
    AND: [
      base,
      ...deMes,
      ...(situacao === 'a-pagar' ? [{ pagaEm: null, vencimento: { not: null } }] : situacao === 'pagas' ? [{ pagaEm: { not: null } }] : []),
    ],
  };
  const pagina = Math.max(1, Math.trunc(filtro.pagina) || 1);
  const [total, linhas, aberto] = await Promise.all([
    cliente.despesa.count({ where: onde }),
    cliente.despesa.findMany({
      where: onde,
      include: INCLUIR,
      orderBy: situacao === 'a-pagar' ? [{ vencimento: 'asc' }, { id: 'asc' }] : [{ competencia: 'desc' }, { criadoEm: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * DESPESAS_POR_PAGINA,
      take: DESPESAS_POR_PAGINA,
    }),
    cliente.despesa.findMany({ where: { AND: [base, { pagaEm: null, vencimento: { not: null } }] }, select: { vencimento: true, valorCentavos: true } }),
  ]);
  const limite = somarDias(hoje, 7);
  const aPagar = { vencidas: 0, venceLogo: 0, total: aberto.length, totalCentavos: 0 };
  for (const a of aberto) {
    const v = iso(a.vencimento!);
    aPagar.totalCentavos += a.valorCentavos;
    if (v < hoje) aPagar.vencidas++;
    else if (v <= limite) aPagar.venceLogo++;
  }
  const itens = linhas.map((d) => {
    const l = lida(d);
    return { ...l, pagamento: situacaoDoPagamento(l, hoje) };
  });
  return { itens, total, pagina, porPagina: DESPESAS_POR_PAGINA, aPagar };
}

/** Uma despesa, com a que ela repete, a que a repetiu e as últimas alterações. Fora do alcance, inexistente ou de outro parceiro: null (404). */
export async function obterDespesa(cliente: ClienteDoParceiro, alcance: Alcance, id: string, hoje = hojeNoRio()) {
  if (!podeVerDespesas(alcance) || typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  return cliente.transacao(async (tx) => {
    const d = await tx.despesa.findFirst({ where: { AND: [{ id }, escopoDasDespesas(alcance)] }, include: INCLUIR });
    if (!d) return null;
    const l = lida(d);
    const [origem, filha, historico] = await Promise.all([
      l.repeteDeId ? tx.despesa.findFirst({ where: { AND: [{ id: l.repeteDeId }, escopoDasDespesas(alcance)] }, select: { id: true, descricao: true, competencia: true, competenciaFim: true } }) : null,
      tx.despesa.findFirst({ where: { AND: [{ repeteDeId: l.id }, escopoDasDespesas(alcance)] }, select: { id: true, descricao: true, competencia: true, competenciaFim: true } }),
      listarHistorico(tx, { de: [{ entidade: 'Despesa', ids: [l.id] }], verPrecos: false, verDre: true, limite: 15 }),
    ]);
    const comp = (x: { competencia: Date; competenciaFim: Date | null }) => ({ inicio: iso(x.competencia), fim: iso(x.competenciaFim ?? x.competencia) });
    const fechado = await intervaloEmPeriodoFechado(tx, l.competencia.inicio, l.competencia.fim);
    return {
      despesa: l,
      pagamento: situacaoDoPagamento(l, hoje),
      tipo: tipoDaCompetencia(l.competencia),
      origem: origem ? { id: origem.id, descricao: origem.descricao, competencia: comp(origem) } : null,
      filha: filha ? { id: filha.id, descricao: filha.descricao, competencia: comp(filha) } : null,
      fechado,
      historico,
    };
  });
}

export type DespesaCompleta = NonNullable<Awaited<ReturnType<typeof obterDespesa>>>;

// ================================================================ lançar

async function conferirLoja(tx: ClienteDoParceiro, alcance: Alcance, lojaId: string | null, ativaObrigatoria: boolean): Promise<{ id: string; nome: string } | null> {
  if (lojaId === null) return null;
  const l = await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true, ativa: true } });
  if (!l || !alcancaLoja(alcance, l.id)) throw new Recusa(recusar('Loja não encontrada no seu acesso.', { naoEncontrado: true }));
  if (ativaObrigatoria && !l.ativa) throw new Recusa(recusar(`A loja ${l.nome} está desativada: não recebe despesa nova.`));
  return l;
}

async function conferirLinha(tx: ClienteDoParceiro, chave: string, ocultaPode = false) {
  const l = await resolverLinha(tx, chave);
  if (!l) throw new Recusa({ ok: false, erros: { linha: 'Escolha uma linha do DRE da lista.' } });
  if (l.calculada) throw new Recusa({ ok: false, erros: { linha: `“${l.nome}” é calculada pelo sistema: não recebe despesa.` } });
  if (!l.ativa && !ocultaPode) throw new Recusa({ ok: false, erros: { linha: `“${l.nome}” está oculta: reexiba a linha no plano de contas, ou escolha outra.` } });
  return l;
}

/** Cria a despesa. O segundo envio do mesmo formulário devolve a mesma, `jaLancada`. */
export async function lancarDespesa(cliente: ClienteDoParceiro, alcance: Alcance, textos: TextosDaDespesa, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDaDespesa> {
  const lida1 = lerDespesa(textos, hoje);
  if (!lida1.ok) return { ok: false, erros: lida1.erros };
  const d = lida1.despesa;
  const negado = recusaDeLancar(alcance, d.lojaId);
  if (negado) return recusar(negado, { naoEncontrado: d.lojaId !== null && !alcancaLoja(alcance, d.lojaId) });
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDaDespesa> => {
      await travarParaEscrever(tx);
      const loja = await conferirLoja(tx, alcance, d.lojaId, true);
      await garantirPlano(tx);
      const linha = await conferirLinha(tx, d.linha);
      const fechado = await intervaloEmPeriodoFechado(tx, d.competencia.inicio, d.competencia.fim);
      if (fechado) throw new Recusa({ ok: false, erros: { competencia: fraseDoPeriodoFechado(fechado) } });
      const chave = chaveDoEnvio(d.envio);
      const criadas = await tx.despesa.createManyAndReturn({
        data: [
          {
            parceiroId: tx.parceiroId,
            lojaId: d.lojaId,
            linhaId: linha.id,
            descricao: d.descricao,
            competencia: dataDoBanco(d.competencia.inicio),
            competenciaFim: dataDoBanco(d.competencia.fim),
            valorCentavos: d.valorCentavos,
            origem: 'MANUAL',
            chaveIdempotencia: chave,
            recorrente: d.recorrente,
            vencimento: d.vencimento ? dataDoBanco(d.vencimento) : null,
            atualizadoPorNome: autorNome.slice(0, 120),
          },
        ],
        skipDuplicates: true,
        select: { id: true },
      });
      if (criadas.length === 0) {
        const ja = await tx.despesa.findFirst({ where: { chaveIdempotencia: chave }, select: { id: true } });
        if (!ja) throw new Recusa(recusar('Não foi possível lançar agora. Tente de novo.'));
        return { ok: true, id: ja.id, jaLancada: true, mudou: false };
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Despesa',
          entidadeId: criadas[0].id,
          acao: 'CRIOU',
          depois: retratoDaDespesa({ linhaNome: linha.nome, lojaNome: loja?.nome ?? null, descricao: d.descricao, valorCentavos: d.valorCentavos, competencia: d.competencia, recorrente: d.recorrente, vencimento: d.vencimento, pagaEm: null }),
          autorNome,
        },
      });
      return { ok: true, id: criadas[0].id, jaLancada: false, mudou: true };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (checkVioladoDe(e)) return recusar('Algum número passou do limite permitido. Confira os valores e salve de novo.');
    throw e;
  }
}

// ================================================================ editar

export interface EntradaDaEdicao extends Omit<TextosDaDespesa, 'envio'> {
  /** O `atualizadoEm` que a tela leu. */
  versao: string;
}

/**
 * Edita. Condicional ao `atualizadoEm` lido. O que muda o DRE (valor, competência, linha, loja)
 * recusa se a competência de ANTES ou a de DEPOIS cruza período fechado; o que não muda (vencimento,
 * descrição, repetir todo mês) passa.
 */
export async function editarDespesa(cliente: ClienteDoParceiro, alcance: Alcance, id: string, entrada: EntradaDaEdicao, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDaDespesa> {
  if (!podeVerDespesas(alcance)) return naoAchou();
  const nova = lerDespesa({ ...entrada, envio: '' }, hoje, { exigeEnvio: false });
  if (!nova.ok) return { ok: false, erros: nova.erros };
  const d = nova.despesa;
  const negadoDepois = recusaDeLancar(alcance, d.lojaId);
  if (negadoDepois) return recusar(negadoDepois, { naoEncontrado: d.lojaId !== null && !alcancaLoja(alcance, d.lojaId) });
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDaDespesa> => {
      await travarParaEscrever(tx);
      const antes = await tx.despesa.findFirst({ where: { AND: [{ id }, escopoDasDespesas(alcance)] }, include: INCLUIR });
      if (!antes) throw new Recusa(naoAchou());
      const a = lida(antes);
      const negadoAntes = recusaDeLancar(alcance, a.lojaId);
      if (negadoAntes) throw new Recusa(recusar(negadoAntes));
      if (entrada.versao !== a.versao) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      const loja = await conferirLoja(tx, alcance, d.lojaId, d.lojaId !== a.lojaId);
      const linha = await conferirLinha(tx, d.linha, d.linha === a.linhaChave);
      const mudaODre =
        d.valorCentavos !== a.valorCentavos ||
        d.competencia.inicio !== a.competencia.inicio ||
        d.competencia.fim !== a.competencia.fim ||
        linha.id !== a.linhaId ||
        d.lojaId !== a.lojaId;
      if (mudaODre) {
        const fechadoAntes = await intervaloEmPeriodoFechado(tx, a.competencia.inicio, a.competencia.fim);
        if (fechadoAntes) throw new Recusa(recusar(fraseDoPeriodoFechado(fechadoAntes)));
        const fechadoDepois = await intervaloEmPeriodoFechado(tx, d.competencia.inicio, d.competencia.fim);
        if (fechadoDepois) throw new Recusa({ ok: false, erros: { competencia: fraseDoPeriodoFechado(fechadoDepois) } });
      }
      const depois = { linhaNome: linha.nome, lojaNome: loja?.nome ?? null, descricao: d.descricao, valorCentavos: d.valorCentavos, competencia: d.competencia, recorrente: d.recorrente, vencimento: d.vencimento, pagaEm: a.pagaEm };
      const dif = diferenca(paraHistorico(a), retratoDaDespesa(depois));
      if (!dif) return { ok: true, id, jaLancada: false, mudou: false };
      const u = await tx.despesa.updateMany({
        where: { id, atualizadoEm: antes.atualizadoEm },
        data: {
          lojaId: d.lojaId,
          linhaId: linha.id,
          descricao: d.descricao,
          competencia: dataDoBanco(d.competencia.inicio),
          competenciaFim: dataDoBanco(d.competencia.fim),
          valorCentavos: d.valorCentavos,
          recorrente: d.recorrente,
          vencimento: d.vencimento ? dataDoBanco(d.vencimento) : null,
          atualizadoPorNome: autorNome.slice(0, 120),
        },
      });
      if (u.count === 0) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'Despesa', entidadeId: id, acao: 'ALTEROU', antes: dif.antes, depois: dif.depois, autorNome } });
      return { ok: true, id, jaLancada: false, mudou: true };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (checkVioladoDe(e)) return recusar('Algum número passou do limite permitido. Confira os valores e salve de novo.');
    throw e;
  }
}

// ================================================================ remover

/** Remove (lançou errado). Motivo de 3 a 200 letras; o antes fica no histórico. Período fechado recusa. */
export async function removerDespesa(cliente: ClienteDoParceiro, alcance: Alcance, id: string, entrada: { motivo: unknown; versao: string }, autorNome: string): Promise<ResultadoDaDespesa> {
  if (!podeVerDespesas(alcance)) return naoAchou();
  const motivo = typeof entrada.motivo === 'string' ? entrada.motivo.trim().replace(/\s+/g, ' ').slice(0, LIMITES_DA_DESPESA.motivo) : '';
  if (motivo.length < 3) return { ok: false, erros: { geral: 'Diga o motivo da remoção (de 3 a 200 letras).' } };
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDaDespesa> => {
      await travarParaEscrever(tx);
      const antes = await tx.despesa.findFirst({ where: { AND: [{ id }, escopoDasDespesas(alcance)] }, include: INCLUIR });
      if (!antes) throw new Recusa(naoAchou());
      const a = lida(antes);
      const negado = recusaDeLancar(alcance, a.lojaId);
      if (negado) throw new Recusa(recusar(negado));
      if (entrada.versao !== a.versao) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      const fechado = await intervaloEmPeriodoFechado(tx, a.competencia.inicio, a.competencia.fim);
      if (fechado) throw new Recusa(recusar(fraseDoPeriodoFechado(fechado)));
      const filha = await tx.despesa.findFirst({ where: { repeteDeId: id }, select: { id: true } });
      if (filha) throw new Recusa(recusar('Esta despesa já foi repetida no mês seguinte. Remova primeiro a do mês seguinte, ou desmarque “repete todo mês” na outra.'));
      const r = await tx.despesa.deleteMany({ where: { id, atualizadoEm: antes.atualizadoEm } });
      if (r.count === 0) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'Despesa', entidadeId: id, acao: 'EXCLUIU', antes: paraHistorico(a), motivo, autorNome } });
      return { ok: true, id, jaLancada: false, mudou: true };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

// ================================================================ pagar e "não repete mais" (não mudam o DRE)

async function mudancaSemDre(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  id: string,
  versao: string,
  autorNome: string,
  aplicar: (a: DespesaLida) => { data: Prisma.DespesaUncheckedUpdateManyInput; depois: Partial<{ pagaEm: string | null; recorrente: boolean }> } | { erro: string },
): Promise<ResultadoDaDespesa> {
  if (!podeVerDespesas(alcance)) return naoAchou();
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDaDespesa> => {
      // Pega a trava compartilhada como toda escrita; NÃO confere período fechado: isto não muda o DRE.
      await travarParaEscrever(tx);
      const antes = await tx.despesa.findFirst({ where: { AND: [{ id }, escopoDasDespesas(alcance)] }, include: INCLUIR });
      if (!antes) throw new Recusa(naoAchou());
      const a = lida(antes);
      const negado = recusaDeLancar(alcance, a.lojaId);
      if (negado) throw new Recusa(recusar(negado));
      if (versao !== a.versao) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      const r = aplicar(a);
      if ('erro' in r) throw new Recusa(recusar(r.erro));
      const depoisRet = retratoDaDespesa({
        linhaNome: a.linhaNome,
        lojaNome: a.lojaNome,
        descricao: a.descricao,
        valorCentavos: a.valorCentavos,
        competencia: a.competencia,
        recorrente: r.depois.recorrente ?? a.recorrente,
        vencimento: a.vencimento,
        pagaEm: r.depois.pagaEm === undefined ? a.pagaEm : r.depois.pagaEm,
      });
      const dif = diferenca(paraHistorico(a), depoisRet);
      if (!dif) return { ok: true, id, jaLancada: false, mudou: false };
      const u = await tx.despesa.updateMany({ where: { id, atualizadoEm: antes.atualizadoEm }, data: { ...r.data, atualizadoPorNome: autorNome.slice(0, 120) } });
      if (u.count === 0) throw new Recusa(recusar(MENSAGEM_CONFLITO_DA_DESPESA, { conflito: true }));
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'Despesa', entidadeId: id, acao: 'ALTEROU', antes: dif.antes, depois: dif.depois, autorNome } });
      return { ok: true, id, jaLancada: false, mudou: true };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

/** Marca como paga (data do pagamento, padrão hoje). Vale em período fechado: pagar não muda o DRE. */
export function pagarDespesa(cliente: ClienteDoParceiro, alcance: Alcance, id: string, entrada: { data: string; versao: string }, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDaDespesa> {
  const data = lerDataDoPagamento(entrada.data ?? '', hoje);
  if (!data.ok) return Promise.resolve({ ok: false, erros: { geral: data.erro } });
  return mudancaSemDre(cliente, alcance, id, entrada.versao, autorNome, () => ({ data: { pagaEm: dataDoBanco(data.data) }, depois: { pagaEm: data.data } }));
}

/** Desfaz o pagamento (marcou paga por engano). */
export function desfazerPagamento(cliente: ClienteDoParceiro, alcance: Alcance, id: string, versao: string, autorNome: string): Promise<ResultadoDaDespesa> {
  return mudancaSemDre(cliente, alcance, id, versao, autorNome, () => ({ data: { pagaEm: null }, depois: { pagaEm: null } }));
}

/** "Não repete mais": a despesa deixa de entrar em “Lançar as do mês passado” (o histórico fica). */
export function pararDeRepetir(cliente: ClienteDoParceiro, alcance: Alcance, id: string, versao: string, autorNome: string): Promise<ResultadoDaDespesa> {
  return mudancaSemDre(cliente, alcance, id, versao, autorNome, () => ({ data: { recorrente: false }, depois: { recorrente: false } }));
}

// ================================================================ as que repetem todo mês

export interface RecorrenteEmFalta {
  origemId: string;
  /** O mês em que a filha falta ("aaaa-mm"). */
  mesAlvo: string;
  descricao: string;
  linhaNome: string;
  lojaId: string | null;
  lojaNome: string | null;
  linhaOculta: boolean;
  /** O valor do mês anterior: ponto de partida, editável (a luz varia). */
  valorCentavos: number;
  vencimento: string | null;
}

/**
 * As despesas que repetem todo mês, com competência no mês anterior a `mesAlvo`, que ainda não
 * têm filha. É a lista de "Lançar as do mês passado" e o "falta lançar" do DRE: nunca inventa valor.
 */
export async function recorrentesEmFalta(tx: ClienteDoParceiro, alcance: Alcance, mesAlvo: string): Promise<RecorrenteEmFalta[]> {
  if (!podeVerDespesas(alcance)) return [];
  const mesAnterior = competenciaDoMes(mesVizinho(mesAlvo, -1));
  const candidatas = await tx.despesa.findMany({
    where: { AND: [escopoDasDespesas(alcance), { recorrente: true, competencia: dataDoBanco(mesAnterior.inicio), competenciaFim: dataDoBanco(mesAnterior.fim) }] },
    include: INCLUIR,
    orderBy: [{ linha: { ordem: 'asc' } }, { descricao: 'asc' }],
  });
  if (candidatas.length === 0) return [];
  const comFilha = new Set((await tx.despesa.findMany({ where: { repeteDeId: { in: candidatas.map((c) => c.id) } }, select: { repeteDeId: true } })).map((f) => f.repeteDeId));
  return candidatas
    .filter((c) => !comFilha.has(c.id))
    .map((c) => ({
      origemId: c.id,
      mesAlvo,
      descricao: c.descricao,
      linhaNome: c.linha.nome,
      lojaId: c.lojaId,
      lojaNome: c.loja?.nome ?? null,
      linhaOculta: !c.linha.ativa,
      valorCentavos: c.valorCentavos,
      vencimento: c.vencimento ? iso(c.vencimento) : null,
    }));
}

/** O que falta lançar nos meses que o recorte [de, ate] toca, até o mês de hoje (mês futuro não cobra). */
export async function faltaLancar(tx: ClienteDoParceiro, alcance: Alcance, de: string, ate: string, hoje = hojeNoRio()): Promise<RecorrenteEmFalta[]> {
  const ateMes = ate.slice(0, 7) < hoje.slice(0, 7) ? ate.slice(0, 7) : hoje.slice(0, 7);
  const out: RecorrenteEmFalta[] = [];
  for (const m of mesesDoIntervalo(de, `${ateMes}-01`)) out.push(...(await recorrentesEmFalta(tx, alcance, m)));
  return out;
}

export interface EntradaDoMesPassado {
  envio: string;
  /** "aaaa-mm", o mês que se está lançando. */
  mes: string;
  itens: { origemId: string; valor: string }[];
}

export type ResultadoDoMesPassado =
  | { ok: true; criadas: number; jaLancadas: number }
  | { ok: false; erro: string; porItem?: Record<string, string>; conflito?: boolean };

/**
 * "Lançar as do mês passado": uma filha por despesa marcada, com o valor digitado (a luz varia).
 * Tudo ou nada nos erros de leitura; a que já tem filha (outra aba, duplo clique) conta como "já
 * lançada" e não duplica (a chave do envio e `repeteDeId` são únicos).
 */
export async function lancarDoMesPassado(cliente: ClienteDoParceiro, alcance: Alcance, entrada: EntradaDoMesPassado, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDoMesPassado> {
  if (!podeVerDespesas(alcance)) return { ok: false, erro: 'Seu acesso não inclui lançar despesas.' };
  if (!ENVIO_VALIDO.test(String(entrada.envio ?? ''))) return { ok: false, erro: 'O formulário venceu. Abra “Lançar as do mês passado” de novo; nada foi gravado.' };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(entrada.mes ?? ''))) return { ok: false, erro: 'Mês inválido.' };
  if (entrada.mes > hoje.slice(0, 7) || entrada.mes < `${Number(hoje.slice(0, 4)) - 3}${hoje.slice(4, 7)}`) return { ok: false, erro: 'Escolha um mês entre os últimos três anos e o mês de agora.' };
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) return { ok: false, erro: 'Marque pelo menos uma despesa para lançar.' };
  if (entrada.itens.length > 200) return { ok: false, erro: 'Lance no máximo 200 despesas de uma vez.' };
  const porItem: Record<string, string> = {};
  const valores = new Map<string, number>();
  for (const it of entrada.itens) {
    const origemId = String(it.origemId ?? '');
    if (valores.has(origemId)) {
      porItem[origemId] = 'Despesa repetida na lista.';
      continue;
    }
    const v = lerValorDaDespesa(String(it.valor ?? ''));
    if (v.ok) valores.set(origemId, v.centavos);
    else porItem[origemId] = v.erro;
  }
  if (Object.keys(porItem).length > 0) return { ok: false, erro: 'Confira os valores marcados.', porItem };
  const alvo = competenciaDoMes(entrada.mes);
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDoMesPassado> => {
      await travarParaEscrever(tx);
      const fechado = await intervaloEmPeriodoFechado(tx, alvo.inicio, alvo.fim);
      if (fechado) return { ok: false, erro: fraseDoPeriodoFechado(fechado) };
      const faltando = await recorrentesEmFalta(tx, alcance, entrada.mes);
      const porId = new Map(faltando.map((f) => [f.origemId, f]));
      // Quem já tem filha (outra aba) sai da lista de "em falta": conta como já lançada, sem erro.
      const todasAsOrigens = await tx.despesa.findMany({ where: { AND: [{ id: { in: [...valores.keys()] } }, escopoDasDespesas(alcance)] }, include: INCLUIR });
      let criadas = 0;
      let jaLancadas = 0;
      const erros: Record<string, string> = {};
      const historico: Prisma.HistoricoAlteracaoCreateManyInput[] = [];
      for (const [origemId, valor] of valores) {
        const o = todasAsOrigens.find((x) => x.id === origemId);
        if (!o || !o.recorrente) {
          erros[origemId] = MENSAGEM_DESPESA_NAO_ENCONTRADA;
          continue;
        }
        const negado = recusaDeLancar(alcance, o.lojaId);
        if (negado) {
          erros[origemId] = negado;
          continue;
        }
        const f = porId.get(origemId);
        if (!f) {
          // Não está em falta: ou já tem filha, ou não é do mês anterior ao escolhido.
          const filha = await tx.despesa.findFirst({ where: { repeteDeId: origemId }, select: { id: true } });
          if (filha) jaLancadas++;
          else erros[origemId] = 'Esta despesa não é do mês anterior ao que você está lançando.';
          continue;
        }
        if (o.lojaId !== null) await conferirLoja(tx, alcance, o.lojaId, true);
        if (!o.linha.ativa) {
          erros[origemId] = `A linha “${o.linha.nome}” está oculta: reexiba no plano de contas, ou lance esta despesa à mão.`;
          continue;
        }
        const venc = o.vencimento ? diaNoMes(entrada.mes, Number(iso(o.vencimento).slice(8, 10))) : null;
        const nova = await tx.despesa.createManyAndReturn({
          data: [
            {
              parceiroId: tx.parceiroId,
              lojaId: o.lojaId,
              linhaId: o.linhaId,
              descricao: o.descricao,
              competencia: dataDoBanco(alvo.inicio),
              competenciaFim: dataDoBanco(alvo.fim),
              valorCentavos: valor,
              origem: 'MANUAL',
              chaveIdempotencia: chaveDoEnvio(entrada.envio, origemId),
              recorrente: true,
              repeteDeId: origemId,
              vencimento: venc ? dataDoBanco(venc) : null,
              atualizadoPorNome: autorNome.slice(0, 120),
            },
          ],
          skipDuplicates: true,
          select: { id: true },
        });
        if (nova.length === 0) {
          jaLancadas++;
          continue;
        }
        criadas++;
        historico.push({
          parceiroId: tx.parceiroId,
          entidade: 'Despesa',
          entidadeId: nova[0].id,
          acao: 'CRIOU',
          depois: retratoDaDespesa({ linhaNome: o.linha.nome, lojaNome: o.loja?.nome ?? null, descricao: o.descricao, valorCentavos: valor, competencia: alvo, recorrente: true, vencimento: venc, pagaEm: null }),
          motivo: 'Lançada do mês passado',
          autorNome,
        });
      }
      if (Object.keys(erros).length > 0) throw new ErroDeItens(erros);
      if (historico.length) await tx.historicoAlteracao.createMany({ data: historico });
      return { ok: true, criadas, jaLancadas };
    });
  } catch (e) {
    if (e instanceof ErroDeItens) return { ok: false, erro: 'Alguma despesa não pôde ser lançada; nada foi gravado.', porItem: e.porItem };
    if (e instanceof Recusa) return { ok: false, erro: Object.values(e.resultado.erros)[0] ?? 'Não foi possível lançar.' };
    if (checkVioladoDe(e)) return { ok: false, erro: 'Algum número passou do limite permitido. Confira os valores.' };
    throw e;
  }
}

class ErroDeItens extends Error {
  constructor(readonly porItem: Record<string, string>) {
    super('itens');
  }
}

// ================================================================ o que o DRE lê

/** Uma despesa já apropriada ao recorte [de, ate], para o DRE somar por linha e loja. */
export interface DespesaApropriadaLida {
  linhaId: string;
  lojaId: string | null;
  centavos: number;
}

/**
 * As despesas do escopo que cruzam o recorte, com a parte que cai nele (apropriação dia a dia ao
 * centavo). `lojaId` filtra uma loja (sem despesa da rede); sem ele, o alcance inteiro (a rede
 * inclui as despesas sem loja, só para quem tem a rede inteira).
 */
export async function despesasApropriadas(cliente: ClienteDoParceiro, alcance: Alcance, recorte: { de: string; ate: string }, lojaId?: string): Promise<DespesaApropriadaLida[]> {
  if (recorte.ate < recorte.de || !podeVerDespesas(alcance)) return [];
  const escopo: Prisma.DespesaWhereInput = lojaId !== undefined ? (alcancaLoja(alcance, lojaId) ? { lojaId } : { id: '' }) : escopoDasDespesas(alcance);
  const linhas = await cliente.despesa.findMany({
    where: {
      AND: [
        escopo,
        { competencia: { lte: dataDoBanco(recorte.ate) } },
        { OR: [{ competenciaFim: { gte: dataDoBanco(recorte.de) } }, { competenciaFim: null, competencia: { gte: dataDoBanco(recorte.de) } }] },
      ],
    },
    select: { linhaId: true, lojaId: true, valorCentavos: true, competencia: true, competenciaFim: true },
  });
  return linhas
    .map((d) => ({ linhaId: d.linhaId, lojaId: d.lojaId, centavos: apropriar(d.valorCentavos, { inicio: iso(d.competencia), fim: iso(d.competenciaFim ?? d.competencia) }, recorte) }))
    .filter((d) => d.centavos !== 0);
}

