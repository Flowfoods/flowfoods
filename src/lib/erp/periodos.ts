/**
 * Período de apuração (2.2a, decisão 144) — a leitura ÚNICA e a regra, com banco.
 * A contagem do estoque (1.7), as divergências (1.8) e o DRE (2.2) pedem o
 * período por aqui e nunca o calculam por conta própria: o fechamento de estoque
 * só vira CMV se as duas contas usam as mesmas datas.
 *
 *  - `periodoDe`: o período que contém uma data (registrado, ou o natural da
 *    regra vigente, cortado — ver `periodo-campos.ts`);
 *  - `registrarPeriodo`: o único caminho para criar `PeriodoApuracao`, sob a
 *    trava exclusiva dos períodos e recusando o que cruzaria outro (o gatilho do
 *    banco é o cinto);
 *  - `salvarRegra`: mudar a regra NÃO é retroativo; vale do dia seguinte ao fim
 *    do período atual; regra futura pendente é substituída; histórico na mesma
 *    transação. Só `metas.editar` (rede inteira) e o nível 1.
 */

import { hojeNoRio, formatarData } from './compra-campos';
import { somarDias } from './contagem-campos';
import { listarHistorico } from './historico';
import {
  ehTipoDeRegra,
  fraseDaRegra,
  lerRegraDigitada,
  mesmaRegra,
  periodoNaData,
  periodosRecentes,
  REGRA_PADRAO,
  vigenciaDaMudanca,
  type ErrosDaRegra,
  type Periodo,
  type Regra,
  type TipoDePeriodo,
} from './periodo-campos';
import { travarParaEscrever, travarPeriodos } from './periodo-trava';
import { recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);

export interface RegraGravada extends Regra {
  id: string;
  criadoPorNome: string;
  criadoEm: Date;
}

export interface PeriodoRegistrado extends Periodo {
  id: string;
  status: 'ABERTO' | 'FECHADO';
}

/** As regras gravadas do parceiro, da mais antiga para a mais nova. Sem nenhuma, quem usa cai no padrão. */
export async function lerRegrasDoPeriodo(tx: ClienteDoParceiro): Promise<RegraGravada[]> {
  const linhas = await tx.regraDoPeriodo.findMany({ orderBy: { vigenteDesde: 'asc' } });
  return linhas.map((r) => ({ id: r.id, vigenteDesde: iso(r.vigenteDesde), tipo: (ehTipoDeRegra(r.tipo) ? r.tipo : 'MENSAL') as TipoDePeriodo, diaInicio: r.diaInicio, criadoPorNome: r.criadoPorNome, criadoEm: r.criadoEm }));
}

/** Os períodos registrados perto de uma data (±400 dias): é só o que corta o período natural. */
export async function lerRegistrados(tx: ClienteDoParceiro, perto: string): Promise<PeriodoRegistrado[]> {
  const linhas = await tx.periodoApuracao.findMany({
    where: { fim: { gte: dataDoBanco(somarDias(perto, -400)) }, inicio: { lte: dataDoBanco(somarDias(perto, 400)) } },
    orderBy: { inicio: 'asc' },
    select: { id: true, nome: true, inicio: true, fim: true, status: true },
  });
  return linhas.map((p) => ({ id: p.id, nome: p.nome, inicio: iso(p.inicio), fim: iso(p.fim), status: p.status }));
}

/** O período que contém a data. */
export async function periodoDe(tx: ClienteDoParceiro, data: string): Promise<Periodo> {
  const [regras, registrados] = await Promise.all([lerRegrasDoPeriodo(tx), lerRegistrados(tx, data)]);
  return periodoNaData(regras, registrados, data);
}

/** O período anterior ao dado (o que contém a véspera do início). */
export async function periodoAnteriorDe(tx: ClienteDoParceiro, p: Pick<Periodo, 'inicio'>): Promise<Periodo> {
  return periodoDe(tx, somarDias(p.inicio, -1));
}

export type ResultadoDoRegistro = { ok: true; id: string; nome: string; status: 'ABERTO' | 'FECHADO' } | { ok: false; erro: string };

