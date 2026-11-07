/**
 * Decisão 518 (revisão) · a virada do mês não apaga a pendência de faturamento sem leitura que confirme, no Postgres de verdade
 * e pelas portas reais (Home, mês e a action de lançar):
 * - 31/10 com falta em 30/10 → "2 lançamentos faltando neste mês";
 * - 01/11 (relógio virado): o mês corrente não tem falta (conta até ontem), e outubro continua com a pendência própria, agora
 *   com o 31/10 também (5), link e volta para outubro;
 * - leitura que falha = "não conferida" nos dois meses; dia em período fechado não conta e a action recusa lançar nele;
 * - lançar pela action (com a volta) → a pendência de outubro sai na leitura seguinte.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-home-atencao-virada.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
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
    visaoDaRequisicao: async () => ({ visao: atual.visao }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia } from '@/lib/erp/faturamento';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { painelDoDia, type PainelDoDia } from '@/lib/erp/painel-do-dia';
import * as faturamentoDaSessao from '@/app/erp/faturamento/actions';
import ErpHomePage from '@/app/erp/page';
import ErpFaturamentoPage from '@/app/erp/faturamento/page';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, reabrirPeriodoDeTeste, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

relogioDoCenario('2026-10-31T12:00:00-03:00');

describe.skipIf(!URL_TESTE)('Decisão 518 (revisão) · virada do mês com falta no mês anterior (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let quebrado: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `v${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let V: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let v: ClienteDoParceiro;
  let lojaId = '';
  const gerente = () => resolverAlcance({ perfilBase: 'GERENTE', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds: [lojaId] });
  const visao = () => ({ tipo: 'loja' as const, lojaId, nome: 'Penha' });
  const html = (el: unknown) => renderToStaticMarkup(el as never).replace(/ /g, ' ');
  const anterior = (p: PainelDoDia) => p.pendencias.find((x) => x.chave === 'faturamento-faltas-mes-anterior');
  const doMes = (p: PainelDoDia) => p.pendencias.find((x) => x.chave === 'faturamento-faltas');
  const home = async () => {
    atual.ctx = () => ({ parceiro: V, alcance: gerente(), cliente: v, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Gil Gerente' }, pessoa: { perfilRotulo: 'Gerente' } });
    atual.visao = visao();
    return html(await ErpHomePage({ searchParams: Promise.resolve({}) }));
  };
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string } | { erro: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      return { erro: (e as Error).message };
    }
  };
  const form = (canais: string[], volta: string) => {
    const f = new FormData();
    for (const c of canais) {
      f.set(`versao_${c}`, '');
      f.set(`valor_${c}`, '500,00');
      f.set(`pedidos_${c}`, '10');
    }
    f.set('volta', volta);
    return f;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    const urlQuebrada = new URL(URL_TESTE!);
    urlQuebrada.pathname = `/ff_inexistente_518_${sufixo}`;
    quebrado = new PrismaClient({ datasources: { db: { url: urlQuebrada.toString() } } });
    perfil = await perfilDoBanco(db);
    V = (await db.parceiroFlow.create({ data: { nome: 'Virada', slug: `virada-${sufixo}`, status: 'ATIVO' } })) as typeof V;
    v = doParceiro(V.id, db);
    const r = await cadastrarLoja(v, { nome: 'Penha' }, 'Marina');
    if (!r.ok) throw new Error(JSON.stringify(r));
    lojaId = r.id;
    const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
    // 29/10 completo; 30/10 só a loja (faltam delivery e iFood); 31/10 é hoje, ainda em aberto.
    for (const [data, canais] of [['2026-10-29', ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']], ['2026-10-30', ['LOJA']]] as const) {
      const l = await lancarDia(v, dono, { lojaId, data, canais: canais.map((canal) => ({ canal, valor: '1.000,00', pedidos: '20', clientes: '20', naoVendeu: false, versao: '' })) }, 'Marina', '2026-10-31');
      if (!l.ok) throw new Error(JSON.stringify(l));
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [V.id]);
    await db?.$disconnect();
    await quebrado?.$disconnect();
  });

  it('31/10: a falta de 30/10 é do mês corrente; o mês anterior (setembro) não tem nada', async () => {
    const p = await painelDoDia(v, gerente(), '/erp', new Date(), visao());
    expect(doMes(p)).toMatchObject({ titulo: '2 lançamentos faltando neste mês', href: `/erp/faturamento?mes=2026-10&loja=${lojaId}&volta=%2Ferp` });
    expect(anterior(p)).toBeUndefined();
  });

  it('01/11: outubro continua com pendência própria (agora 5, com o 31/10), link e volta para outubro; novembro sem falta', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00-03:00'));
    const p = await painelDoDia(v, gerente(), '/erp', new Date(), visao());
    expect(doMes(p)).toBeUndefined();
    expect(anterior(p)).toMatchObject({
      titulo: '5 lançamentos faltando em outubro', leitura: 'confirmada', natureza: 'completar_dados', acao: 'Lançar o que falta',
      href: `/erp/faturamento?mes=2026-10&loja=${lojaId}&volta=%2Ferp`,
    });
    const h = await home();
    expect(h).toContain('5 lançamentos faltando em outubro');
    expect(h).toContain(`href="/erp/faturamento?mes=2026-10&amp;loja=${lojaId}&amp;volta=%2Ferp">Lançar o que falta</a>`);
    // O mês de outubro aberto pelo link conta o mesmo e oferece "Voltar para o início".
    const outubro = html(await ErpFaturamentoPage({ searchParams: Promise.resolve({ mes: '2026-10', loja: lojaId, volta: '/erp' }) }));
    expect(outubro).toContain('5 lançamentos faltando neste mês.');
    expect(outubro).toMatch(/<a\b(?=[^>]*\shref="\/erp")[^>]*>Voltar para o início<\/a>/);
  });

  it('erro de leitura: os dois meses ficam "não conferidos", sem número; nada some em silêncio', async () => {
    const p = await painelDoDia(doParceiro(V.id, quebrado), gerente(), '/erp', new Date(), visao());
    expect(doMes(p)).toMatchObject({ leitura: 'nao_conferida', acao: 'Ver o faturamento' });
    expect(anterior(p)).toMatchObject({ leitura: 'nao_conferida', acao: 'Ver o faturamento', titulo: 'Lançamentos faltando em outubro: não deu para conferir agora' });
    expect(JSON.stringify(p)).not.toMatch(/\d lançamentos? faltando|Prisma|ff_inexistente/);
  });

  it('dia em período fechado não conta (a action recusa lançar nele); reaberto, volta a contar', async () => {
    const fechado = await v.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Último dia de outubro', inicio: '2026-10-31', fim: '2026-10-31' }));
    expect(anterior(await painelDoDia(v, gerente(), '/erp', new Date(), visao()))).toMatchObject({ titulo: '2 lançamentos faltando em outubro' });
    atual.ctx = () => ({ parceiro: V, alcance: gerente(), cliente: v, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Gil Gerente' } });
    const recusa = await rodar(() => faturamentoDaSessao.acaoSalvarDia(lojaId, '2026-10-31', null, form(['LOJA'], '/erp')));
    expect(recusa).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Último dia de outubro') } });
    await reabrirPeriodoDeTeste(v, fechado.id);
    expect(anterior(await painelDoDia(v, gerente(), '/erp', new Date(), visao()))).toMatchObject({ titulo: '5 lançamentos faltando em outubro' });
  });

  it('lançar outubro pela action (com a volta): só a leitura seguinte tira a pendência', async () => {
    atual.ctx = () => ({ parceiro: V, alcance: gerente(), cliente: v, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Gil Gerente' } });
    expect(await rodar(() => faturamentoDaSessao.acaoSalvarDia(lojaId, '2026-10-30', null, form(['DELIVERY_PROPRIO', 'IFOOD'], '/erp'))))
      .toEqual({ redirect: `/erp/faturamento/${lojaId}/2026-10-30?feito=salvo&volta=%2Ferp` });
    expect(await home()).toContain('3 lançamentos faltando em outubro');
    expect(await rodar(() => faturamentoDaSessao.acaoSalvarDia(lojaId, '2026-10-31', null, form(['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], '/erp'))))
      .toEqual({ redirect: `/erp/faturamento/${lojaId}/2026-10-31?feito=salvo&volta=%2Ferp` });
    const p = await painelDoDia(v, gerente(), '/erp', new Date(), visao());
    expect(anterior(p)).toBeUndefined();
    expect(doMes(p)).toBeUndefined();
    const h = await home();
    expect(h).not.toMatch(/lançamentos? faltando|Lançar o que falta|resolvid|concluíd/i);
  });
});
