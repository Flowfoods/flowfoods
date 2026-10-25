/**
 * ERP 2.2b · as actions e as páginas das metas e do fechamento (a porta de verdade), com banco:
 *  - metas: só quem define (rede inteira); o gerente é recusado, campo forjado é ignorado ou recusado com frase;
 *  - fechar pela action: a dona fecha; gerente, operador e parceiro suspenso são recusados; o início vem preso à URL;
 *  - reabrir NÃO existe na porta do parceiro; a regra recusa a dona mesmo se a action fosse alcançada; o nível 1 reabre;
 *  - o DRE fechado do gerente de uma loja (HTML e payload): só as linhas e as ressalvas da loja dele, nada da rede, nada da
 *    justificativa, nada da outra loja; a dona vê tudo (controle positivo);
 *  - a página do período: 404 para início forjado, SEM_ACESSO para quem não fecha, e o formulário de reabrir só no espelho;
 *  - vazamento: perfil com historico.ver sem dre.ver não recebe FECHOU, REABRIU nem meta (HTML e payload).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre-fechamento-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({
  ctx: null as null | (() => unknown),
  visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string },
  lojas: [] as { id: string; nome: string; ativa: boolean }[],
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
// O react-dom estável do vitest não traz os ganchos de formulário do Next: o estado inicial basta para ler o HTML.
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/dre',
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
    visaoDaRequisicao: async () => ({ visao: atual.visao, lojas: atual.lojas }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDia, salvarCanaisDaLoja, type EntradaDoCanal } from '@/lib/erp/faturamento';
import { lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { fecharPeriodo, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { situacaoDasMetas } from '@/lib/erp/dre-metas';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as dreDaSessao from '@/app/erp/dre/actions';
import * as dreDoNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/dre/actions';
import ErpDrePage from '@/app/erp/dre/page';
import ErpPeriodoPage from '@/app/erp/dre/periodos/[inicio]/page';
import ErpPlanoPage from '@/app/erp/dre/plano/page';
import ErpNovaDespesaPage from '@/app/erp/dre/despesas/nova/page';
import ErpFaturamentoDoDiaPage from '@/app/erp/faturamento/[lojaId]/[data]/page';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import ErpHistoricoPage from '@/app/erp/historico/page';
import NivelUmPeriodoPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/periodos/[inicio]/page';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { TelaDoFechamento } from '@/components/erp/telas/dre/periodo-fechamento';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-17';
const nbsp = (t: string) => t.replace(/\u00a0/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 2.2b · telas e actions de metas e fechamento (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, autorNome: string, cliente = a, bloqueio: string | null = null, parceiro = A) => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio, podeEscrever: true, sessao: { userId: 'u', autorNome } });
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
  const resolver = async (el: unknown): Promise<ReactElement> => {
    let x = el as ReactElement;
    for (let i = 0; i < 4; i++) {
      const tipo = x.type as unknown;
      if (typeof tipo !== 'function') return x;
      const saida = (tipo as (p: unknown) => unknown)(x.props);
      if (saida && typeof (saida as Promise<unknown>).then === 'function') x = (await saida) as ReactElement;
      else return x;
    }
    return x;
  };
  const props = async (el: unknown) => (await resolver(el)).props as Record<string, any>;
  /** A página do período devolve a trilha e a tela lado a lado: as props da tela. */
  const propsDaTela = async (el: unknown) => {
    const filhos = (await resolver(el)).props.children as ReactElement | ReactElement[];
    return (Array.isArray(filhos) ? filhos[filhos.length - 1] : filhos).props as Record<string, any>;
  };
  const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : isValidElement(v) ? { tipo: typeof v.type === 'string' ? v.type : (v.type as { name?: string }).name, ...(v.props as object) } : v));
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const textos = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({ envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'aluguel', descricao: 'x', valor: '1,00', tipo: 'mes', dia: '', mes: '2026-09', de: '', ate: '', recorrente: false, vencimento: '', ...p });
  const canalLoja = (valor: string): EntradaDoCanal => ({ canal: 'LOJA', valor, pedidos: '2', clientes: '', naoVendeu: false, versao: '' });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Fecha A', slug: `tfa-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Fecha B', slug: `tfb-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['mei', 'Loja Meier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
      await a.loja.update({ where: { id: r.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
      expect(await salvarCanaisDaLoja(a, r.id, ['LOJA'], ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'], 'Marina')).toEqual({ ok: true, mudou: true });
    }
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.mei, nome: 'Loja Meier', ativa: true }];
    // Setembro: a Penha vende 100,00 por dia; o Meier 259,26 (30 dias = R$ 7.777,80, o número que não pode vazar para o gerente da Penha).
    for (let d = 1; d <= 30; d++) {
      const data = `2026-09-${String(d).padStart(2, '0')}`;
      expect((await lancarDia(a, ALCANCE_FLOWFOODS, { lojaId: ids.vp, data, canais: [canalLoja('100,00')] }, 'Marina', HOJE)).ok).toBe(true);
      expect((await lancarDia(a, ALCANCE_FLOWFOODS, { lojaId: ids.mei, data, canais: [canalLoja('259,26')] }, 'Marina', HOJE)).ok).toBe(true);
    }
    const despesas: Partial<TextosDaDespesa>[] = [
      { descricao: 'Contador do grupo', linha: 'contabilidade', valor: '1.234,56' },
      { descricao: 'Aluguel da Penha', linha: 'aluguel', valor: '500,00', lojaId: ids.vp },
      // Recorrentes de agosto, sem a de setembro: uma ressalva da Penha, uma do Meier e uma da rede.
      { descricao: 'Internet da Penha', linha: 'internet', valor: '120,00', lojaId: ids.vp, mes: '2026-08', recorrente: true },
      { descricao: 'Gás do Meier', linha: 'gas', valor: '200,00', lojaId: ids.mei, mes: '2026-08', recorrente: true },
      { descricao: 'Anuidade do contador', linha: 'contabilidade', valor: '300,00', mes: '2026-08', recorrente: true },
    ];
    for (const p of despesas) {
      const r = await lancarDespesa(a, ALCANCE_FLOWFOODS, textos(p), 'Marina', HOJE);
      if (!r.ok) throw new Error(JSON.stringify(r));
    }
    const rb = await cadastrarLoja(b, { nome: 'Casa do B' }, 'Beto');
    if (!rb.ok) throw new Error(JSON.stringify(rb));
    ids.lojaB = rb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('metas pela action: a dona grava (autor da sessão); o gerente e o operador são recusados; receita forjada é frase; o espelho do nível 1 grava pela mesma regra', async () => {
    const v = async () => (await situacaoDasMetas(a, ALCANCE_FLOWFOODS, HOJE))!.versao;
    como(alcanceDe('GERENTE', 'rede'), 'Gil');
    expect(await rodar(async () => dreDaSessao.acaoSalvarMetas(null, form({ versao: await v(), 'meta_grupo:PESSOAL': '25' })))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Seu acesso não inclui') } });
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    expect(await rodar(async () => dreDaSessao.acaoSalvarMetas(null, form({ versao: await v(), 'meta_grupo:PESSOAL': '25' })))).toMatchObject({ ok: false });
    expect(await a.dreMeta.count()).toBe(0);
    como(alcanceDe('DONO', 'rede'), 'Marina Dona');
    const f = form({ versao: await v(), 'meta_grupo:PESSOAL': '25', 'meta_cmv': '30', parceiroId: B.id, 'campo_forjado': 'x' });
    const r = (await rodar(() => dreDaSessao.acaoSalvarMetas(null, f))) as { ok: true; mensagem: string };
    expect(r.ok).toBe(true);
    expect(r.mensagem).toMatch(/2 metas salvas.*a partir de 01\/10\/2026/);
    expect(await a.dreMeta.findMany({ select: { criadoPorNome: true, parceiroId: true, percentualBp: true }, orderBy: { percentualBp: 'asc' } })).toEqual([
      { criadoPorNome: 'Marina Dona', parceiroId: A.id, percentualBp: 2500 },
      { criadoPorNome: 'Marina Dona', parceiroId: A.id, percentualBp: 3000 },
    ]);
    expect(await b.dreMeta.count()).toBe(0);
    // Receita (2.4: meta de crescimento, 0 a 100 %) por campo forjado: 100,01 é frase, e as linhas de detalhe do CMV não existem como meta; nada de novo.
    expect(await rodar(async () => dreDaSessao.acaoSalvarMetas(null, form({ versao: await v(), 'meta_receita-loja': '100,01' })))).toMatchObject({ ok: false, erros: { 'receita-loja': expect.stringMatching(/rescimento/) } });
    expect(await rodar(async () => dreDaSessao.acaoSalvarMetas(null, form({ versao: await v(), 'meta_cmv:compra': '10' })))).toMatchObject({ ok: false });
    // Texto inválido: a frase vai no campo da linha.
    expect(await rodar(async () => dreDaSessao.acaoSalvarMetas(null, form({ versao: await v(), 'meta_grupo:PESSOAL': '100,01' })))).toMatchObject({ ok: false, erros: { 'grupo:PESSOAL': expect.any(String) } });
    // Versão velha: conflito, nada grava.
    expect(await rodar(() => dreDaSessao.acaoSalvarMetas(null, form({ versao: 'velha', 'meta_cmv': '31' })))).toMatchObject({ ok: false, conflito: true });
    expect(await a.dreMeta.count()).toBe(2);
    // O espelho do nível 1.
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    expect(await rodar(async () => dreDoNivel1.acaoSalvarMetas(A.slug, null, form({ versao: await v(), 'meta_cmv': '28' })))).toMatchObject({ ok: true });
    expect((await a.dreMeta.findMany({ where: { percentualBp: 2800 } })).map((m) => m.criadoPorNome)).toEqual(['Rodolfo']);
  });

  it('a página do plano é só de quem define: a dona abre (com a tabela de metas), o gerente não', async () => {
    como(alcanceDe('GERENTE', 'rede'), 'Gil');
    expect(await rodar(() => ErpPlanoPage())).toEqual({ erro: 'SEM_ACESSO' });
    como(alcanceDe('DONO', 'rede'), 'Marina');
    const p = await props(await ErpPlanoPage());
    expect(p.metas.linhas.some((l: { chave: string; metaBp: number | null }) => l.chave === 'grupo:PESSOAL' && l.metaBp === 2500)).toBe(true);
    expect(p.metas.linhas.find((l: { chave: string }) => l.chave === 'grupo:RECEITA')).toMatchObject({ aceita: true, tipoDaMeta: 'crescimento' }); // 2.4: a receita tem meta de crescimento
    expect(p.acoes.metas).toBeTypeOf('function');
  });

  it('fechar pela action: gerente, operador e parceiro suspenso são recusados; outubro em curso volta com a frase; a dona fecha setembro com as 3 ressalvas', async () => {
    const ressalvas = async () => (await fecharPeriodo(a, ALCANCE_FLOWFOODS, { inicio: '2026-09-01', ressalvas: [], justificativa: '' }, 'x', HOJE)) as { ok: false; erro: string };
    expect((await ressalvas()).ok).toBe(false);
    como(alcanceDe('GERENTE', 'rede'), 'Gil');
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, form({})))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Seu acesso não inclui') } });
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, form({})))).toMatchObject({ ok: false });
    como(alcanceDe('DONO', 'rede'), 'Marina', a, 'Parceiro suspenso: só consulta.');
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, form({})))).toMatchObject({ ok: false, erros: { geral: 'Parceiro suspenso: só consulta.' } });
    expect(await a.periodoApuracao.count()).toBe(0);
    como(alcanceDe('DONO', 'rede'), 'Ana Dona');
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-10-01', null, form({})))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('ainda não terminou') } });
    // Setembro com as ressalvas: sem marcar, a frase; marcando, fecha e volta à página do período.
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, form({})))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Marque cada uma') } });
    const f = new FormData();
    const s = await propsDaTela(await ErpPeriodoPage({ params: { inicio: '2026-09-01' }, searchParams: {} }));
    const condicoes = s.s.condicoes as { ressalvas: { id: string }[]; impressao: string };
    expect(condicoes.ressalvas).toHaveLength(3);
    for (const r of condicoes.ressalvas) f.append('ressalva', r.id);
    f.set('justificativa', 'As contas de agosto chegam tarde; ver a planilha do contador.');
    f.set('impressao', condicoes.impressao);
    f.set('inicio', '2020-01-01'); // campo forjado: o início vem preso à URL, nunca do formulário
    const r = (await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, f))) as { redirect: string };
    expect(r.redirect).toBe('/erp/dre/periodos/2026-09-01?feito=fechado');
    expect(await a.periodoApuracao.findMany({ select: { inicio: true, status: true, fechadoPorNome: true } })).toEqual([{ inicio: new Date('2026-09-01T00:00:00Z'), status: 'FECHADO', fechadoPorNome: 'Ana Dona' }]);
    // De novo (duplo clique): "já fechado".
    expect(await rodar(() => dreDaSessao.acaoFecharPeriodo('2026-09-01', null, f))).toEqual({ redirect: '/erp/dre/periodos/2026-09-01?feito=ja-fechado' });
    expect(await a.dreFotografia.count()).toBe(1);
  });

  it('revisão de UX: período fechado AVISA ANTES e diz o que fazer: as recorrentes de setembro não vêm editáveis e o dia de faturamento traz a saída e o link; sem dre.ver não há link', async () => {
    const dona = alcanceDe('DONO', 'rede');
    como(dona, 'Marina');
    atual.visao = { tipo: 'rede' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.mei, nome: 'Loja Meier', ativa: true }];
    const quem = await avisoDePeriodos(a, dona, '/erp', HOJE);
    expect(quem.fechados.map((p) => p.nome)).toContain('Setembro de 2026');
    expect(quem.fechados.find((p) => p.nome === 'Setembro de 2026')).toMatchObject({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(quem.emCurso).toBe('Outubro de 2026');
    expect(quem.href).toBe('/erp/dre/periodos');
    expect((await avisoDePeriodos(a, alcanceDe('OPERADOR', [ids.vp]), '/erp', HOJE)).href).toBeNull();
    expect((await avisoDePeriodos(a, ALCANCE_FLOWFOODS, `/rodolfo/erp/${A.slug}`, HOJE)).href).toBe(`/rodolfo/erp/${A.slug}/dre/periodos`);
    expect((await avisoDePeriodos(b, dona, '/erp', HOJE)).fechados).toEqual([]);

    // As que repetem todo mês, em setembro (fechado): sem lista, sem botão; o aviso com a saída e o caminho para o mês de agora.
    const recorrentes = nbsp(renderToStaticMarkup(await resolver(await ErpNovaDespesaPage({ searchParams: { modo: 'mes-passado', mes: '2026-09' } }))));
    expect(recorrentes).toContain('O período Setembro de 2026 já foi fechado no DRE.');
    expect(recorrentes).toContain('peça à FlowFoods para reabrir o período');
    expect(recorrentes).toContain('Outubro de 2026, o período em aberto');
    expect(recorrentes).toContain('href="/erp/dre/periodos"');
    expect(recorrentes).not.toMatch(/Internet da Penha|Anuidade do contador|Lançar \d+ despesa/);
    expect(recorrentes).toContain('Lançar as deste mês');

    // O dia de faturamento num período fechado avisa no topo, com a saída.
    const dia = nbsp(renderToStaticMarkup(await resolver(await ErpFaturamentoDoDiaPage({ params: { lojaId: ids.vp, data: '2026-09-12' }, searchParams: {} }))));
    expect(dia).toContain('O período Setembro de 2026 já foi fechado no DRE.');
    expect(dia).toContain('Para mexer em Setembro de 2026, peça à FlowFoods para reabrir o período.');
    expect(dia).toContain('Este dia só pode ser consultado');
    expect(dia).toContain('href="/erp/dre/periodos"');
    expect(dia).not.toContain('Salvar o dia');

    // Quem lança faturamento mas não abre Períodos (gerente da loja sem dre.ver): o aviso sem o link.
    como(alcanceDe('OPERADOR', [ids.vp], ['faturamento.ver', 'faturamento.lancar']), 'Caio');
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    const semLink = nbsp(renderToStaticMarkup(await resolver(await ErpFaturamentoDoDiaPage({ params: { lojaId: ids.vp, data: '2026-09-12' }, searchParams: {} }))));
    expect(semLink).toContain('peça à FlowFoods para reabrir o período');
    expect(semLink).not.toContain('Ver os períodos');
  });

  it('a página do período: 404 para início forjado, SEM_ACESSO para quem não fecha; a dona não tem o formulário de reabrir e o nível 1 tem', async () => {
    como(alcanceDe('DONO', 'rede'), 'Marina');
    for (const inicio of ['2026-09-15', '2027-01-01', 'lixo', '2019-01-01']) expect(await rodar(() => ErpPeriodoPage({ params: { inicio }, searchParams: {} }).then(resolver)), inicio).toEqual({ erro: 'NOT_FOUND' });
    for (const al of [alcanceDe('GERENTE', 'rede'), alcanceDe('GERENTE', [ids.vp]), alcanceDe('OPERADOR', [ids.vp])]) {
      como(al, 'Fulano');
      expect(await rodar(() => ErpPeriodoPage({ params: { inicio: '2026-09-01' }, searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    }
    como(alcanceDe('DONO', 'rede'), 'Marina');
    const dona = await propsDaTela(await ErpPeriodoPage({ params: { inicio: '2026-09-01' }, searchParams: {} }));
    expect(dona.acoes.reabrir).toBeUndefined();
    expect(dona.s.fotografia).toMatchObject({ versao: 1, ressalvas: expect.any(Array) });
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    const n1 = await propsDaTela(await NivelUmPeriodoPage({ params: { slug: A.slug, inicio: '2026-09-01' }, searchParams: {} }));
    expect(n1.acoes.reabrir).toBeTypeOf('function');
    expect(n1.raiz).toBe(`/rodolfo/erp/${A.slug}`);
    // A porta do parceiro não tem action de reabrir.
    expect(Object.keys(dreDaSessao).filter((k) => /reabrir/i.test(k))).toEqual([]);
    expect(typeof (dreDoNivel1 as Record<string, unknown>).acaoReabrirPeriodo).toBe('function');
  });

  it('critério 17: o gerente da Penha vê no fechado só a loja dele, as ressalvas dela e nada da rede, da outra loja nem da justificativa (HTML e payload); a dona vê tudo', async () => {
    const PROIBIDO = /Loja Meier|Gás do Meier|7\.777,80|Contador do grupo|Anuidade do contador|1\.234,56|planilha do contador|"entrada"|"justificativa":"As contas/;
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }];
    const pagina = await props(await ErpDrePage({ searchParams: { periodo: '2026-09-01' } }));
    expect(pagina.d.status).toBe('FECHADO');
    expect(pagina.d.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
    expect(pagina.d.porLoja).toBeNull();
    expect(pagina.d.fechamento.ressalvas.map((r: { titulo: string }) => r.titulo).join('|')).toContain('Internet da Penha');
    expect(pagina.d.fechamento).toMatchObject({ totalDeRessalvas: null, justificativa: null });
    expect(json(pagina).match(PROIBIDO)?.[0] ?? null).toBeNull();
    const html = nbsp(renderToStaticMarkup(createElement(TelaDoDre, { d: pagina.d as never, base: '/erp/dre', raiz: '/erp', pode: pagina.pode as never, bloqueio: null })));
    expect(html).toContain('Fechado com ressalvas');
    expect(html).toContain('Internet da Penha');
    expect(html).toContain('R$ 3.000,00'); // a receita da Penha: 30 × 100,00
    expect(html.match(PROIBIDO)?.[0] ?? null).toBeNull();
    // Forjar ?rede=1 ou ?loja= da outra loja cai na loja dele, também no fechado.
    for (const q of [{ rede: '1' }, { loja: ids.mei }]) {
      const f = await props(await ErpDrePage({ searchParams: { periodo: '2026-09-01', ...q } }));
      expect(f.d.escopo).toMatchObject({ tipo: 'loja', lojaId: ids.vp });
      expect(json(f).match(PROIBIDO)?.[0] ?? null).toBeNull();
    }
    // O gerente não abre o fechamento nem as metas.
    expect(await rodar(() => ErpPeriodoPage({ params: { inicio: '2026-09-01' }, searchParams: {} }))).toEqual({ erro: 'SEM_ACESSO' });
    // A dona vê tudo (controle positivo: o filtro é do gerente, não da tela).
    como(alcanceDe('DONO', 'rede'), 'Marina');
    atual.visao = { tipo: 'rede' };
    atual.lojas = [{ id: ids.vp, nome: 'Vila da Penha', ativa: true }, { id: ids.mei, nome: 'Loja Meier', ativa: true }];
    const dona = await props(await ErpDrePage({ searchParams: { periodo: '2026-09-01' } }));
    expect(dona.d.fechamento).toMatchObject({ totalDeRessalvas: 3, justificativa: expect.stringContaining('planilha do contador') });
    const htmlDona = nbsp(renderToStaticMarkup(createElement(TelaDoDre, { d: dona.d as never, base: '/erp/dre', raiz: '/erp', pode: dona.pode as never, bloqueio: null })));
    for (const t of ['Loja Meier', 'Gás do Meier', 'Anuidade do contador', 'Internet da Penha', 'planilha do contador', 'Fechado com ressalvas', 'Por loja']) expect(htmlDona, t).toContain(t);
    expect(htmlDona).toContain('R$ 10.777,80'); // 3.000,00 + 7.777,80
    // Operador: nada.
    como(alcanceDe('OPERADOR', [ids.vp]), 'Caio');
    expect(await rodar(() => ErpDrePage({ searchParams: { periodo: '2026-09-01' } }))).toEqual({ erro: 'SEM_ACESSO' });
  });

  it('o DRE fechado mostra o período como fechado, com a versão e quem fechou, e o ao vivo de outubro não herda nada dele', async () => {
    const f = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'rede' }, '2026-09-10', HOJE))!;
    expect(f).toMatchObject({ status: 'FECHADO', encerrado: true, emCurso: false, diasApurados: 30, faltas: { total: 0 }, fechamento: { versao: 1, fechadoPorNome: 'Ana Dona' } });
    const html = nbsp(renderToStaticMarkup(createElement(TelaDoDre, { d: f, base: '/erp/dre', raiz: '/erp', pode: { lancarDespesa: true, verFaturamento: true, verPrecos: true, veRede: true, fecharPeriodo: true, definirMetas: true }, bloqueio: null })));
    expect(html).toMatch(/Fechado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} por Ana Dona · versão 1/);
    expect(html).toContain('Período fechado');
    expect(html).toContain('Ver o fechamento');
    const o = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'rede' }, '2026-10-10', HOJE))!;
    expect(o.status).toBeNull();
    expect(o.fechamento).toBeNull();
  });

  it('o período aberto e encerrado mostra o convite para fechar só para quem fecha', async () => {
    const aberto = (await dreDoPeriodo(a, ALCANCE_FLOWFOODS, { tipo: 'rede' }, '2026-08-10', HOJE))!;
    expect(aberto).toMatchObject({ encerrado: true, status: null });
    const htmlConvite = (pode: boolean) =>
      nbsp(renderToStaticMarkup(createElement(TelaDoDre, { d: aberto, base: '/erp/dre', raiz: '/erp', pode: { lancarDespesa: true, verFaturamento: true, verPrecos: true, veRede: true, fecharPeriodo: pode }, bloqueio: null })));
    expect(htmlConvite(true)).toContain('Conferir e fechar o período');
    expect(htmlConvite(true)).toContain('/erp/dre/periodos/2026-08-01');
    expect(htmlConvite(false)).not.toContain('Conferir e fechar o período');
  });

  it('critério 16 (a porta): a dona não reabre mesmo se a action fosse alcançada; motivo curto é frase no campo; o nível 1 reabre', async () => {
    const foto = (await a.dreFotografia.findFirst({ where: { substituidaEm: null } }))!.id;
    // A dona (todas as permissões, rede inteira) chegando na action do espelho: a regra recusa pelo nível.
    como(alcanceDe('DONO', 'rede'), 'Marina Dona');
    expect(await rodar(() => dreDoNivel1.acaoReabrirPeriodo(A.slug, '2026-09-01', null, form({ motivo: 'Preciso lançar uma nota', fotografia: foto })))).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('Só a FlowFoods reabre') } });
    como(alcanceDe('GERENTE', 'rede'), 'Gil');
    expect(await rodar(() => dreDoNivel1.acaoReabrirPeriodo(A.slug, '2026-09-01', null, form({ motivo: 'Preciso lançar uma nota', fotografia: foto })))).toMatchObject({ ok: false });
    expect((await a.periodoApuracao.findFirst({ where: { inicio: new Date('2026-09-01T00:00:00Z') } }))!.status).toBe('FECHADO');
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    expect(await rodar(() => dreDoNivel1.acaoReabrirPeriodo(A.slug, '2026-09-01', null, form({ motivo: 'ab', fotografia: foto })))).toMatchObject({ ok: false, erros: { motivo: expect.stringContaining('3 letras') } });
    const r = await rodar(() => dreDoNivel1.acaoReabrirPeriodo(A.slug, '2026-09-01', null, form({ motivo: 'Nota de agosto que ficou de fora', fotografia: foto })));
    expect(r).toEqual({ redirect: `/rodolfo/erp/${A.slug}/dre/periodos/2026-09-01?feito=reaberto` });
    expect(await a.periodoApuracao.findFirst({ where: { inicio: new Date('2026-09-01T00:00:00Z') } })).toMatchObject({ status: 'ABERTO', fechadoEm: null });
    expect(await a.dreFotografia.findUnique({ where: { id: foto } })).toMatchObject({ reabertaPorNome: 'Rodolfo', motivoReabertura: 'Nota de agosto que ficou de fora' });
  });

  it('período FECHADO de antes da fotografia: o nível 1 vê o formulário de reabrir (com a explicação), a dona só a frase; reabrir sem fotografia funciona', async () => {
    // O legado só existe de antes da migration: aqui o gatilho adiado é desligado só para plantar a linha.
    await db.$executeRawUnsafe(`ALTER TABLE "PeriodoApuracao" DISABLE TRIGGER "PeriodoApuracao_fechado_tem_fotografia"`);
    try {
      await cru(db, perfil, A.id, `INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim,status,"fechadoEm") VALUES ('legado-${sufixo}', $1, 'Janeiro de 2026', '2026-01-01', '2026-01-31', 'FECHADO', now())`, A.id);
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "PeriodoApuracao" ENABLE TRIGGER "PeriodoApuracao_fechado_tem_fotografia"`);
    }
    const tela = async (alcance: Alcance, reabrir: boolean) => {
      const sit = (await situacaoDoFechamento(a, alcance, '2026-01-01', HOJE))!;
      expect(sit).toMatchObject({ fotografia: null });
      return nbsp(renderToStaticMarkup(createElement(TelaDoFechamento, { s: sit as never, raiz: reabrir ? '/rodolfo/erp/x' : '/erp', contexto: 'Rede Completa', feito: null, acoes: { fechar: (async () => null) as never, ...(reabrir ? { reabrir: (async () => null) as never } : {}) }, bloqueio: null })));
    };
    const n1 = await tela(ALCANCE_FLOWFOODS, true);
    expect(n1).toContain('antes de existir a fotografia do fechamento');
    expect(n1).toContain('Reabrir o período</button>');
    expect(n1).toContain('id="reabrir-motivo"');
    const parceiro = await tela(alcanceDe('DONO', 'rede'), false);
    expect(parceiro).toContain('Só a FlowFoods reabre');
    expect(parceiro).not.toContain('reabrir-motivo');
    // E o botão funciona: sem fotografia para conferir, o período volta a ABERTO e o Histórico guarda o motivo.
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    expect(await rodar(() => dreDoNivel1.acaoReabrirPeriodo(A.slug, '2026-01-01', null, form({ motivo: 'Período antigo, sem fotografia', fotografia: '' })))).toHaveProperty('redirect');
    expect((await a.periodoApuracao.findFirst({ where: { inicio: new Date('2026-01-01T00:00:00Z') } }))!.status).toBe('ABERTO');
  });

  it('critério 17: perfil com historico.ver e sem dre.ver não recebe FECHOU, REABRIU nem meta no Histórico (HTML e payload); quem tem dre.ver recebe', async () => {
    const PROIBIDO = /Fechou|Reabriu|Meta do DRE|Fechamento do período|Fotografia do fechamento|Nota de agosto que ficou de fora|"PeriodoApuracao"|"DreMeta"/;
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver']), 'Hugo');
    for (const q of [{}, { entidade: 'Despesa' }, { entidade: 'PeriodoApuracao' }, { entidade: 'DreMeta' }]) {
      const pagina = await ErpHistoricoPage({ searchParams: q });
      expect(json(pagina).match(PROIBIDO)?.[0] ?? null, JSON.stringify(q)).toBeNull();
      expect(nbsp(renderToStaticMarkup(createElement(() => pagina as never))).match(PROIBIDO)?.[0] ?? null, JSON.stringify(q)).toBeNull();
    }
    como(alcanceDe('OPERADOR', 'rede', ['historico.ver', 'dre.ver']), 'Helena');
    const comAcesso = await ErpHistoricoPage({ searchParams: { entidade: 'Despesa' } });
    const htmlOk = nbsp(renderToStaticMarkup(createElement(() => comAcesso as never)));
    expect(htmlOk).toMatch(/Reabriu|Fechou/);
    expect(htmlOk).toContain('Nota de agosto que ficou de fora');
  });
});