/**
 * Registra o período (ou devolve o que já está registrado com as mesmas datas). O único
 * caminho para criar `PeriodoApuracao`: pega a trava exclusiva dos períodos, e recusa, com
 * frase, o que cruzaria outro período já registrado.
 */
export async function registrarPeriodo(tx: ClienteDoParceiro, p: Periodo): Promise<ResultadoDoRegistro> {
  await travarPeriodos(tx);
  const inicio = dataDoBanco(p.inicio);
  const fim = dataDoBanco(p.fim);
  const igual = await tx.periodoApuracao.findFirst({ where: { inicio, fim }, select: { id: true, nome: true, status: true } });
  if (igual) return { ok: true, id: igual.id, nome: igual.nome, status: igual.status };
  const cruza = await tx.periodoApuracao.findFirst({ where: { inicio: { lte: fim }, fim: { gte: inicio } }, select: { nome: true, inicio: true, fim: true } });
  if (cruza) {
    return { ok: false, erro: `O período ${p.nome} cruza ${cruza.nome || `${formatarData(cruza.inicio)} a ${formatarData(cruza.fim)}`}, que já está registrado. Um período não pode começar dentro de outro.` };
  }
  const novo = await tx.periodoApuracao.create({ data: { parceiroId: tx.parceiroId, nome: p.nome, inicio, fim }, select: { id: true, nome: true, status: true } });
  return { ok: true, id: novo.id, nome: novo.nome, status: novo.status };
}

// ================================================================ a tela dos períodos

export interface SituacaoDosPeriodos {
  hoje: string;
  /** Todas as regras, da mais antiga: a primeira pode ser a do padrão (`padrao`), que não é linha do banco. */
  regras: (Regra & { id: string | null; criadoPorNome: string; padrao: boolean; pendente: boolean })[];
  efetiva: Regra;
  pendente: (Regra & { id: string }) | null;
  periodoAtual: Periodo;
  /** Quando a regra nova passaria a valer, se mudasse hoje. */
  vigenteSeMudar: string;
  recentes: (Periodo & { registradoId: string | null; status: 'ABERTO' | 'FECHADO' | null; atual: boolean })[];
  /** Impressão das regras lidas: a mudança confere. */
  versao: string;
  historico: Awaited<ReturnType<typeof listarHistorico>>;
}

export const versaoDasRegras = (regras: readonly { id: string }[]) => regras.map((r) => r.id).join('|');

/** Quantos períodos a tela lista (o de agora e os anteriores). */
export const PERIODOS_NA_TELA = 8;

export async function situacaoDosPeriodos(cliente: ClienteDoParceiro, hoje = hojeNoRio()): Promise<SituacaoDosPeriodos> {
  return cliente.transacao(async (tx) => {
    const gravadas = await lerRegrasDoPeriodo(tx);
    const registrados = await lerRegistrados(tx, hoje);
    const vig = vigenciaDaMudanca(gravadas, registrados, hoje);
    const recentes = periodosRecentes(gravadas, registrados, hoje, PERIODOS_NA_TELA).map((p) => {
      const reg = registrados.find((r) => r.inicio === p.inicio && r.fim === p.fim);
      return { ...p, registradoId: reg?.id ?? null, status: reg?.status ?? null, atual: p.inicio <= hoje && hoje <= p.fim };
    });
    const regras = [
      ...(gravadas.length === 0 || gravadas[0].vigenteDesde > REGRA_PADRAO.vigenteDesde ? [{ ...REGRA_PADRAO, id: null, criadoPorNome: '', padrao: true, pendente: false }] : []),
      ...gravadas.map((r) => ({ ...r, padrao: false, pendente: r.vigenteDesde > hoje })),
    ];
    const historico = await listarHistorico(tx, { entidade: 'RegraDoPeriodo', verPrecos: false, verDre: true, limite: 10 });
    const pend = gravadas.find((r) => r.vigenteDesde > hoje) ?? null;
    return { hoje, regras, efetiva: vig.efetiva, pendente: pend ? { ...pend } : null, periodoAtual: vig.periodoAtual, vigenteSeMudar: vig.vigenteDesde, recentes, versao: versaoDasRegras(gravadas), historico };
  });
}

// ================================================================ mudar a regra

