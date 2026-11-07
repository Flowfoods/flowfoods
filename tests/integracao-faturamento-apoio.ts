/** Fixtures exclusivamente sintéticas. O caller instala mock do cliente global e faz cleanup. Sem HTTP. */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { ligarConexao, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import { registrarDonoAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { comPosseAnalytics, type PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import type { BucketAnalytics } from '@/lib/integracoes/ifood/analytics';

export const DIA_FINANCEIRO = '2026-10-19';
export interface MassaFinanceira { cliente: ClienteDoParceiro; lojaId: string; conexaoId: string; moduloId: string; appId: string; merchantId: string; ambiente: 'TEST' | 'PRODUCAO' }
export interface InventarioFinanceiro { parceiros: string[]; apps: string[]; autor: string }

export async function assumirPosseFinanceira(url: string) {
  let liberar!: () => void, entregar!: (p: PosseAnalytics) => void, recusar!: (e: unknown) => void;
  const fim = new Promise<void>(r => { liberar = r; });
  const pronta = new Promise<PosseAnalytics>((r, e) => { entregar = r; recusar = e; });
  const encerrada = comPosseAnalytics(url, async p => { entregar(p); await fim; });
  void encerrada.then(r => { if (r === null) recusar(new Error('Outro líder inesperado no banco exclusivo.')); }, recusar);
  const posse = await pronta;
  await registrarDonoAnalytics(posse);
  return { posse, liberar, encerrada };
}

export async function massaFinanceira(db: PrismaClient, inventario: InventarioFinanceiro, o: {
  ambiente?: 'TEST' | 'PRODUCAO'; cliente?: ClienteDoParceiro; lojaId?: string; merchantId?: string;
} = {}): Promise<MassaFinanceira> {
  const ambiente = o.ambiente ?? 'PRODUCAO', uuid = randomUUID();
  let cliente = o.cliente;
  if (!cliente) {
    const p = await db.parceiroFlow.create({ data: { nome: `Financeiro sintético ${uuid}`, slug: `fin-${uuid}`, status: 'ATIVO', homologacaoDeIntegracao: ambiente === 'TEST' } });
    inventario.parceiros.push(p.id); cliente = doParceiro(p.id, db);
  }
  let lojaId = o.lojaId;
  if (!lojaId) {
    const l = await cadastrarLoja(cliente, { nome: `Loja sintética ${uuid}` }, inventario.autor);
    if (!l.ok) throw new Error('Não criou a loja de teste.');
    lojaId = l.id;
  }
  const a = await registrarApp({ provedor: 'IFOOD', ambiente, nome: `App QA ${uuid}`, categoria: ambiente === 'TEST' ? 'TEST' : 'BI',
    clientId: `qa-${uuid}`, nomeDoSegredo: ambiente === 'TEST' ? 'IFOOD_TEST_CLIENT_SECRET' : 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, inventario.autor);
  if (!a.ok) throw new Error('Não criou o app de teste.');
  inventario.apps.push(a.id);
  if (ambiente === 'PRODUCAO') await prisma.integracaoApp.update({ where: { id: a.id }, data: { estadoHomologacao: 'HOMOLOGADO' } });
  const merchantId = o.merchantId ?? randomUUID();
  const c = await ligarConexao(cliente, { lojaId, provedor: 'IFOOD', ambiente, idExterno: merchantId, nomeExterno: 'Merchant sintético' }, { nome: inventario.autor });
  if (!c.ok) throw new Error('Não criou a conexão de teste.');
  const m = await prepararModulo(cliente, c.id, a.id, 'ANALYTICS', inventario.autor);
  if (!m.ok) throw new Error('Não criou o módulo de teste.');
  if (ambiente === 'PRODUCAO') expect(await mudarModulo(cliente, m.id, 'solicitar', inventario.autor)).toMatchObject({ ok: true });
  expect(await mudarModulo(cliente, m.id, 'autorizar', inventario.autor)).toMatchObject({ ok: true });
  expect(await mudarModulo(cliente, m.id, 'ativar', inventario.autor)).toMatchObject({ ok: true });
  expect(await mudarLiberacao(cliente, 'integracao', true, inventario.autor)).toMatchObject({ ok: true });
  return { cliente, lojaId, merchantId, conexaoId: c.id, moduloId: m.id, appId: a.id, ambiente };
}

export function bucketFinanceiro(valor = 19.99, pedidos = 3, dimensoes: Partial<BucketAnalytics['groupByKey']['value']> = {}): BucketAnalytics {
  return { groupByKey: { value: { orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', category: 'FOOD', deliveredBy: 'IFOOD_DELIVERY', ...dimensoes }, count: pedidos },
    gmv: { sum: valor + 5 }, gmvWithoutDelivery: { sum: valor }, netDeliveryFee: { sum: 5 }, paymentTotalValue: { sum: valor + 5 },
    benefitByTypePartnerTotalValue: { sum: 2 }, refundedTotalValue: { sum: -1 } };
}

export async function publicarFinanceiro(m: MassaFinanceira, posse: PosseAnalytics, dados = [bucketFinanceiro()], o: { ciclo?: string; dia?: string } = {}) {
  const dia = o.dia ?? DIA_FINANCEIRO;
  await agendarJanela(m.cliente, { moduloId: m.moduloId, dia, ciclo: o.ciclo ?? '2026-10-20', tipo: 'D1', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
  const repo = criarRepositorioAnalytics(m.cliente, posse, () => true), tarefa = await repo.adquirir();
  if (!tarefa || tarefa.moduloId !== m.moduloId) throw new Error('A fixture adquiriu outra janela.');
  await repo.salvarPagina(tarefa, { pagina: 1, http: 200, requestId: 'qa-financeiro-pagina-1', corpoOriginal: JSON.stringify({ data: dados, currentPage: 1, size: dados.length || 1, totalItems: dados.length, totalPages: dados.length ? 1 : 0 }) });
  const resultado = await repo.publicar(tarefa);
  expect(['publicada', 'vazia', 'sem-mudanca', 'pendente-periodo']).toContain(resultado);
  return { tarefa, resultado };
}
