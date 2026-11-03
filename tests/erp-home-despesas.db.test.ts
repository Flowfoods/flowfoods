/**
 * Despesas da Home no Postgres de verdade: o card é a MESMA conta do DRE da loja, ao centavo.
 *  - Home (painelDoDia) igual aos subtotais do DRE da loja, com linha da casa e linha oculta com valor;
 *  - despesa da rede (sem loja) e dedução fora da loja; a rede é loja A + loja B + a despesa sem loja;
 *  - competência atravessando o mês (15/09 a 14/10): cada período leva só os seus dias;
 *  - período fechado lido da fotografia, que não muda quando a despesa muda depois.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-home-despesas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { criarLinha, ocultarLinha, planoDoParceiro } from '@/lib/erp/plano';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { fecharPeriodo, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import { despesasDaHome, GRUPOS_DAS_DESPESAS_DA_HOME, type WidgetDespesasHome } from '@/lib/erp/home-despesas';
import { faturamento } from './erp-cmv-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const SETEMBRO = '2026-09-15';
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const propria = (permissoes: string[], lojaIds: string[]): Alcance =>
  resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds });

describe.skipIf(!URL_TESTE)('Home · Despesas por competência iguais ao DRE da loja (Postgres local)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let salao: string;
  let delivery: string;
  let atravessa: string;
  let seguro: string;
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);

  const textos = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({
    envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'aluguel', descricao: 'Despesa de teste', valor: '1,00',
    tipo: 'mes', dia: '', mes: '2026-10', de: '', ate: '', recorrente: false, vencimento: '', ...p,
  });
  const lancado = async (p: Partial<TextosDaDespesa>) => {
    const r = await lancarDespesa(a, dono, textos(p), 'Teste Home despesas', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };
  const visao = (lojaId: string, nome: string) => ({ tipo: 'loja' as const, lojaId, nome });
  const daHome = async (lojaId: string, nome: string, alcance: Alcance = dono) => {
    const p = await painelDoDia(a, alcance, '/erp', HOJE, visao(lojaId, nome));
    if (p.analitico?.tipo !== 'loja') throw new Error('Home sem visão de loja');
    return { painel: p, despesas: p.analitico.widgets.find((w) => w.familia === 'despesas') as WidgetDespesasHome | undefined };
  };
  const subtotal = (d: DreDoPeriodo, g: string) => d.resultado.linhas.find((l) => l.chave === `grupo:${g}`)!.valorCentavos!;
  const somaDosOito = (d: DreDoPeriodo) => GRUPOS_DAS_DESPESAS_DA_HOME.reduce((s, g) => s + subtotal(d, g), 0);
  const centavosDe = (w: WidgetDespesasHome, g: string) => w.composicaoPorGrupo!.grupos.find((x) => x.grupo === g)!.centavos;
  const projetar = (d: DreDoPeriodo, lojaId: string) => despesasDaHome({ estado: 'lido', dre: d }, { alcance: dono, loja: { id: lojaId, nome: 'Nome atual' }, raiz: '/erp', hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' })!;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const A = await db.parceiroFlow.create({ data: { nome: 'Despesas Home A', slug: 'despesas-home-a-' + sufixo, status: 'ATIVO' } });
    parceiros.push(A.id); a = doParceiro(A.id, db);
    const B = await db.parceiroFlow.create({ data: { nome: 'Despesas Home B', slug: 'despesas-home-b-' + sufixo, status: 'ATIVO' } });
    parceiros.push(B.id); b = doParceiro(B.id, db);
    for (const nome of ['Loja com salão', 'Loja só delivery']) {
      const loja = await cadastrarLoja(a, { nome }, 'Teste Home despesas');
      if (!loja.ok) throw new Error(JSON.stringify(loja));
      await a.loja.update({ where: { id: loja.id }, data: { criadoEm: new Date('2026-01-01T12:00:00.000Z') } });
      const canais = await salvarCanaisDaLoja(a, loja.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Teste Home despesas');
      if (!canais.ok) throw new Error(JSON.stringify(canais));
      // Setembro inteiro lançado: o fechamento de setembro não tem condição dura.
      await faturamento(a, loja.id, 'LOJA', '2026-09-01', '2026-09-30', { '2026-09-10': 1000 });
      if (nome === 'Loja com salão') salao = loja.id; else delivery = loja.id;
    }
    // Loja com salão: aluguel de outubro, competência 15/09 a 14/10, linha da casa, IPTU anual (depois oculto), recorrente de setembro.
    await lancado({ lojaId: salao, linha: 'aluguel', descricao: 'Aluguel', valor: '3.100,00', mes: '2026-10' });
    atravessa = await lancado({ lojaId: salao, linha: 'internet', descricao: 'Internet 15/09 a 14/10', valor: '300,00', tipo: 'intervalo', de: '15/09/2026', ate: '14/10/2026' });
    const nova = await criarLinha(a, dono, { nome: 'Seguro do ponto', grupo: 'ADMINISTRATIVA' }, 'Teste Home despesas');
    if (!nova.ok) throw new Error(JSON.stringify(nova));
    seguro = nova.id;
    await lancado({ lojaId: salao, linha: `id:${seguro}`, descricao: 'Seguro', valor: '120,00', tipo: 'dia', dia: '10/10/2026' });
    await lancado({ lojaId: salao, linha: 'iptu', descricao: 'IPTU 2026', valor: '3.650,00', tipo: 'intervalo', de: '01/01/2026', ate: '31/12/2026' });
    const iptu = (await planoDoParceiro(a)).find((l) => l.codigo === 'iptu')!;
    const oculta = await ocultarLinha(a, dono, { linha: 'iptu', ocultar: true, versao: iptu.versao }, 'Teste Home despesas');
    if (!oculta.ok) throw new Error(JSON.stringify(oculta));
    await lancado({ lojaId: salao, linha: 'sistemas', descricao: 'Sistema de PDV', valor: '200,00', mes: '2026-09', recorrente: true });
    // DAS que repete todo mês: dedução, fora do card; a falta de outubro não pode deixar o card parcial por ela.
    await lancado({ lojaId: salao, linha: 'impostos', descricao: 'DAS mensal', valor: '450,00', mes: '2026-09', recorrente: true });
    // Fora da loja com salão: dedução (impostos), despesa da rede sem loja e despesa da outra loja.
    await lancado({ lojaId: salao, linha: 'impostos', descricao: 'DAS', valor: '500,00', mes: '2026-10' });
    await lancado({ lojaId: '', linha: 'energia', descricao: 'Energia do escritório', valor: '999,00', mes: '2026-10' });
    await lancado({ lojaId: delivery, linha: 'salarios', descricao: 'Folha delivery', valor: '5.000,00', mes: '2026-10' });
  });

  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, parceiros);
    await db?.$disconnect();
  });

  it('a Home da loja é igual ao DRE da loja ao centavo, com linha da casa e linha oculta com valor', async () => {
    const { painel, despesas: w } = await daHome(salao, 'Loja com salão');
    const d = (await dreDoPeriodo(a, dono, { tipo: 'loja', lojaId: salao }, HOJE, HOJE))!;
    // Até ontem (28/10): aluguel 3.100 × 28/31 = 2.800; internet 14 dias de 30 = 140; seguro 120; IPTU 10/dia × 28 = 280.
    expect(w!.valor.valor).toBe(280_000 + 14_000 + 12_000 + 28_000);
    expect(w!.valor.valor).toBe(somaDosOito(d));
    for (const g of GRUPOS_DAS_DESPESAS_DA_HOME) {
      expect(centavosDe(w!, g), g).toBe(subtotal(d, g));
      const linhas = d.resultado.linhas.filter((l) => l.tipo === 'linha' && l.grupo === g).reduce((s, l) => s + l.valorCentavos!, 0);
      expect(linhas, g).toBe(subtotal(d, g));
    }
    expect(d.resultado.linhas.find((l) => l.chave === `id:${seguro}`)).toMatchObject({ grupo: 'ADMINISTRATIVA', valorCentavos: 12_000 });
    expect(d.resultado.linhas.find((l) => l.codigo === 'iptu')).toMatchObject({ oculta: true, valorCentavos: 28_000 });
    expect(centavosDe(w!, 'OCUPACAO')).toBe(308_000);
    expect(centavosDe(w!, 'UTILIDADES')).toBe(14_000);
    expect(centavosDe(w!, 'ADMINISTRATIVA')).toBe(12_000);
    // Em curso e com a recorrente de setembro ainda sem outubro: parcial, só com a contagem. O DAS que também falta é dedução e não conta.
    expect(d.faltaLancar.map((f) => f.grupo).sort()).toEqual(['ADMINISTRATIVA', 'DEDUCAO']);
    expect(w!.estado).toBe('parcial');
    expect(w!.recorrentesSemLancamento).toBe(1);
    expect(w!.avisos.map((x) => x.codigo)).toEqual(['recorrentes-sem-lancamento', 'periodo-em-curso']);
    expect(w!.referencia).toMatchObject({ base: 'periodo_apuracao', inicio: '2026-10-01', fim: '2026-10-31', apuradoAte: '2026-10-28' });
    expect(w!.origem).toEqual({ fonte: 'dre', modo: 'vivo', fotografia: null });
    expect(w!.detalhe.href).toBe(`/erp/dre?loja=${salao}&periodo=2026-10-01`);
    // CMV e deduções fora: impostos (500 × 28/31 = 451,61) estão na dedução do DRE, não no card.
    expect(subtotal(d, 'DEDUCAO')).toBe(45_161);
    expect(JSON.stringify(w)).not.toMatch(/45161|Sistema de PDV|DAS mensal/);
    expect(painel.cmv?.escopo.lojaId).toBe(salao);
  });

  it('despesa da rede sem loja fica fora da loja: rede = loja com salão + loja delivery + a despesa sem loja', async () => {
    const { despesas: wSalao } = await daHome(salao, 'Loja com salão');
    const { despesas: wDelivery } = await daHome(delivery, 'Loja só delivery');
    const dDelivery = (await dreDoPeriodo(a, dono, { tipo: 'loja', lojaId: delivery }, HOJE, HOJE))!;
    const dRede = (await dreDoPeriodo(a, dono, { tipo: 'rede' }, HOJE, HOJE))!;
    expect(wDelivery!.valor.valor).toBe(451_613); // 5.000 × 28/31
    expect(wDelivery!.valor.valor).toBe(somaDosOito(dDelivery));
    const energiaDaRede = 90_232; // 999 × 28/31
    expect(subtotal(dRede, 'UTILIDADES')).toBe(14_000 + energiaDaRede);
    expect(centavosDe(wSalao!, 'UTILIDADES')).toBe(14_000);
    expect(somaDosOito(dRede)).toBe(wSalao!.valor.valor! + wDelivery!.valor.valor! + energiaDaRede);
    // Quem só lança despesas recebe o marcador, sem nenhum valor; outro parceiro nem lê o DRE.
    const lancador = await daHome(salao, 'Loja com salão', propria(['despesas.lancar', 'lojas.ver'], [salao]));
    expect(lancador.despesas).toMatchObject({ estado: 'indisponivel', valor: { valor: null } });
    expect(lancador.despesas).not.toHaveProperty('composicaoPorGrupo');
    expect(JSON.stringify(lancador.painel)).not.toMatch(/334000|308000|"grupos"/);
    expect(await dreDoPeriodo(b, dono, { tipo: 'loja', lojaId: salao }, HOJE, HOJE)).toBeNull();
  });

  it('competência atravessando o mês divide os dias; setembro fechado é lido da fotografia e não muda depois', async () => {
    const vivo = (await dreDoPeriodo(a, dono, { tipo: 'loja', lojaId: salao }, SETEMBRO, HOJE))!;
    const wVivo = projetar(vivo, salao);
    // Setembro: internet 16 dias de 30 = 160; IPTU 30 dias = 300; sistemas 200.
    expect(wVivo).toMatchObject({ estado: 'ok', valor: { valor: 16_000 + 30_000 + 20_000 }, origem: { modo: 'vivo' } });
    expect(centavosDe(wVivo, 'UTILIDADES') + 14_000).toBe(30_000); // 160 + 140 = os R$ 300,00 da despesa inteira
    expect(wVivo.valor.valor).toBe(somaDosOito(vivo));

    const situacao = await situacaoDoFechamento(a, ALCANCE_FLOWFOODS, '2026-09-01', HOJE);
    expect(situacao?.condicoes?.duras).toEqual([]);
    const r = await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: situacao!.condicoes!.ressalvas.map((x) => x.id),
      justificativa: 'Fechamento sintético para provar a fotografia das despesas.', impressao: situacao!.condicoes!.impressao }, 'Teste Home despesas', HOJE);
    expect(r.ok).toBe(true);
    const foto = (await dreDoPeriodo(a, dono, { tipo: 'loja', lojaId: salao }, SETEMBRO, HOJE))!;
    expect(foto.status).toBe('FECHADO');
    const wFoto = projetar(foto, salao);
    expect(wFoto.origem).toMatchObject({ fonte: 'dre', modo: 'fotografia', fotografia: { id: foto.fechamento!.fotografiaId, versao: foto.fechamento!.versao } });
    expect(wFoto.valor).toEqual(wVivo.valor);
    expect(wFoto.composicaoPorGrupo).toEqual(wVivo.composicaoPorGrupo);
    expect(wFoto.estado).toBe('ok');

    // A despesa muda depois (direto no banco): outubro, ao vivo, acompanha; setembro, fotografado, não.
    await a.despesa.update({ where: { id: atravessa }, data: { valorCentavos: 60_000 } });
    const depois = projetar((await dreDoPeriodo(a, dono, { tipo: 'loja', lojaId: salao }, SETEMBRO, HOJE))!, salao);
    expect(depois.valor).toEqual(wFoto.valor);
    expect(depois.composicaoPorGrupo).toEqual(wFoto.composicaoPorGrupo);
    const { despesas: outubro } = await daHome(salao, 'Loja com salão');
    expect(centavosDe(outubro!, 'UTILIDADES')).toBe(28_000); // 600 × 14/30
  });
});