export const MENSAGEM_CONFLITO_DA_REGRA = 'Alguém mudou a regra do período agora há pouco. Recarregue a página para ver a regra de agora; nada foi gravado.';

export type ResultadoDaRegra =
  | { ok: true; mudou: boolean; vigenteDesde: string | null; periodoAtual: Periodo; voltouAtual: boolean }
  | { ok: false; erros: ErrosDaRegra; conflito?: boolean };

const retratoDaRegra = (r: Pick<Regra, 'tipo' | 'diaInicio' | 'vigenteDesde'>) => ({ alvo: 'Período do DRE', regra: fraseDaRegra(r), valeDesde: formatarData(r.vigenteDesde) });

/**
 * Muda a regra do período. Nunca é retroativa: a regra nova vale do dia seguinte ao fim
 * do período em que `hoje` cai (o primeiro período dela nasce truncado no início). Regra
 * futura pendente é substituída (o histórico guarda as duas). `versao` = o que a tela leu
 * (`versaoDasRegras`): duas abas não se atropelam.
 */
export async function salvarRegra(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  entrada: { tipo: unknown; dia: unknown; versao: unknown },
  autorNome: string,
  hoje = hojeNoRio(),
): Promise<ResultadoDaRegra> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return { ok: false, erros: { geral: negado } };
  const lida = lerRegraDigitada(entrada.tipo, entrada.dia);
  if (!lida.ok) return { ok: false, erros: lida.erros };
  return cliente.transacao(async (tx) => {
    await travarParaEscrever(tx);
    await travarPeriodos(tx);
    const gravadas = await lerRegrasDoPeriodo(tx);
    if (String(entrada.versao ?? '') !== versaoDasRegras(gravadas)) return { ok: false as const, erros: { geral: MENSAGEM_CONFLITO_DA_REGRA }, conflito: true };
    const registrados = await lerRegistrados(tx, hoje);
    const vig = vigenciaDaMudanca(gravadas, registrados, hoje);
    const nova = { tipo: lida.tipo, diaInicio: lida.diaInicio };
    const pendente = gravadas.find((r) => r.vigenteDesde > hoje) ?? null;
    const base = { periodoAtual: vig.periodoAtual };

    if (mesmaRegra(nova, vig.efetiva)) {
      // É a regra de agora: se havia uma mudança agendada, ela é cancelada; senão não há o que fazer.
      if (!pendente) return { ok: true as const, mudou: false, vigenteDesde: null, voltouAtual: false, ...base };
      await tx.regraDoPeriodo.deleteMany({ where: { id: pendente.id } });
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'RegraDoPeriodo', entidadeId: pendente.id, acao: 'EXCLUIU', antes: retratoDaRegra(pendente), motivo: 'Voltou à regra de agora', autorNome } });
      return { ok: true as const, mudou: true, vigenteDesde: null, voltouAtual: true, ...base };
    }
    if (pendente && mesmaRegra(nova, pendente) && pendente.vigenteDesde === vig.vigenteDesde) {
      return { ok: true as const, mudou: false, vigenteDesde: pendente.vigenteDesde, voltouAtual: false, ...base };
    }
    if (pendente) {
      await tx.regraDoPeriodo.deleteMany({ where: { id: pendente.id } });
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'RegraDoPeriodo', entidadeId: pendente.id, acao: 'EXCLUIU', antes: retratoDaRegra(pendente), motivo: 'Substituída por outra mudança', autorNome } });
    }
    const criada = await tx.regraDoPeriodo.create({
      data: { parceiroId: tx.parceiroId, vigenteDesde: dataDoBanco(vig.vigenteDesde), tipo: nova.tipo, diaInicio: nova.diaInicio, criadoPorNome: autorNome.slice(0, 120) },
      select: { id: true },
    });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'RegraDoPeriodo',
        entidadeId: criada.id,
        acao: 'CRIOU',
        antes: undefined,
        depois: retratoDaRegra({ ...nova, vigenteDesde: vig.vigenteDesde }),
        motivo: `Regra anterior: ${fraseDaRegra(vig.efetiva)}`,
        autorNome,
      },
    });
    return { ok: true as const, mudou: true, vigenteDesde: vig.vigenteDesde, voltouAtual: false, ...base };
  });
}
