/** Fonte mensal real; execução local centralizada na coordenação. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia, obterMes, salvarCanaisDaLoja, type EntradaDoCanal } from '@/lib/erp/faturamento';
import { chaveDeIntegracao } from '@/lib/erp/faturamento-campos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { faturamentoAnalitico } from '@/lib/erp/home-analitico';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE, HOJE = '2026-10-30';
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const canal = (canal: string, valor = '', naoVendeu = false): EntradaDoCanal => ({ canal, valor, pedidos: naoVendeu ? '' : '1', clientes: '', naoVendeu, versao: '' });

describe.skipIf(!URL_TESTE)('Home · composição por canal da mesma fonte PostgreSQL local', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, a: ClienteDoParceiro;
  let parceiroId = '', consultas = 0;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco de teste precisa ser local.');
    const client = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', () => { consultas++; }); db = client; perfil = await perfilDoBanco(db);
    const p = await db.parceiroFlow.create({ data: { nome: 'Canais Home QA', slug: `canais-home-${crypto.randomUUID()}`, status: 'ATIVO' } });
    parceiroId = p.id; a = doParceiro(p.id, db);
  });
  afterAll(async () => { try { if (db && parceiroId) await limparParceiros(db, perfil, [parceiroId]); } finally { await db?.$disconnect(); } });
  async function loja(nome: string) { const r = await cadastrarLoja(a, { nome }, 'QA'); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; }
  async function gravar(lojaId: string, canais: EntradaDoCanal[], data = HOJE) {
    expect(await lancarDia(a, dono, { lojaId, data, canais }, 'QA', HOJE)).toMatchObject({ ok: true });
  }
  async function ler(lojaId: string) {
    const m = await obterMes(a, dono, { mes: '2026-10', lojaId }, HOJE), antes = consultas;
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, { alcance: dono, loja: { id: lojaId, nome: 'QA' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-30T15:00:00Z' })!;
    expect(consultas).toBe(antes); return p;
  }
  it('integração prevalece no grão; zero declarado permanece e parcial mantém denominador informado', async () => {
    const id = await loja('Composição prevalente');
    await gravar(id, [canal('LOJA', '100'), canal('DELIVERY_PROPRIO', '', true), canal('IFOOD', '999')], '2026-10-28');
    await a.faturamentoLancamento.create({ data: { parceiroId, lojaId: id, canal: 'IFOOD', data: new Date('2026-10-28T00:00:00Z'), valorCentavos: 30000, pedidos: 1, clientes: 1, origem: 'INTEGRACAO', origemRef: 'fixture-local', chaveIdempotencia: chaveDeIntegracao('fixture-home', 'pedido', crypto.randomUUID())! } });
    const p = await ler(id);
    expect(p.widget.composicaoPorCanal).toMatchObject({ estado: 'parcial', totalCentavos: 40000, canais: [
      { canal: 'LOJA', centavos: 10000, faltas: 1, percentualBp: 2500 },
      { canal: 'DELIVERY_PROPRIO', centavos: 0, faltas: 1, percentualBp: 0 },
      { canal: 'IFOOD', centavos: 30000, faltas: 1, percentualBp: 7500 },
    ] });
    expect(JSON.stringify(p)).not.toMatch(/99900|conferencia|origemRef|fixture-local/);
  });
  it('preserva histórico do canal desativado e distingue ausência hoje de zero conhecido', async () => {
    const id = await loja('Histórico e ausência');
    await gravar(id, [canal('IFOOD', '50')]);
    expect(await salvarCanaisDaLoja(a, id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'QA')).toMatchObject({ ok: true });
    expect((await ler(id)).widget.composicaoPorCanal).toMatchObject({ estado: 'ok', totalCentavos: 5000, canais: [
      { canal: 'LOJA', centavos: null, faltas: 0, percentualBp: null }, { canal: 'IFOOD', centavos: 5000, percentualBp: 10000 },
    ] });
    const zero = await loja('Zero conhecido'); await gravar(zero, [canal('LOJA', '', true), canal('DELIVERY_PROPRIO', '', true), canal('IFOOD', '', true)]);
    const c = (await ler(zero)).widget.composicaoPorCanal!;
    expect(c.totalCentavos).toBe(0); expect(c.canais.map(l => l.centavos)).toEqual([0, 0, 0]); expect(c.canais.every(l => l.percentualBp === null)).toBe(true);
    const vazia = await loja('Ainda sem lançamento'); expect((await ler(vazia)).widget.composicaoPorCanal).toMatchObject({ estado: 'sem_dados', totalCentavos: null, canais: [] });
    expect(await a.movimentoEstoque.count()).toBe(0);
  });
});
