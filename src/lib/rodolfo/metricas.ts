/**
 * Métricas do funil (F5).
 *
 * Tudo lido do banco, nada estimado. Onde um número ainda não tem origem — o
 * diagnóstico é do Caminho 2, que não existe — o valor vem 0 e a tela diz que
 * a etapa ainda não é alimentada, em vez de inventar.
 *
 * Datas sempre em America/Sao_Paulo, pelo mesmo motivo dos tetos: "hoje" tem
 * que ser o mesmo "hoje" em toda a aplicação.
 */

import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { RAMPA_POR_SEMANA } from '@/lib/barney/regras';
import { agoraSP, diaSP, INSTANCIA } from './estado';
import { tetoDiarioVigente } from '@/lib/barney/tetos';

export interface EtapaFunil {
  chave: string;
  rotulo: string;
  valor: number;
  /** % sobre a etapa anterior. `null` na primeira. */
  conversao: number | null;
  /** true quando a etapa ainda não tem origem de dado (Caminho 2). */
  semOrigem?: boolean;
}

export interface Corte {
  rotulo: string;
  total: number;
  responderam: number;
}

export interface SaudeNumero {
  estadoInstancia: string;
  primeiroEnvioEm: DateTime | null;
  /** Em qual semana da rampa o número está (0 = primeira). */
  semanaRampa: number | null;
  tetoHoje: number;
  enviados24h: number;
  entregues24h: number;
  taxa24h: number | null;
  enviados7d: number;
  entregues7d: number;
  taxa7d: number | null;
  falhas7d: number;
}

export interface CustoIA {
  hojeBRL: number;
  mesBRL: number;
  classificacoes: number;
  tetoDiarioBRL: number | null;
}

export interface Metricas {
  funil: EtapaFunil[];
  porBloco: Corte[];
  porBairro: Corte[];
  porCategoria: Corte[];
  porTier: Corte[];
  saude: SaudeNumero;
  custoIA: CustoIA;
}

/** Leads que podem entrar em cadência: celular, sem opt-out, sem conflito. */
const ELEGIVEL: Prisma.LeadWhereInput = {
  canal: 'WHATSAPP',
  telefoneNormalizado: { not: null },
  status: { notIn: ['OPT_OUT', 'CONFLITO'] },
};

/** Um corte é sempre "quantos" + "quantos responderam" — a taxa é o que importa. */
async function corte(campo: 'bloco' | 'bairro' | 'categoria' | 'tier', limite = 12): Promise<Corte[]> {
  const linhas = await prisma.lead.groupBy({
    by: [campo],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: limite,
  });

  // Responderam, no mesmo recorte. Feito em consulta separada e casado em
  // memória: um groupBy com filtro devolveria só quem tem resposta, e as
  // fatias sem nenhuma sumiriam do corte — que é justamente o que se quer ver.
  const comResposta = await prisma.lead.groupBy({
    by: [campo],
    _count: { _all: true },
    where: {
      status: {
        in: ['RESPONDEU', 'DIAGNOSTICO_PREENCHIDO', 'DIAGNOSTICO_AGENDADO', 'DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE'],
      },
    },
  });

  const mapa = new Map(comResposta.map((r) => [r[campo] ?? '—', r._count._all]));

  return linhas.map((l) => {
    const rotulo = (l[campo] as string | null) ?? '—';
    return { rotulo, total: l._count._all, responderam: mapa.get(rotulo) ?? 0 };
  });
}

