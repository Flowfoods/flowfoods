/**
 * ERP 2.5 · orçamento de compra ao vivo (Postgres real).
 *
 * Casa Orçamento, hoje 21/10/2026 (quarta), meta do CMV 30 % (vigente desde 01/10):
 *  - Vila da Penha (Loja + iFood): R$ 700,00 + R$ 300,00 por dia, sábado 3×. Outubro previsto R$ 41.000,00 (vendido até ontem R$ 26.000,00).
 *    Notas de outubro: 10/10 R$ 8.000,00 + R$ 100,00 de frete e 21/10 (hoje) R$ 1.900,00 = R$ 10.000,00. A cancelada (R$ 5.000,00) e a de
 *    setembro (R$ 3.000,00) não contam. Teto R$ 12.300,00, cabe R$ 2.300,00. Ritmo: R$ 8.100,00 ÷ R$ 26.000,00 = 31,2 % → amarelo.
 *  - Delivery (Delivery próprio): R$ 500,00 por dia, sábado 3×. Previsto R$ 20.500,00, teto R$ 6.150,00, nota de 05/10 R$ 2.000,00: cabe R$ 4.150,00.
 *  - Rede: teto R$ 18.450,00 − R$ 12.000,00 = R$ 6.450,00.
 * Cobre: a conta com o banco, quem vê o quê (dona, gerente da loja, comprador sem `dre.ver`, operador, loja fora do alcance), o isolamento
 * entre parceiros, a prévia e o aviso da nota (passa e é lançada igual; edição sem contar a versão gravada; comprador arredondado), a loja sem
 * faturamento suficiente deixando a rede sem número, e a página de verdade (o HTML do comprador sem receita).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-orcamento.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({
  ctx: null as null | (() => unknown),
  visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/compras/orcamento',
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1]) => {
      if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO');
    },
    visaoDaRequisicao: async () => ({ visao: atual.visao, lojas: [] }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { salvarCanaisDaLoja } from '@/lib/erp/faturamento';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { cadastrarFornecedor, cancelarNota, lancarNota, obterNota, previaDaNota } from '@/lib/erp/compras';
import type { EntradaDaNota } from '@/lib/erp/compra-campos';
import { salvarMetas, situacaoDasMetas } from '@/lib/erp/dre-metas';
import { orcamentoDaNotaLancada, orcamentoDeCompra, type OrcamentoDeCompra, type VistaCompleta } from '@/lib/erp/orcamento';
import { MOTIVO_SEM_META, tetoArredondado } from '@/lib/erp/orcamento-campos';
import type { VistaResumida } from '@/lib/erp/orcamento';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { somarDias } from '@/lib/erp/contagem-campos';
import ErpOrcamentoPage from '@/app/erp/compras/orcamento/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { BRT, nota, R, sp } from './erp-cmv-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-21';
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sabado = (iso: string) => dia(iso).getUTCDay() === 6;

describe.skipIf(!URL_TESTE)('ERP 2.5 · orçamento de compra (Postgres real)', { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `o${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let B: { id: string };
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const criados: string[] = [];

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  /** O comprador da rede: vê e lança nota, vê insumos; NÃO vê faturamento nem DRE. */
  const COMPRADOR = () => propria(['compras.ver', 'compras.lancar', 'insumos.ver', 'lojas.ver'], 'rede');
  const COMPRADOR_VP = () => propria(['compras.ver', 'compras.lancar', 'insumos.ver', 'lojas.ver'], [ids.vp]);
  /** Vê faturamento mas não o DRE: também não recebe a conta (a meta é do DRE). */
  const SO_FATURAMENTO = () => propria(['compras.ver', 'faturamento.ver', 'lojas.ver'], 'rede');

  const orc = (al: Alcance, lojaId?: string, cliente = () => a) => orcamentoDeCompra(cliente(), al, { lojaId, hoje: HOJE });
  const loja = (o: OrcamentoDeCompra, id: string) => o.lojas.find((l) => l.lojaId === id)!;
  const completa = (v: unknown) => v as VistaCompleta;
  const json = (x: unknown) => JSON.stringify(x);

  /** Faturamento lançado em todos os dias de `de` a `ate` (sábado 3×), um grão por canal. */
  const faturar = (cliente: ClienteDoParceiro, lojaId: string, de: string, ate: string, porCanal: Partial<Record<'LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', number>>) =>
    cliente.transacao(async (tx) => {
      const linhas = [];
      for (let d = de; d <= ate; d = somarDias(d, 1)) {
        for (const [canal, v] of Object.entries(porCanal) as ['LOJA' | 'DELIVERY_PROPRIO' | 'IFOOD', number][]) {
          const valor = R(sabado(d) ? v * 3 : v);
          linhas.push({ parceiroId: tx.parceiroId, lojaId, canal, data: dia(d), valorCentavos: valor, pedidos: 10, clientes: 10, origem: 'MANUAL' as const, chaveIdempotencia: `manual:${lojaId}:-:${canal}:${d}`, atualizadoPorNome: 'Marina' });
        }
      }
      await tx.faturamentoLancamento.createMany({ data: linhas });
    });

  const entradaDaNota = (p: Partial<EntradaDaNota> & { valor: string }): EntradaDaNota => ({
    lojaId: ids.vp,
    fornecedorId: ids.fornecedor,
    numero: `N-${globalThis.crypto.randomUUID().slice(0, 6)}`,
    serie: '',
    data: HOJE,
    frete: '',
    total: p.valor,
    itens: [{ insumoId: ids.insumo, embalagem: 'padrao', quantidade: '1', valor: p.valor }],
    ...p,
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Casa Orçamento', slug: `orc-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = await db.parceiroFlow.create({ data: { nome: 'Casa Vizinha', slug: `orcb-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id, B.id);
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome, canais] of [
      ['vp', 'Vila da Penha', ['LOJA', 'IFOOD']],
      ['dl', 'Delivery', ['DELIVERY_PROPRIO']],
    ] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      expect((await salvarCanaisDaLoja(a, r.id, [...canais], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
    }
    const rb = await cadastrarLoja(b, { nome: 'Vizinha Centro' }, 'Bia');
    if (!rb.ok) throw new Error(JSON.stringify(rb));
    ids.lojaB = rb.id;
    expect((await salvarCanaisDaLoja(b, rb.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Bia')).ok).toBe(true);

    await faturar(a, ids.vp, '2026-09-01', '2026-10-20', { LOJA: 700, IFOOD: 300 });
    await faturar(a, ids.dl, '2026-09-01', '2026-10-20', { DELIVERY_PROPRIO: 500 });
    await faturar(b, ids.lojaB, '2026-09-01', '2026-10-20', { LOJA: 9_000 });

    const insumo = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Carne moída', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'SECO' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    ids.insumo = insumo.id;
    const forn = await cadastrarFornecedor(a, { nome: 'Frigorífico Penha' }, 'Marina');
    if (!forn.ok) throw new Error(JSON.stringify(forn));
    ids.fornecedor = forn.id;
    const insumoB = await cadastrarInsumo(b, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Queijo', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'SECO' });
    if (!insumoB.ok) throw new Error(JSON.stringify(insumoB));

    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'VP-1', data: '2026-10-10', centavos: R(8_000), frete: R(100), lancadaEm: BRT('2026-10-10', '10:00') });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'VP-2', data: '2026-10-21', centavos: R(1_900), lancadaEm: BRT('2026-10-21', '09:00') });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'VP-X', data: '2026-10-12', centavos: R(5_000), lancadaEm: BRT('2026-10-12', '09:00'), status: 'CANCELADA' });
    await nota(a, ids.insumo, { lojaId: ids.vp, numero: 'VP-S', data: '2026-09-28', centavos: R(3_000), lancadaEm: BRT('2026-09-28', '09:00') });
    await nota(a, ids.insumo, { lojaId: ids.dl, numero: 'DL-1', data: '2026-10-05', centavos: R(2_000), lancadaEm: BRT('2026-10-05', '09:00') });
    // A vizinha compra muito: nada disso pode aparecer na Casa Orçamento.
    await nota(b, insumoB.id, { lojaId: ids.lojaB, numero: 'B-1', data: '2026-10-11', centavos: R(77_777), lancadaEm: BRT('2026-10-11', '09:00') });

    const versao = (await situacaoDasMetas(a, DONA(), HOJE))!.versao;
    expect(await salvarMetas(a, DONA(), { valores: { cmv: '30' }, versao }, 'Marina', HOJE)).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (db) await limparParceiros(db, perfil, criados);
    await db?.$disconnect();
  });

  // ================================================================ a conta
  describe('a conta com o banco', () => {
    it('Vila da Penha: R$ 41.000,00 previstos × 30 % = R$ 12.300,00 − R$ 10.000,00 = cabe R$ 2.300,00 (cancelada e setembro fora)', async () => {
      const o = (await orc(DONA()))!;
      expect(o.periodo).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
      expect(o.dia).toEqual({ dia: 21, de: 31 });
      expect(o.metaBp).toBe(3000);
      const vp = completa(loja(o, ids.vp).vista);
      expect(vp.veReceita).toBe(true);
      expect(vp.conta).toEqual({ previstaCentavos: R(41_000), metaBp: 3000, tetoCentavos: R(12_300), compradoCentavos: R(10_000), saldoCentavos: R(2_300) });
      expect(vp.previsao).toMatchObject({ realizadoCentavos: R(26_000), projetadoCentavos: R(15_000), diasCompletos: 20, diasSemLancamento: 0, diasRestantes: 11 });
      // Ritmo: R$ 8.100,00 até ontem ÷ R$ 26.000,00 = 31,2 % contra 30 %: +1,2 pp, amarelo.
      expect(vp.compradoAteOntemCentavos).toBe(R(8_100));
      expect(vp.cmvAteOntemBp).toBe(3115);
      expect(vp.ritmo).toMatchObject({ tipo: 'cor', cor: 'AMARELO', desvioTexto: '+1,2\u00a0pp' });
    });

    it('Delivery e a rede: cabe R$ 4.150,00 e R$ 6.450,00; o ritmo da rede é a soma das compras sobre a soma da receita', async () => {
      const o = (await orc(DONA()))!;
      expect(completa(loja(o, ids.dl).vista).conta).toEqual({ previstaCentavos: R(20_500), metaBp: 3000, tetoCentavos: R(6_150), compradoCentavos: R(2_000), saldoCentavos: R(4_150) });
      const rede = completa(o.rede);
      expect(rede.conta).toEqual({ previstaCentavos: R(61_500), metaBp: 3000, tetoCentavos: R(18_450), compradoCentavos: R(12_000), saldoCentavos: R(6_450) });
      // R$ 10.100,00 ÷ R$ 39.000,00 = 25,9 %: −4,1 pp, azul (e "confira se está tudo lançado").
      expect(rede.ritmo).toMatchObject({ tipo: 'cor', cor: 'AZUL', confira: 'confira se está tudo lançado' });
    });

    it('a outra casa não entra: a Vizinha vê só a dela e sem meta fica sem número', async () => {
      const ob = (await orcamentoDeCompra(b, DONA(), { hoje: HOJE }))!;
      expect(ob.lojas.map((l) => l.lojaId)).toEqual([ids.lojaB]);
      expect(completa(ob.lojas[0].vista)).toMatchObject({ conta: null, motivo: MOTIVO_SEM_META, compradoCentavos: R(77_777) });
      expect(json(ob)).not.toContain(ids.vp);
      // Pedir a loja da Casa Orçamento pelo portão da Vizinha não traz nada (o portão não enxerga a loja).
      const cruzado = await orcamentoDeCompra(b, DONA(), { lojaId: ids.vp, hoje: HOJE });
      expect(cruzado?.lojas ?? []).toEqual([]);
      expect(json(await orc(DONA()))).not.toContain('7777700');
    });
  });

  // ================================================================ quem vê o quê
  describe('quem vê o quê', () => {
    it('o comprador sem dre.ver recebe só o "cabe" pelo TETO arredondado para baixo (R$ 12.300,00 → R$ 12.000,00): sem receita, meta, teto, já comprado nem farol', async () => {
      const o = (await orc(COMPRADOR()))!;
      expect(o.metaBp).toBeNull();
      expect(loja(o, ids.vp).vista).toEqual({ veReceita: false, saldoCentavos: R(2_000), motivo: null, diasSemLancamento: 0, semNota: [], quemPassou: [] });
      expect(loja(o, ids.dl).vista).toEqual({ veReceita: false, saldoCentavos: R(4_000), motivo: null, diasSemLancamento: 0, semNota: [], quemPassou: [] });
      // A rede é a soma dos tetos arredondados das lojas: bate com o "Por loja" (R$ 2.000,00 + R$ 4.000,00).
      expect(o.rede).toEqual({ veReceita: false, saldoCentavos: R(6_000), motivo: null, diasSemLancamento: 0, semNota: [], quemPassou: [] });
      const texto = json(o);
      for (const proibido of [String(R(41_000)), String(R(26_000)), String(R(12_300)), String(R(61_500)), String(R(10_000)), '"metaBp":3000', 'previsao', 'ritmo', 'conta']) expect(texto).not.toContain(proibido);
    });

    it('quem vê faturamento mas não o DRE também não recebe a conta (a meta é do DRE)', async () => {
      const o = (await orc(SO_FATURAMENTO()))!;
      expect(o.lojas.every((l) => !l.vista.veReceita)).toBe(true);
      expect(o.rede?.veReceita).toBe(false);
    });

    it('o gerente da Vila da Penha recebe só a loja dele, com a conta (tem dre.ver), e nenhuma linha da rede', async () => {
      const o = (await orc(GERENTE_VP()))!;
      expect(o.lojas.map((l) => l.nome)).toEqual(['Vila da Penha']);
      expect(o.rede).toBeNull();
      expect(completa(o.lojas[0].vista).conta?.saldoCentavos).toBe(R(2_300));
      expect(json(o)).not.toContain(String(R(20_500)));
      expect(json(o)).not.toContain(ids.dl);
    });

    it('o comprador de uma loja não abre a outra; o operador não vê o orçamento', async () => {
      expect(await orc(COMPRADOR_VP(), ids.dl)).toBeNull();
      expect(await orc(GERENTE_VP(), ids.dl)).toBeNull();
      expect(await orc(OPERADOR())).toBeNull();
      const so = (await orc(COMPRADOR_VP()))!;
      expect(so.lojas.map((l) => l.lojaId)).toEqual([ids.vp]);
      expect(so.rede).toBeNull();
    });

    it('o nível 1 vê a conta inteira pelo portão do parceiro', async () => {
      const o = (await orc(ALCANCE_FLOWFOODS))!;
      expect(completa(o.rede).conta?.saldoCentavos).toBe(R(6_450));
    });
  });

  // ================================================================ a página de verdade
  describe('a página', () => {
    const como = (al: Alcance, visao: { tipo: string; lojaId?: string; nome?: string } = { tipo: 'rede' }) => {
      atual.visao = visao;
      atual.ctx = () => ({ parceiro: A, alcance: al, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Teste' } });
    };
    const html = async () => sp(renderToStaticMarkup((await ErpOrcamentoPage()) as ReactElement));

    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
    });
    afterAll(() => {
      vi.useRealTimers();
    });

    it('a dona vê a conta por extenso e o farol do ritmo', async () => {
      como(DONA());
      const h = await html();
      expect(h).toContain('Orçamento de compra');
      expect(h).toContain('R$ 6.450,00');
      expect(h).toContain('Receita prevista');
      expect(h).toContain('R$ 41.000,00');
      expect(h).toContain('Ritmo das compras até ontem');
    });

    it('o HTML do comprador não leva receita, meta, teto nem já comprado', async () => {
      como(COMPRADOR());
      const h = await html();
      expect(h).toContain('R$ 6.000,00');
      expect(h).toContain('Valor aproximado, sempre para menos');
      expect(h).toContain('cabe no limite seguro');
      for (const p of ['orçamento de compra de', 'passou do orçamento', 'teto']) expect(h, p).not.toContain(p);
      for (const proibido of ['Receita prevista', 'R$ 41.000,00', 'R$ 61.500,00', 'R$ 18.450,00', 'R$ 12.300,00', 'Meta do CMV', '30,0 %', 'Ritmo', 'Já comprado', 'Teto']) expect(h, proibido).not.toContain(proibido);
    });

    it('o operador não abre a página', async () => {
      como(OPERADOR(), { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' });
      await expect(ErpOrcamentoPage()).rejects.toThrow('SEM_ACESSO');
    });
  });

  // ================================================================ a nota: aviso, nunca bloqueio
  describe('a nota avisa e não bloqueia', () => {
    it('nota de outro período: a prévia diz que o orçamento é só do período em curso', async () => {
      const p = await previaDaNota(a, DONA(), entradaDaNota({ valor: '100,00', data: '2026-09-29' }), undefined, HOJE);
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.previa.orcamento).toEqual({ tipo: 'fora', periodoNome: expect.any(String) });
    });

    it('a prévia de R$ 3.000,00 na Penha: cabe R$ 2.300,00, com a nota passa R$ 700,00; lançar entra igual e o detalhe avisa', async () => {
      const entrada = entradaDaNota({ valor: '3.000,00', numero: 'GRANDE-1' });
      const p = await previaDaNota(a, DONA(), entrada, undefined, HOJE);
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.previa.orcamento).toEqual({ tipo: 'conta', lojaNome: 'Vila da Penha', periodoNome: expect.any(String), impacto: { antesCentavos: R(2_300), depoisCentavos: -R(700), passa: true, arredondado: false }, semNota: false, defineMetas: true });

      const r = await lancarNota(a, DONA(), entrada, 'Marina');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      ids.grande = r.id;
      const depois = await orcamentoDaNotaLancada(a, DONA(), { lojaId: ids.vp, entradaEm: HOJE, cancelada: false }, HOJE);
      expect(depois).toMatchObject({ tipo: 'conta', impacto: { depoisCentavos: -R(700), passa: true } });
      expect(completa(loja((await orc(DONA()))!, ids.vp).vista).conta?.saldoCentavos).toBe(-R(700));
    });

    it('editar a nota: a prévia não conta a versão gravada dela duas vezes', async () => {
      const n = (await obterNota(a, DONA(), ids.grande))!;
      const p = await previaDaNota(a, DONA(), { ...entradaDaNota({ valor: '3.000,00', numero: 'GRANDE-1' }), versao: n.versao } as EntradaDaNota, ids.grande, HOJE);
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.previa.orcamento).toMatchObject({ tipo: 'conta', impacto: { antesCentavos: R(2_300), depoisCentavos: -R(700) } });
    });

    it('o comprador vê a prévia pelo teto arredondado (R$ 12.000,00 − R$ 13.000,00 = passou R$ 1.000,00)', async () => {
      const p = await previaDaNota(a, COMPRADOR(), entradaDaNota({ valor: '50,00' }), undefined, HOJE);
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.previa.orcamento).toMatchObject({ tipo: 'conta', impacto: { antesCentavos: -R(1_000), depoisCentavos: -R(1_050), passa: true, arredondado: true } });
      expect(json(p.previa.orcamento)).not.toContain(String(R(12_300)));
    });

    it('o comprador de uma loja não recebe orçamento da nota de outra (a nota nem passa da leitura)', async () => {
      const p = await previaDaNota(a, COMPRADOR_VP(), entradaDaNota({ valor: '10,00', lojaId: ids.dl }), undefined, HOJE);
      expect(p.ok).toBe(false);
    });
  });

  // ================================================================ os ataques do Guardião (1ª rodada), refeitos pelo comprador
  describe('o comprador não acha o centavo do teto (decisão 213)', () => {
    const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

    it('ataque 1: prévias de EDIÇÃO de cada nota do mês só devolvem o teto arredondado (R$ 12.000,00), nunca o real (R$ 12.300,00)', async () => {
      const dona = completa(loja((await orc(DONA()))!, ids.vp).vista);
      const comprado = dona.compradoCentavos;
      const notas = await a.notaEntrada.findMany({ where: { lojaId: ids.vp, status: 'LANCADA', entradaEm: { gte: dia('2026-10-01') } }, select: { id: true, totalCentavos: true } });
      expect(notas.length).toBeGreaterThanOrEqual(3);
      const tetos = new Set<number>();
      for (const n of notas) {
        const p = await previaDaNota(a, COMPRADOR(), entradaDaNota({ valor: '1,00' }), n.id, HOJE);
        if (!p.ok) throw new Error(JSON.stringify(p));
        const o = p.previa.orcamento!;
        if (o.tipo !== 'conta') throw new Error(o.tipo);
        // O que o comprador consegue tirar: antes + (já comprado − valor gravado da nota) = o teto que ele vê.
        tetos.add(o.impacto.antesCentavos + comprado - n.totalCentavos);
      }
      expect([...tetos]).toEqual([tetoArredondado(R(12_300))]);
      expect([...tetos]).toEqual([R(12_000)]);
    });

    it('ataque 2: lançar notas de valores escolhidos e ler o detalhe (e cancelar) não muda o teto que ele vê', async () => {
      const tetos = new Set<number>();
      for (const valor of [1, 99, 4_321, 9_999]) {
        const r = await lancarNota(a, COMPRADOR(), entradaDaNota({ valor: reais(valor) }), 'Comprador');
        if (!r.ok) throw new Error(JSON.stringify(r));
        const det = await orcamentoDaNotaLancada(a, COMPRADOR(), { lojaId: ids.vp, entradaEm: HOJE, cancelada: false }, HOJE);
        if (det?.tipo !== 'conta') throw new Error(String(det?.tipo));
        const comprado = completa(loja((await orc(DONA()))!, ids.vp).vista).compradoCentavos;
        tetos.add(det.impacto.depoisCentavos + comprado);
        const c = await cancelarNota(a, COMPRADOR(), r.id, 'digitada errada', 'Comprador');
        if (!c.ok) throw new Error(JSON.stringify(c));
      }
      expect([...tetos]).toEqual([R(12_000)]);
    });
  });

  // ================================================================ a loja que abriu no meio e a loja sem nota
  describe('loja nova e loja sem nota', () => {
    it('loja que abriu em 05/10: os dias 01 a 04 não existem (nem vendido, nem pela média, nem "sem lançamento")', async () => {
      const r = await cadastrarLoja(a, { nome: 'Nova' }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids.nova = r.id;
      expect((await salvarCanaisDaLoja(a, r.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
      await faturar(a, ids.nova, '2026-10-05', '2026-10-20', { LOJA: 1_000 });
      await nota(a, ids.insumo, { lojaId: ids.nova, numero: 'NV-1', data: '2026-10-06', centavos: R(1_000), lancadaEm: BRT('2026-10-06', '10:00') });
      const v = completa((await orc(DONA(), ids.nova))!.lojas[0].vista);
      expect(v.previsao).toMatchObject({ diasAntesDeAbrir: 4, diasSemLancamento: 0, diasCompletos: 16, realizadoCentavos: R(20_000), previstaCentavos: R(35_000) });
      expect(v.diasSemLancamento).toBe(0);
      expect(((await orc(COMPRADOR(), ids.nova))!.lojas[0].vista as VistaResumida).diasSemLancamento).toBe(0);
      await a.loja.update({ where: { id: ids.nova }, data: { ativa: false } });
    });

    it('loja que vendeu e não tem nota: "sem nota de compra" para a dona e para o comprador, e na rede', async () => {
      const r = await cadastrarLoja(a, { nome: 'Sem Nota' }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids.semNota = r.id;
      expect((await salvarCanaisDaLoja(a, r.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
      await faturar(a, r.id, '2026-09-01', '2026-10-20', { LOJA: 1_000 });
      const d = (await orc(DONA()))!;
      expect(completa(loja(d, r.id).vista)).toMatchObject({ compradoCentavos: 0, semNota: ['Sem Nota'] });
      expect(completa(d.rede).semNota).toEqual(['Sem Nota']);
      const c = (await orc(COMPRADOR()))!;
      expect(loja(c, r.id).vista).toMatchObject({ veReceita: false, semNota: ['Sem Nota'] });
      expect((c.rede as VistaResumida).semNota).toEqual(['Sem Nota']);
      await a.loja.update({ where: { id: r.id }, data: { ativa: false } });
    });

    it('a rede diz quem passou: a sobra de uma loja não cobre a outra (dona exato, comprador pelo teto arredondado)', async () => {
      const d = (await orc(DONA()))!;
      // A Penha passou R$ 700,00 (nota de R$ 3.000,00 acima); o Delivery cabe R$ 4.150,00; a rede ainda "cabe" R$ 3.450,00.
      expect(completa(d.rede).conta?.saldoCentavos).toBe(R(3_450));
      expect(d.rede!.quemPassou.map((q) => [q.nome, q.passouCentavos])).toEqual([['Vila da Penha', R(700)]]);
      const c = (await orc(COMPRADOR()))!;
      expect(c.rede!.quemPassou.map((q) => [q.nome, q.passouCentavos])).toEqual([['Vila da Penha', R(1_000)]]);
      // Para o comprador, a frase é do limite seguro (a conta exata pode ter folga): nunca "já passou".
      expect(c.rede!.quemPassou[0].frase.replace(/\u00a0/g, ' ')).toBe('Vila da Penha está acima do limite seguro em R$ 1.000,00');
    });
  });

  // ================================================================ cobertura por loja
  describe('cobertura por loja', () => {
    it('uma loja ativa sem 14 dias completos deixa a rede sem número, com o nome dela; as outras seguem com o delas', async () => {
      const r = await cadastrarLoja(a, { nome: 'Centro' }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids.ct = r.id;
      expect((await salvarCanaisDaLoja(a, r.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).ok).toBe(true);
      await faturar(a, ids.ct, '2026-10-12', '2026-10-20', { LOJA: 1_000 });
      const o = (await orc(DONA()))!;
      expect(completa(loja(o, ids.ct).vista)).toMatchObject({ conta: null, motivo: 'poucos dias com faturamento completo nas últimas 4 semanas: 9 de 14 necessários' });
      expect(completa(o.rede)).toMatchObject({ conta: null, motivo: 'sem o orçamento de Centro' });
      expect(completa(loja(o, ids.dl).vista).conta?.saldoCentavos).toBe(R(4_150));
      const c = (await orc(COMPRADOR()))!;
      expect(c.rede).toMatchObject({ veReceita: false, saldoCentavos: null, motivo: 'sem o orçamento de Centro', diasSemLancamento: 0 });
    });

    it('um dia sem o iFood na Penha: o número segue (o dia entra pela média), o ritmo da rede perde a cor', async () => {
      await a.faturamentoLancamento.deleteMany({ where: { lojaId: ids.vp, canal: 'IFOOD', data: dia('2026-10-05') } });
      await a.loja.update({ where: { id: ids.ct }, data: { ativa: false } }); // o Centro sai: a rede volta a ter número
      const o = (await orc(DONA()))!;
      const vp = completa(loja(o, ids.vp).vista);
      expect(vp.conta?.previstaCentavos).toBe(R(41_000));
      expect(vp.previsao).toMatchObject({ diasSemLancamento: 1, realizadoCentavos: R(25_000) });
      expect(vp.ritmo).toMatchObject({ tipo: 'sem', motivo: 'faltam lançamentos de faturamento' });
      expect(completa(o.rede).conta).not.toBeNull();
      expect(completa(o.rede).ritmo).toMatchObject({ tipo: 'sem' });
      expect(o.lojas.map((l) => l.lojaId)).not.toContain(ids.ct);
    });
  });
});
