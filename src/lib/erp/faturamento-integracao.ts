/** INT-1.7B: aplica somente snapshots persistidos, sob cobertura e posse SQL. Nenhum HTTP. */
import { createHash } from 'node:crypto';
import type { Prisma, FaturamentoLancamento } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { LIMITES_DO_FATURAMENTO } from './faturamento-campos';
import { formatarData } from './compra-campos';
import type { PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { diaSeguinte } from '@/lib/integracoes/ifood/datas';
import { mapearSnapshotParaFaturamento } from '@/lib/integracoes/ifood/mapa-faturamento';
import {
  ErroAplicacaoAnalytics, ehMotivoPendenciaFinanceira, VERSAO_MAPA_FATURAMENTO_ANALYTICS,
  type GraoAnalyticsParaFaturamento, type MotivoPendenciaFinanceira, type ResultadoAplicacaoAnalytics,
} from '@/lib/integracoes/ifood/faturamento-tipos';

const incluirSnapshot = { linhas: true, execucao: { include: { modulo: { include: { conexao: true } } } } } as const;
type Snapshot = Prisma.IntegracaoSnapshotGetPayload<{ include: typeof incluirSnapshot }>;
const AUTOR = 'Integração iFood Analytics';
const chave = (merchant: string, dia: string) => `ifood-analytics:dia:${merchant}:${dia}`;
const referencia = (id: string) => `ifood-analytics:${id}`;

function mapear(s: Snapshot) {
  const e = s.execucao, c = e.modulo.conexao;
  return mapearSnapshotParaFaturamento({
    ...s, lojaId: c.lojaId, merchantId: c.idExterno, provedor: c.provedor, ambiente: c.ambiente,
    perfil: e.perfil, dia: e.dia.toISOString().slice(0, 10), fuso: e.fuso,
  });
}

function destinoCoerente(l: FaturamentoLancamento, s: Snapshot, marcaId: string | null, lojaId: string, dia: string): boolean {
  const n = mapear(s);
  return n.estado === 'apto' && l.lojaId === lojaId && l.data.toISOString().slice(0, 10) === dia
    && l.canal === 'IFOOD' && l.origem === 'INTEGRACAO' && l.clientes === null && l.marcaId === marcaId
    && l.chaveIdempotencia === chave(s.execucao.modulo.conexao.idExterno, dia) && l.origemRef === referencia(s.id)
    && l.valorCentavos === n.valorCentavos && l.pedidos === n.pedidos;
}

/** Retrato próprio: preserva a ausência; não afrouxa a projeção validada das entradas humanas. */
function retrato(l: Pick<FaturamentoLancamento, 'valorCentavos' | 'pedidos' | 'clientes' | 'origemRef'>, lojaId: string, lojaNome: string, dia: string) {
  return { alvo: `${lojaNome} · iFood · ${formatarData(dia)}`, faturamentoLojaId: lojaId, faturamentoDia: dia,
    faturamentoCentavos: l.valorCentavos, pedidos: l.pedidos, clientes: l.clientes, origem: 'Integração', origemRef: l.origemRef };
}

async function confirmar(posse: PosseAnalytics, chaveGeral: () => boolean) {
  if (!chaveGeral()) throw new ErroAplicacaoAnalytics('ACESSO');
  if (!await posse.confirmar()) throw new ErroAplicacaoAnalytics('POSSE');
}

/** Nenhum número do caller chega ao ledger. A validação inteira antecede a primeira escrita financeira. */
export async function aplicarFaturamentoAnalytics(
  cliente: ClienteDoParceiro, posse: PosseAnalytics, grao: GraoAnalyticsParaFaturamento, chaveGeral: () => boolean,
): Promise<ResultadoAplicacaoAnalytics> {
  if (!grao.lojaId || grao.lojaId.length > 200 || !diaSeguinte(grao.dia) || grao.dia < LIMITES_DO_FATURAMENTO.dataMinima) {
    throw new ErroAplicacaoAnalytics('ENTRADA');
  }
  if (cliente.somenteLeitura) throw new ErroAplicacaoAnalytics('ACESSO');
  await confirmar(posse, chaveGeral);
  return cliente.transacao(async tx => {
    // O SQL adquire período → cobertura → controle → parceiro → conexões/módulos → recibo.
    // Nunca ler/travar o recibo antes deste prefixo; o publicador já segura um módulo.
    const [r] = await tx.sql<{ resultado: unknown }>`SELECT erp_integracao_faturamento_preparar(${tx.parceiroId},${grao.lojaId},${grao.dia}::date,${posse.id}) AS resultado`;
    const p = r?.resultado;
    if (!p || typeof p !== 'object' || !('ok' in p) || typeof p.ok !== 'boolean'
      || !('reciboId' in p) || typeof p.reciboId !== 'string' || !p.reciboId) throw new ErroAplicacaoAnalytics('INTEGRIDADE');
    const reciboId = p.reciboId;
    const pendencia = async (motivo: MotivoPendenciaFinanceira): Promise<ResultadoAplicacaoAnalytics> => {
      await confirmar(posse, chaveGeral);
      const [res] = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_faturamento_pendencia(${tx.parceiroId},${reciboId},${posse.id},${motivo}) AS ok`;
      if (res?.ok !== true) throw new ErroAplicacaoAnalytics('INTEGRIDADE');
      return { estado: 'pendente', reciboId, motivo };
    };
    if (!p.ok) {
      if (!('motivo' in p) || !ehMotivoPendenciaFinanceira(p.motivo)) throw new ErroAplicacaoAnalytics('INTEGRIDADE');
      return pendencia(p.motivo);
    }
    const loja = await tx.loja.findFirst({ where: { id: grao.lojaId }, select: { id: true, nome: true, ativa: true, canaisDeVenda: true } });
    if (!loja?.ativa || !loja.canaisDeVenda.includes('IFOOD')) return pendencia('ACESSO');
    const recibo = await tx.integracaoFaturamentoDia.findFirst({ where: { id: reciboId }, include: {
      fontes: { include: { lancamento: true, snapshot: { include: incluirSnapshot } } },
    } });
    if (!recibo || recibo.lojaId !== grao.lojaId || recibo.dia.toISOString().slice(0, 10) !== grao.dia) throw new ErroAplicacaoAnalytics('INTEGRIDADE');
    const conexoes = await tx.integracaoConexao.findMany({ where: { lojaId: grao.lojaId, provedor: 'IFOOD', ambiente: 'PRODUCAO' },
      include: { modulos: { where: { modulo: 'ANALYTICS' } } }, orderBy: { idExterno: 'asc' } });
    if (!conexoes.length) return pendencia('COBERTURA_INCOMPLETA');
    const merchants = [...new Set([...conexoes.map(c => c.idExterno), ...recibo.fontes.map(f => f.merchantId)])];
    const todos = await tx.integracaoConexao.findMany({ where: { provedor: 'IFOOD', ambiente: 'PRODUCAO', idExterno: { in: merchants } }, select: { id: true, idExterno: true, lojaId: true } });
    if (todos.length !== merchants.length || todos.some(c => c.lojaId !== grao.lojaId)
      || new Set(todos.map(c => c.idExterno)).size !== todos.length) return pendencia('VINCULO_AMBIGUO');
    const anteriores = new Map(recibo.fontes.map(f => [f.merchantId, f]));
    if (recibo.fontes.some(f => !conexoes.some(c => c.id === f.conexaoId))) return pendencia('VINCULO_AMBIGUO');
    const existentes = await tx.faturamentoLancamento.findMany({ where: { lojaId: grao.lojaId, canal: 'IFOOD', data: new Date(`${grao.dia}T00:00:00Z`), origem: 'INTEGRACAO' } });
    if (existentes.some(l => !l.chaveIdempotencia.startsWith('ifood-analytics:dia:'))) return pendencia('OUTRA_INTEGRACAO');
    if (existentes.some(l => !recibo.fontes.some(f => f.lancamentoId === l.id))) return pendencia('DESTINO_DIVERGENTE');
    const plano = [];
    let total = 0n, pedidos = 0n;
    for (const c of conexoes) {
      const m = c.modulos[0];
      if (c.estado !== 'ATIVA' || c.modulos.length !== 1 || m.estado !== 'ATIVO') return pendencia('ACESSO');
      const anterior = anteriores.get(c.idExterno);
      if (anterior && (anterior.conexaoId !== c.id || anterior.moduloId !== m.id)) return pendencia('VINCULO_AMBIGUO');
      if (anterior && anterior.marcaAplicadaId !== c.marcaId) return pendencia('MARCA_DIVERGENTE');
      if (anterior && !destinoCoerente(anterior.lancamento, anterior.snapshot, anterior.marcaAplicadaId, grao.lojaId, grao.dia)) return pendencia('DESTINO_DIVERGENTE');
      const s = await tx.integracaoSnapshot.findFirst({ where: { situacao: 'PUBLICADO', execucao: { moduloId: m.id, perfil: 'diario', dia: new Date(`${grao.dia}T00:00:00Z`) } },
        include: incluirSnapshot, orderBy: { geracao: 'desc' } });
      if (!s) return pendencia('COBERTURA_INCOMPLETA');
      const n = mapear(s);
      if (n.estado === 'pendente') return pendencia(n.motivo);
      total += BigInt(n.valorCentavos); pedidos += BigInt(n.pedidos);
      plano.push({ c, m, s, n, anterior });
    }
    if (total > BigInt(LIMITES_DO_FATURAMENTO.valorCentavos) || pedidos > BigInt(LIMITES_DO_FATURAMENTO.quantidade)) return pendencia('LIMITE_FATURAMENTO');
    const hash = createHash('sha256').update(JSON.stringify([VERSAO_MAPA_FATURAMENTO_ANALYTICS,
      plano.map(({ c, m, s }) => [c.idExterno, c.id, m.id, s.id, s.hash, c.marcaId])])).digest('hex');
    const igual = recibo.hashAplicado === hash && recibo.versaoMapaAplicada === VERSAO_MAPA_FATURAMENTO_ANALYTICS;
    if (igual && (recibo.fontes.length !== plano.length || plano.some(p => !p.anterior || p.anterior.snapshotId !== p.s.id))) return pendencia('DESTINO_DIVERGENTE');
    await confirmar(posse, chaveGeral);
    if (!igual) {
      for (const { c, m, s, n, anterior } of plano) {
        const dados = { valorCentavos: n.valorCentavos, pedidos: n.pedidos, clientes: null, origemRef: referencia(s.id), atualizadoPorNome: AUTOR };
        // Atualiza só a própria fonte. Nenhuma linha humana ou integração alheia é alterada.
        const mudou = !anterior || !destinoCoerente(anterior.lancamento, s, c.marcaId, grao.lojaId, grao.dia);
        const l = anterior ? (mudou ? await tx.faturamentoLancamento.update({ where: { id: anterior.lancamentoId }, data: dados }) : anterior.lancamento)
          : await tx.faturamentoLancamento.create({ data: { ...dados, parceiroId: tx.parceiroId, lojaId: grao.lojaId, marcaId: c.marcaId,
            canal: 'IFOOD', data: new Date(`${grao.dia}T00:00:00Z`), origem: 'INTEGRACAO', chaveIdempotencia: chave(c.idExterno, grao.dia) } });
        if (!anterior) await tx.integracaoFaturamentoFonte.create({ data: { parceiroId: tx.parceiroId, reciboId, dia: new Date(`${grao.dia}T00:00:00Z`),
          merchantId: c.idExterno, conexaoId: c.id, moduloId: m.id, snapshotId: s.id, lancamentoId: l.id, marcaAplicadaId: c.marcaId } });
        else if (anterior.snapshotId !== s.id) await tx.integracaoFaturamentoFonte.update({ where: { id: anterior.id }, data: { snapshotId: s.id } });
        if (mudou) await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'FaturamentoLancamento', entidadeId: l.id,
          acao: anterior ? 'ALTEROU' : 'CRIOU', ...(anterior ? { antes: retrato(anterior.lancamento, grao.lojaId, loja.nome, grao.dia) } : {}),
          depois: retrato(l, grao.lojaId, loja.nome, grao.dia), autorNome: AUTOR } });
      }
    }
    await confirmar(posse, chaveGeral);
    const [fim] = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_faturamento_concluir(${tx.parceiroId},${reciboId},${posse.id},${hash},${VERSAO_MAPA_FATURAMENTO_ANALYTICS}::int,${igual}) AS ok`;
    if (fim?.ok !== true) throw new ErroAplicacaoAnalytics('INTEGRIDADE');
    await confirmar(posse, chaveGeral);
    return { estado: igual ? 'igual' : 'aplicado', reciboId, fontes: plano.length };
    // Constraint diferido ainda prova sessão viva e coerência integral no COMMIT.
  }, { timeout: 30_000 });
}
