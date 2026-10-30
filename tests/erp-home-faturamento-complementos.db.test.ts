/** Preparado para PG local nos três perfis; execução centralizada pela coordenação. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia, obterMes, type EntradaDoCanal } from '@/lib/erp/faturamento';
import { chaveDeIntegracao } from '@/lib/erp/faturamento-campos';
import { faturamentoAnalitico } from '@/lib/erp/home-analitico';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const dono = (lojas: string[] | 'rede' = 'rede') => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojas === 'rede', lojaIds: lojas === 'rede' ? [] : lojas });
const canal = (c: string, valor = '', pedidos = '', clientes = '', naoVendeu = false): EntradaDoCanal => ({ canal: c, valor, pedidos, clientes, naoVendeu, versao: '' });
const zero = () => ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'].map(c => canal(c, '', '', '', true));

describe.skipIf(!URL_TESTE)('Home · pedidos, atendimentos e ticket da fonte mensal canônica no Postgres local', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let consultas = 0;
  const ids: Record<string, string> = {};
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);

  async function loja(cliente: ClienteDoParceiro, nome: string) {
    const r = await cadastrarLoja(cliente, { nome }, 'Fixture complemento Home');
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  async function lancar(cliente: ClienteDoParceiro, lojaId: string, canais: EntradaDoCanal[], data = '2026-10-28') {
    const r = await lancarDia(cliente, dono(), { lojaId, data, canais }, 'Fixture complemento Home', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
  }
  const contexto = (lojaId: string, alcance: Alcance = dono([lojaId]), raiz = '/erp') => ({ alcance, loja: { id: lojaId, nome: 'Loja sintética' }, raiz, hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' });
  const ler = (cliente: ClienteDoParceiro, lojaId: string, alcance = dono([lojaId])) => obterMes(cliente, alcance, { mes: '2026-10', lojaId }, HOJE);

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    const clienteDb = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    // Contagem apenas: não imprime SQL, parâmetros ou eventos no relatório.
    clienteDb.$on('query', () => { consultas++; }); db = clienteDb; perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Complementos Home A', slug: 'home-complementos-a-' + sufixo, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Complementos Home B', slug: 'home-complementos-b-' + sufixo, status: 'ATIVO' } });
    a = doParceiro(A.id, db); b = doParceiro(B.id, db);
    for (const nome of ['principal', 'integrada', 'zero', 'vazia', 'parcial', 'arredondamento', 'outra']) ids[nome] = await loja(a, 'Home ' + nome);
    ids.b = await loja(b, 'Outra casa B');
    await lancar(a, ids.principal, [canal('LOJA', '100,00', '1', '3'), canal('DELIVERY_PROPRIO', '900,00', '3', '5'), canal('IFOOD', '', '', '', true)]);
    await lancar(a, ids.zero, zero());
    await lancar(a, ids.parcial, [canal('LOJA', '100,00', '1', '2')], '2026-10-27');
    await lancar(a, ids.arredondamento, [canal('LOJA', '0,01', '3', '3'), canal('DELIVERY_PROPRIO', '', '', '', true), canal('IFOOD', '', '', '', true)]);
    await lancar(a, ids.outra, [canal('LOJA', '7.777,77', '77', '88')]);
    await lancar(b, ids.b, [canal('LOJA', '1.234,00', '7', '9')]);
    // Fixture sintética da precedência já canônica. Nenhuma conta/API real.
    await lancar(a, ids.integrada, [canal('LOJA', '9.000,00', '900', '900'), canal('DELIVERY_PROPRIO', '900,00', '3', '5'), canal('IFOOD', '', '', '', true)]);
    for (const [n, valorCentavos, clientes] of [[1, 4000, 2], [2, 6000, 4]] as const) {
      await a.faturamentoLancamento.create({ data: {
        parceiroId: A.id, lojaId: ids.integrada, canal: 'LOJA', data: new Date('2026-10-28T00:00:00.000Z'),
        valorCentavos, pedidos: 1, clientes, origem: 'INTEGRACAO', origemRef: 'fixture-home-' + n,
        chaveIdempotencia: chaveDeIntegracao('fixture-home', 'pedido', sufixo + '-' + n)!,
      } });
    }
  });
  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, [A?.id, B?.id].filter((id): id is string => !!id));
    await db?.$disconnect();
  });

  it('copia os três números do mesmo LojaNoMes.total e não produz consulta ao projetar', async () => {
    const m = await ler(a, ids.principal); const t = m.lojas[0].total;
    expect(m.lojas).toHaveLength(1); expect(m.lojas[0].loja.id).toBe(ids.principal);
    expect(t).toEqual({ valorCentavos: 100000, pedidos: 4, clientes: 8, ticketMedioCentavos: 25000 });
    expect(m.lojas[0].porCanal.LOJA.ticketMedioCentavos).toBe(10000);
    expect(m.lojas[0].porCanal.DELIVERY_PROPRIO.ticketMedioCentavos).toBe(30000);
    const antes = consultas;
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, contexto(ids.principal))!;
    expect(consultas).toBe(antes);
    expect(p.widget.complementos).toMatchObject({ estado: 'ok', pedidos: t.pedidos, atendimentos: t.clientes, ticketMedioCentavos: t.ticketMedioCentavos });
    expect(p.widget.complementos?.aviso).toContain('não representam pessoas únicas');
    expect(p.widget.complementos?.ticketMedioCentavos).not.toBe(20000);
    expect(p.widget.valor.valor).toBe(t.valorCentavos); expect(p.diario.totalCentavos).toBe(t.valorCentavos);
  });

  it('leitura única prevalente ignora a conferência humana sem dupla soma em pedidos/atendimentos/ticket', async () => {
    const m = await ler(a, ids.integrada); const t = m.lojas[0].total;
    expect(m.temIntegracao).toBe(true);
    expect(m.lojas[0].dias[27].canais.LOJA).toMatchObject({ fonte: 'INTEGRACAO', valorCentavos: 10000, pedidos: 2, clientes: 6, conferencia: { valorCentavos: 900000, pedidos: 900, clientes: 900 } });
    expect(t).toEqual({ valorCentavos: 100000, pedidos: 5, clientes: 11, ticketMedioCentavos: 20000 });
    const p = faturamentoAnalitico({ estado: 'lido', dados: m }, contexto(ids.integrada))!;
    expect(p.widget.complementos).toMatchObject({ pedidos: 5, atendimentos: 11, ticketMedioCentavos: 20000 });
    expect(JSON.stringify(p)).not.toMatch(/900000|conferencia|origemRef|fixture-home/);
  });

  it('ausência, zero declarado, arredondamento real de ticket a zero e mês parcial permanecem distintos', async () => {
    const projetar = async (id: string) => faturamentoAnalitico({ estado: 'lido', dados: await ler(a, id) }, contexto(id))!;
    const vazia = await projetar(ids.vazia);
    expect(vazia.widget).toMatchObject({ estado: 'sem_dados', valor: { valor: null }, complementos: { estado: 'sem_dados', pedidos: null, atendimentos: null, ticketMedioCentavos: null } });
    const z = await projetar(ids.zero);
    expect(z.widget).toMatchObject({ estado: 'ok', valor: { valor: 0 }, complementos: { estado: 'ok', pedidos: 0, atendimentos: 0, ticketMedioCentavos: null } });
    const arred = await projetar(ids.arredondamento);
    expect(arred.widget).toMatchObject({ estado: 'ok', valor: { valor: 1 }, complementos: { estado: 'ok', pedidos: 3, atendimentos: 3, ticketMedioCentavos: 0 } });
    const parcial = await projetar(ids.parcial);
    expect(parcial.widget.estado).toBe('parcial'); expect(parcial.widget.cobertura!.faltasDeFaturamento).toBeGreaterThan(0);
    expect(parcial.widget.complementos).toMatchObject({ estado: 'parcial', pedidos: 1, atendimentos: 2, ticketMedioCentavos: 10000 });
    expect(parcial.widget.complementos?.aviso).toContain('lançamentos informados');
  });

  it('loja A/B, outro parceiro, gate de leitura e base N1 não ampliam nem misturam valores', async () => {
    const ma = await ler(a, ids.principal); const mb = await ler(b, ids.b);
    const outro = await ler(a, ids.outra);
    expect(faturamentoAnalitico({ estado: 'lido', dados: outro }, contexto(ids.outra))!.widget.complementos).toMatchObject({ pedidos: 77, atendimentos: 88 });
    const bWidget = faturamentoAnalitico({ estado: 'lido', dados: mb }, contexto(ids.b))!.widget;
    expect(bWidget.complementos).toMatchObject({ pedidos: 7, atendimentos: 9 });
    expect(JSON.stringify(bWidget)).not.toContain('25000');
    const fora = await ler(a, ids.outra, dono([ids.principal])); expect(fora.lojas).toEqual([]);
    const cruzado = await ler(b, ids.principal, dono()); expect(cruzado.lojas).toEqual([]);
    const sem = { ...dono([ids.principal]), permissoes: new Set<never>() };
    expect(faturamentoAnalitico({ estado: 'lido', dados: ma }, contexto(ids.principal, sem))).toBeNull();
    expect(faturamentoAnalitico({ estado: 'lido', dados: mb }, contexto(ids.principal))!.widget).toMatchObject({ estado: 'indisponivel', valor: { valor: null }, complementos: { pedidos: null, atendimentos: null, ticketMedioCentavos: null } });
    const n1 = faturamentoAnalitico({ estado: 'lido', dados: ma }, contexto(ids.principal, dono([ids.principal]), '/rodolfo/erp/casa-a'))!;
    expect(n1.widget.detalhe.href).toBe('/rodolfo/erp/casa-a/faturamento?mes=2026-10&loja=' + ids.principal);
    expect(n1.widget.complementos).toMatchObject({ pedidos: 4, atendimentos: 8, ticketMedioCentavos: 25000 });
  });
});
