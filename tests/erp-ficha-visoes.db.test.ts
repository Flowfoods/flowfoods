import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
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
    visaoDaRequisicao: async () => ({ visao: 'rede' }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpFichaPage from '@/app/erp/fichas/[id]/page';
import ErpFichasPage from '@/app/erp/fichas/page';
import ErpImprimirFichaPage from '@/app/erp/fichas/[id]/imprimir/page';

/**
 * ERP N.5 · visão operacional × gerencial automática na ficha (Postgres real): quem só opera (sem "ver preços") recebe do
 * SERVIDOR a ficha sem nenhum valor de custo — no detalhe, na lista e na impressão —; quem vê preços recebe os custos e a
 * área de preço por canal. Confere o que sai do servidor (as props), não o que a tela esconde.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-ficha-visoes.db.test.ts
 */
const URL_TESTE = process.env.ERP_DB_TESTE;
const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v instanceof Map ? Object.fromEntries(v) : v));

describe.skipIf(!URL_TESTE)('ERP N.5 · visão operacional e gerencial da ficha (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `v${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let P: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const ctxDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR') => () => ({
    cliente: a,
    alcance: resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }) as Alcance,
    parceiro: P,
    sessao: { userId: 'u', autorNome: perfilBase },
    bloqueio: null,
    pessoa: { setores: [] },
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    P = await db.parceiroFlow.create({ data: { nome: 'Visões (N.5)', slug: `visoes-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(P.id, db);
    // Preço com centavos que não aparecem em outro lugar: se vazar, o teste acha.
    const pao = await cadastrarInsumo(a, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Pão', unidade: 'UN', conteudo: '1', preco: '7,37' });
    if (!pao.ok) throw new Error(JSON.stringify(pao));
    const f = await cadastrarFicha(
      a,
      { nome: 'Lanche', tipo: 'PRATO', rendimento: '1', descricao: 'Pão na chapa', itens: [{ insumoId: pao.id, quantidade: '1', unidade: 'un' }], passos: ['Aquecer a chapa.', 'Tostar o pão.'] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.ficha = f.id;
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, [P.id]);
      await db.$disconnect();
    }
  });

  type Props = { props: { ficha: { verCustos: boolean; custo: unknown; itens: { custo: unknown; custoDoInsumo: unknown }[]; passosPreparo: string[] }; canais: unknown } };

  it('operador: detalhe e impressão sem nenhum valor de custo; as etapas, quantidades e o resto da operação continuam', async () => {
    atual.ctx = ctxDe('OPERADOR');
    const det = (await ErpFichaPage({ params: { id: ids.ficha }, searchParams: {} })) as Props;
    expect(det.props.ficha.verCustos).toBe(false);
    expect(det.props.ficha.custo).toBeNull();
    expect(det.props.ficha.itens.every((i) => i.custo === null && i.custoDoInsumo === null)).toBe(true);
    expect(det.props.canais).toBeNull();
    expect(det.props.ficha.passosPreparo).toEqual(['Aquecer a chapa.', 'Tostar o pão.']);
    // Nem o número cru (737 centavos) nem fração de custo saem do servidor.
    expect(json(det.props.ficha)).not.toMatch(/737|porRendimento|"centavos"/);
    const imp = (await ErpImprimirFichaPage({ params: { id: ids.ficha } })) as Props;
    expect(imp.props.ficha.verCustos).toBe(false);
    expect(imp.props.canais).toBeNull();
    expect(json(imp.props.ficha)).not.toMatch(/737|porRendimento|"centavos"/);
  });

  it('operador: a lista vem sem custo em nenhuma linha e sem o filtro de custo', async () => {
    atual.ctx = ctxDe('OPERADOR');
    type El = { props: { children: El[] | El; linhas?: { custo: unknown }[]; verCustos?: boolean; filtros?: unknown } };
    const pagina = (await ErpFichasPage({ searchParams: {} })) as El;
    const filhos = ([] as El[]).concat(pagina.props.children);
    const tela = filhos.find((c) => c && 'linhas' in c.props)!;
    expect(tela.props.linhas!.length).toBeGreaterThan(0);
    expect(tela.props.linhas!.every((l) => l.custo === null)).toBe(true);
    expect(json(tela.props.linhas)).not.toMatch(/737|porRendimento/);
    const cabecalho = filhos.find((c) => c && !('linhas' in c.props))!;
    const filtros = ([] as El[]).concat(cabecalho.props.children).find((c) => c && 'filtros' in c.props)!;
    expect(filtros.props.verCustos).toBe(false);
  });

  it('gerente (vê preços): detalhe, lista e impressão com os custos e a área de preço por canal', async () => {
    atual.ctx = ctxDe('GERENTE');
    const det = (await ErpFichaPage({ params: { id: ids.ficha }, searchParams: {} })) as Props;
    expect(det.props.ficha.verCustos).toBe(true);
    expect(det.props.ficha.custo).not.toBeNull();
    expect(det.props.canais).not.toBeNull();
    const imp = (await ErpImprimirFichaPage({ params: { id: ids.ficha } })) as Props & { props: { canais: unknown[] } };
    expect(imp.props.ficha.verCustos).toBe(true);
    expect(imp.props.canais).toHaveLength(3);
    type El = { props: { children: El[] | El; linhas?: { custo: unknown }[] } };
    const pagina = (await ErpFichasPage({ searchParams: {} })) as El;
    const tela = ([] as El[]).concat(pagina.props.children).find((c) => c && 'linhas' in c.props)!;
    expect(tela.props.linhas!.every((l) => l.custo !== null)).toBe(true);
  });

  it('ficha de outro parceiro na URL da impressão: 404', async () => {
    atual.ctx = ctxDe('DONO');
    await expect(ErpImprimirFichaPage({ params: { id: 'naoexiste123' } })).rejects.toThrow(/NOT_FOUND/);
  });
});
