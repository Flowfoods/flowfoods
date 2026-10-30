/** Rodada 7: projeção Home comparada ao DRE real e à fotografia vigente.
 * Somente banco local explícito em ERP_DB_TESTE; execução centralizada pelo root.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { salvarMetasPorCategoria, situacaoDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { fecharPeriodo, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { cmvDaHome } from '@/lib/erp/home-cmv';
import { BRT, faturamento, nota } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const SETEMBRO = '2026-09-15';
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const consulta = '2026-10-29T15:00:00.000Z';

describe.skipIf(!URL_TESTE)('Home CMV · comparação canônica e fotografia no Postgres local', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let lojaId: string;
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);
  const leitura = (data = SETEMBRO) => dreDoPeriodo(a, dono, { tipo: 'loja', lojaId }, data, HOJE);
  const adaptar = (d: DreDoPeriodo) => cmvDaHome({ estado: 'lido', dre: d }, { alcance: dono, loja: { id: lojaId, nome: 'Nome atual da loja' }, raiz: '/erp', consultadoEm: consulta })!;
  const rede = async (valor: string, hoje: string) => {
    const situacao = await situacaoDasMetas(a, dono, hoje);
    const r = await salvarMetas(a, dono, { valores: { cmv: valor }, versao: situacao!.versao }, 'Teste meta Home', hoje);
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  const propria = async (valor: string, hoje: string) => {
    const situacao = await situacaoDasMetasPorCategoria(a, dono, lojaId, hoje);
    const r = await salvarMetasPorCategoria(a, dono, { lojaId, versao: situacao!.versao, segue: false, total: valor, campos: {} }, 'Teste meta Home', hoje);
    if (!r.ok) throw new Error(JSON.stringify(r));
  };

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const A = await db.parceiroFlow.create({ data: { nome: 'Meta Home A', slug: 'meta-home-a-' + sufixo, status: 'ATIVO' } });
    parceiros.push(A.id); a = doParceiro(A.id, db);
    const B = await db.parceiroFlow.create({ data: { nome: 'Meta Home B', slug: 'meta-home-b-' + sufixo, status: 'ATIVO' } });
    parceiros.push(B.id); b = doParceiro(B.id, db);
    const loja = await cadastrarLoja(a, { nome: 'Loja da fotografia' }, 'Teste meta Home');
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    lojaId = loja.id;
    await a.loja.update({ where: { id: lojaId }, data: { criadoEm: new Date('2026-01-01T12:00:00.000Z') } });
    const canais = await salvarCanaisDaLoja(a, lojaId, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Teste meta Home');
    if (!canais.ok) throw new Error(JSON.stringify(canais));
    await faturamento(a, lojaId, 'LOJA', '2026-09-01', '2026-09-30', { '2026-09-10': 1000 });
    const insumo = await cadastrarInsumoDeTeste(a, { nome: 'Muçarela meta Home', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    await nota(a, insumo.id, { lojaId, numero: 'META-1', data: '2026-09-10', centavos: 40_000, lancadaEm: BRT('2026-09-10', '12:00') });
    await rede('30', SETEMBRO);
  });

  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, parceiros);
    await db?.$disconnect();
  });

  it('equivale à mesma leitura: meta rede 30%, própria 35%, fotografia 35% após mudar configuração atual', async () => {
    const vivoRede = (await leitura())!;
    const wRede = adaptar(vivoRede);
    expect(wRede.valor.valor).toBe(40_000);
    expect(wRede.comparacaoComMeta).toMatchObject({ estado: 'com_meta', metaBp: 3000, metaCentavos: 30_000, desvioBp: 1000, origemDaMeta: 'rede' });
    expect(wRede.comparacaoComMeta?.farol).toEqual(vivoRede.farol.porLinha.cmv);

    await propria('35', SETEMBRO);
    const vivoLoja = (await leitura())!;
    expect(vivoLoja.metas.cmv.metaBp).toBe(3500);
    const wLoja = adaptar(vivoLoja);
    expect(wLoja.comparacaoComMeta).toMatchObject({ metaBp: 3500, metaCentavos: 35_000, desvioBp: 500, origemDaMeta: 'loja' });
    expect(wLoja.comparacaoComMeta?.farol).toEqual(vivoLoja.farol.porLinha.cmv);

    const situacao = await situacaoDoFechamento(a, ALCANCE_FLOWFOODS, '2026-09-01', HOJE);
    expect(situacao?.condicoes?.duras).toEqual([]);
    const r = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01',
      ressalvas: situacao!.condicoes!.ressalvas.map((x) => x.id), justificativa: 'Fechamento sintético para provar a fotografia da meta.',
      impressao: situacao!.condicoes!.impressao }, 'Teste meta Home', HOJE);
    expect(r.ok).toBe(true);
    const dFoto = (await leitura())!;
    expect(dFoto.status).toBe('FECHADO');
    const wFoto = adaptar(dFoto);
    expect(wFoto.comparacaoComMeta).toMatchObject({ metaBp: 3500, origemDaMeta: 'fotografia', versaoDasFaixas: dFoto.farol.versaoDasFaixas });
    expect(wFoto.comparacaoComMeta?.farol).toEqual(dFoto.farol.porLinha.cmv);
    expect(wFoto.valor).toEqual(wLoja.valor);
    expect(wFoto.percentual).toEqual(wLoja.percentual);

    // Configuração atual divergente não reconstrói o passado fotografado.
    await rede('80', HOJE); await propria('12', HOJE);
    await a.loja.update({ where: { id: lojaId }, data: { nome: 'Nome atual diferente' } });
    const depois = (await leitura())!;
    expect(depois.metas.cmv.metaBp).toBe(3500);
    expect(adaptar(depois).comparacaoComMeta).toEqual(wFoto.comparacaoComMeta);
    expect(adaptar(depois).origem).toEqual(wFoto.origem);
  });

  it('meta própria zero é distinta de apagar a meta, sempre equivalendo à comparação do DRE', async () => {
    await rede('0', HOJE); await propria('', HOJE);
    const zero = (await leitura(HOJE))!;
    expect(zero.metas.cmv.metaBp).toBe(0);
    const wZero = adaptar(zero);
    expect(wZero.comparacaoComMeta).toMatchObject({ estado: 'com_meta', metaBp: 0, desvioBp: zero.metas.cmv.desvioBp, semComparacao: zero.metas.cmv.semComparacao });
    expect(wZero.comparacaoComMeta?.farol).toEqual(zero.farol.porLinha.cmv);
    await rede('', HOJE);
    const sem = (await leitura(HOJE))!;
    expect(sem.metas.cmv).toBeUndefined();
    expect(adaptar(sem).comparacaoComMeta).toMatchObject({ estado: 'sem_meta', metaBp: null, farol: null });
  });

  it('cliente de outro parceiro e alcance sem a loja não recebem o DRE nem a comparação', async () => {
    expect(await dreDoPeriodo(b, dono, { tipo: 'loja', lojaId }, SETEMBRO, HOJE)).toBeNull();
    const d = (await leitura())!;
    expect(cmvDaHome({ estado: 'lido', dre: d }, { alcance: { ...dono, lojas: [], permissoes: new Set(['dre.ver']) },
      loja: { id: lojaId, nome: 'Nome atual da loja' }, raiz: '/erp', consultadoEm: consulta })).toBeNull();
  });
});
