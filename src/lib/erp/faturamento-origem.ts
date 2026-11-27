import type { Prisma } from '@prisma/client';
import type { LojaNoMes } from './faturamento';
import { CANAIS_EM_ORDEM, type CanalVenda } from './faturamento-campos';
import { recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

export type FonteDoTotal = 'MANUAL' | 'IMPORTACAO' | 'IFOOD_ANALYTICS' | 'SEM_FONTE';

export interface OrigemDoTotal {
  dias: { data: string; parcelas: { canal: CanalVenda; valorCentavos: number; fontes: FonteDoTotal[] }[] }[];
  ultimaAtualizacao: string | null;
}

const selecao = {
  canal: true,
  data: true,
  origem: true,
  marcaId: true,
  origemRef: true,
  atualizadoEm: true,
  fontesAnalytics: { select: {
    marcaAplicadaId: true,
    snapshotId: true,
    recibo: { select: { lojaId: true, dia: true, canal: true, fonte: true, aplicadoEm: true, hashAplicado: true } },
  } },
} as const satisfies Prisma.FaturamentoLancamentoSelect;
type Lancamento = Prisma.FaturamentoLancamentoGetPayload<{ select: typeof selecao }>;

function origemDoLancamento(linha: Lancamento, lojaId: string): { fonte: FonteDoTotal; atualizadoEm: Date | null } {
  if (linha.origem !== 'INTEGRACAO') return { fonte: linha.origem, atualizadoEm: linha.atualizadoEm };
  const comprovante = linha.fontesAnalytics[0];
  const recibo = comprovante?.recibo;
  if (linha.canal === 'IFOOD' && recibo?.aplicadoEm && recibo.hashAplicado && recibo.fonte === 'ifood-analytics'
    && recibo.lojaId === lojaId && recibo.canal === linha.canal && recibo.dia.getTime() === linha.data.getTime()
    && comprovante.marcaAplicadaId === linha.marcaId && linha.origemRef === `ifood-analytics:${comprovante.snapshotId}`) {
    return { fonte: 'IFOOD_ANALYTICS', atualizadoEm: recibo.aplicadoEm };
  }
  return { fonte: 'SEM_FONTE', atualizadoEm: null };
}

/** Lê apenas a proveniência dos grãos da loja. Caller usa a mesma fotografia de leitura do mês. */
export async function lerOrigemDoTotal(tx: ClienteDoParceiro, alcance: Alcance, mes: LojaNoMes): Promise<OrigemDoTotal | null> {
  if (recusa(alcance, 'faturamento.ver', { lojaId: mes.loja.id })) return null;
  const lancados = mes.dias.filter(dia => dia.total !== null);
  if (!lancados.length) return { dias: [], ultimaAtualizacao: null };
  const linhas = await tx.faturamentoLancamento.findMany({
    where: { lojaId: mes.loja.id, data: { in: lancados.map(dia => new Date(`${dia.data}T00:00:00.000Z`)) } },
    select: selecao,
  });
  const porDia = new Map<string, Lancamento[]>();
  for (const linha of linhas) {
    const data = linha.data.toISOString().slice(0, 10);
    const dia = porDia.get(data) ?? [];
    dia.push(linha);
    porDia.set(data, dia);
  }

  const dias: OrigemDoTotal['dias'] = [];
  let ultimaAtualizacao: Date | null = null;
  for (const dia of lancados) {
    const parcelas: OrigemDoTotal['dias'][number]['parcelas'] = [];
    const registros = porDia.get(dia.data) ?? [];
    for (const canal of CANAIS_EM_ORDEM) {
      const grao = dia.canais[canal];
      if (!grao) continue;
      const efetivos = registros.filter(linha => linha.canal === canal && (linha.origem === 'INTEGRACAO') === (grao.fonte === 'INTEGRACAO'));
      const fontes = new Set<FonteDoTotal>();
      for (const linha of efetivos) {
        const { fonte, atualizadoEm } = origemDoLancamento(linha, mes.loja.id);
        fontes.add(fonte);
        if (atualizadoEm && (!ultimaAtualizacao || atualizadoEm > ultimaAtualizacao)) ultimaAtualizacao = atualizadoEm;
      }
      parcelas.push({ canal, valorCentavos: grao.valorCentavos, fontes: fontes.size ? [...fontes].sort() : ['SEM_FONTE'] });
    }
    dias.push({ data: dia.data, parcelas });
  }
  return { dias, ultimaAtualizacao: ultimaAtualizacao?.toISOString() ?? null };
}