export async function carregarMetricas(ref: DateTime = agoraSP()): Promise<Metricas> {
  const ha24h = ref.minus({ hours: 24 }).toJSDate();
  const ha7d = ref.minus({ days: 7 }).toJSDate();
  const inicioDia = diaSP(ref);
  const inicioMes = new Date(`${ref.toFormat('yyyy-LL')}-01T00:00:00.000Z`);

  const [
    importados,
    elegiveis,
    enviados,
    entregues,
    lidos,
    responderam,
    diagPreenchido,
    diagAgendado,
    diagFeito,
    propostas,
    clientes,
    porBloco,
    porBairro,
    porCategoria,
    porTier,
    instancia,
    env24,
    ent24,
    env7,
    ent7,
    falhas7,
    custoHoje,
    custoMes,
    nClassificacoes,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: ELEGIVEL }),
    prisma.message.count({ where: { direction: 'OUT', kind: 'CADENCIA', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] } } }),
    prisma.message.count({ where: { direction: 'OUT', kind: 'CADENCIA', status: { in: ['ENTREGUE', 'LIDA'] } } }),
    prisma.message.count({ where: { direction: 'OUT', kind: 'CADENCIA', status: 'LIDA' } }),
    prisma.lead.count({
      where: {
        status: {
          in: ['RESPONDEU', 'DIAGNOSTICO_PREENCHIDO', 'DIAGNOSTICO_AGENDADO', 'DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE'],
        },
      },
    }),
    prisma.lead.count({ where: { status: { in: ['DIAGNOSTICO_PREENCHIDO', 'DIAGNOSTICO_AGENDADO', 'DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE'] } } }),
    prisma.lead.count({ where: { status: { in: ['DIAGNOSTICO_AGENDADO', 'DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE'] } } }),
    prisma.lead.count({ where: { status: { in: ['DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE'] } } }),
    prisma.lead.count({ where: { status: { in: ['PROPOSTA', 'CLIENTE'] } } }),
    prisma.lead.count({ where: { status: 'CLIENTE' } }),
    corte('bloco'),
    corte('bairro'),
    corte('categoria'),
    corte('tier'),
    prisma.instanceState.findUnique({ where: { nome: INSTANCIA } }),
    prisma.message.count({ where: { direction: 'OUT', enviadaEm: { gte: ha24h } } }),
    prisma.message.count({ where: { direction: 'OUT', entregueEm: { gte: ha24h } } }),
    prisma.message.count({ where: { direction: 'OUT', enviadaEm: { gte: ha7d } } }),
    prisma.message.count({ where: { direction: 'OUT', entregueEm: { gte: ha7d } } }),
    prisma.message.count({ where: { direction: 'OUT', status: 'FALHA', criadoEm: { gte: ha7d } } }),
    prisma.inboundClassification.aggregate({ _sum: { custoIA: true }, where: { criadoEm: { gte: inicioDia } } }),
    prisma.inboundClassification.aggregate({ _sum: { custoIA: true }, where: { criadoEm: { gte: inicioMes } } }),
    prisma.inboundClassification.count(),
  ]);

  const taxa = (parte: number, todo: number) => (todo > 0 ? parte / todo : null);
  const conv = (atual: number, anterior: number | null) =>
    anterior && anterior > 0 ? (atual / anterior) * 100 : null;

  const bruto: Array<[string, string, number, boolean?]> = [
    ['importados', 'Importados', importados],
    ['elegiveis', 'Elegíveis', elegiveis],
    ['enviados', 'Enviados', enviados],
    ['entregues', 'Entregues', entregues],
    ['lidos', 'Lidos', lidos],
    ['responderam', 'Responderam', responderam],
    ['diagPreenchido', 'Diagnóstico preenchido', diagPreenchido, true],
    ['diagAgendado', 'Agendaram', diagAgendado, true],
    ['diagFeito', 'Diagnóstico feito', diagFeito, true],
    ['propostas', 'Propostas', propostas, true],
    ['clientes', 'Clientes', clientes, true],
  ];

  const funil: EtapaFunil[] = bruto.map(([chave, rotulo, valor, semOrigem], i) => ({
    chave,
    rotulo,
    valor,
    conversao: i === 0 ? null : conv(valor, bruto[i - 1][2]),
    semOrigem,
  }));

  const primeiroEnvioEm = instancia?.primeiroEnvioEm
    ? DateTime.fromJSDate(instancia.primeiroEnvioEm)
    : null;
  const semanaRampa = primeiroEnvioEm
    ? Math.floor(ref.diff(primeiroEnvioEm, 'days').days / 7)
    : null;

  const teto = Number(process.env.AI_DAILY_BUDGET_BRL ?? '0');

  return {
    funil,
    porBloco,
    porBairro,
    porCategoria,
    porTier,
    saude: {
      estadoInstancia: instancia?.estado ?? 'close',
      primeiroEnvioEm,
      semanaRampa: semanaRampa === null ? null : Math.min(semanaRampa, RAMPA_POR_SEMANA.length),
      tetoHoje: tetoDiarioVigente(primeiroEnvioEm, ref),
      enviados24h: env24,
      entregues24h: ent24,
      taxa24h: taxa(ent24, env24),
      enviados7d: env7,
      entregues7d: ent7,
      taxa7d: taxa(ent7, env7),
      falhas7d: falhas7,
    },
    custoIA: {
      hojeBRL: Number(custoHoje._sum.custoIA ?? 0),
      mesBRL: Number(custoMes._sum.custoIA ?? 0),
      classificacoes: nClassificacoes,
      tetoDiarioBRL: teto > 0 ? teto : null,
    },
  };
}

/**
 * Linhas do CSV de leads.
 *
 * Sem os textos das mensagens: o arquivo desce para a máquina do Rodolfo e
 * costuma acabar em e-mail e pendrive. Telefone já é dado pessoal o bastante.
 */
export async function leadsParaCsv(): Promise<string> {
  const leads = await prisma.lead.findMany({
    orderBy: [{ tier: 'asc' }, { scoreBase: 'desc' }],
    select: {
      nome: true,
      restaurante: true,
      bairro: true,
      bloco: true,
      categoria: true,
      telefoneNormalizado: true,
      tipoTelefone: true,
      canal: true,
      nota: true,
      avaliacoes: true,
      scoreBase: true,
      gapDigital: true,
      scoreTotal: true,
      tier: true,
      status: true,
      lote: true,
      importadoEm: true,
    },
  });

  const colunas = [
    'Nome', 'Restaurante', 'Bairro', 'Bloco', 'Categoria', 'Telefone', 'Tipo', 'Canal',
    'Nota', 'Avaliacoes', 'Score Base', 'Gap Digital', 'Score Total', 'Tier', 'Status',
    'Lote', 'Importado em',
  ];

  // Escapa aspas duplicando-as, como manda o RFC 4180. Sem isso, um nome com
  // aspas ("Bar do Zé "O Rei"") quebra a linha inteira na planilha.
  const campo = (v: unknown): string => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const linhas = leads.map((l) =>
    [
      l.nome, l.restaurante, l.bairro, l.bloco, l.categoria, l.telefoneNormalizado,
      l.tipoTelefone, l.canal, l.nota, l.avaliacoes, l.scoreBase, l.gapDigital,
      l.scoreTotal, l.tier, l.status, l.lote, l.importadoEm,
    ].map(campo).join(';'),
  );

  // BOM + separador ";" — é o que o Excel em pt-BR abre sem pedir importação,
  // e é o mesmo formato que o `montar_pacote.py` já gera.
  return `﻿${colunas.map(campo).join(';')}\n${linhas.join('\n')}\n`;
}
