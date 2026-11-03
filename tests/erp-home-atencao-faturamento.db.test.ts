/**
 * Decisão 518 · o circuito dos pontos de atenção da Home, piloto "canais sem lançamento" (faturamento), no Postgres de verdade
 * e pelas portas reais (página da Home, página do mês, página do dia e a action de lançar):
 * - a pendência existe porque a leitura do faturamento contou faltas; o link leva ao mês da MESMA loja com a volta da Home;
 * - o mês desenha "Voltar para o início" (só com a Home exata da área) e leva a volta ao dia; a action a devolve no redirecionamento;
 * - visitar, voltar, salvar com erro ou tentar sem permissão não mudam a Home; só a nova leitura depois do lançamento real muda;
 * - leitura que falha deixa a pendência "não conferida", nunca resolvida; outra loja e outro parceiro não aparecem;
 * - quem só vê recebe "Ver o faturamento"; volta inválida é ignorada; o nível 1 faz o mesmo no espelho.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-home-atencao-faturamento.db.test.ts
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
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
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
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { painelDoDia, type PainelDoDia } from '@/lib/erp/painel-do-dia';
import { temVoltarNoShell } from '@/lib/erp/voltar-navegacao';
import * as faturamentoDaSessao from '@/app/erp/faturamento/actions';
import * as faturamentoDoNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/actions';
import ErpHomePage from '@/app/erp/page';
import ErpFaturamentoPage from '@/app/erp/faturamento/page';
import ErpDiaPage from '@/app/erp/faturamento/[lojaId]/[data]/page';
import Nivel1HomePage from '@/app/rodolfo/(painel)/erp/[slug]/page';
import Nivel1FaturamentoPage from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/page';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

// Mês fixo: 15 e 16 de outubro já são "até ontem" (faltas contam) e 17 é hoje (em aberto).
relogioDoCenario('2026-10-17T12:00:00-03:00');
const HOJE = '2026-10-17';

describe.skipIf(!URL_TESTE)('Decisão 518 · pendência de faturamento → lançar → nova leitura (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let quebrado: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `a${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let B: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = [], removidas: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: removidas, redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, autorNome: string, cliente = a, parceiro: typeof A = A) => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome }, pessoa: { perfilRotulo: 'Gerente' } });
  };
  const naLoja = (lojaId: string, nome: string) => {
    atual.visao = { tipo: 'loja', lojaId, nome };
    return { tipo: 'loja' as const, lojaId, nome };
  };
  const html = (el: unknown) => renderToStaticMarkup(el as never).replace(/ /g, ' ');
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string } | { erro: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      return { erro: (e as Error).message };
    }
  };
  /** Só os canais pedidos entram no formulário (o resto do dia não é tocado), com a volta que a tela do dia manda. */
  const form = (canais: Record<string, { valor: string; pedidos: string }>, volta?: string) => {
    const f = new FormData();
    for (const [c, n] of Object.entries(canais)) {
      f.set(`versao_${c}`, '');
      f.set(`valor_${c}`, n.valor);
      f.set(`pedidos_${c}`, n.pedidos);
    }
    if (volta !== undefined) f.set('volta', volta);
    return f;
  };
  const lancar = async (cliente: ClienteDoParceiro, lojaId: string, data: string, canais: string[]) => {
    const r = await lancarDia(cliente, alcanceDe('DONO', 'rede'), {
      lojaId, data, canais: canais.map((canal) => ({ canal, valor: '1.000,00', pedidos: '20', clientes: '20', naoVendeu: false, versao: '' })),
    }, 'Marina', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  const pendencia = (p: PainelDoDia) => p.pendencias.find((x) => x.chave === 'faturamento-faltas');
  const query = (href: string) => Object.fromEntries(new URL(href, 'http://erp.interno').searchParams);
  const homeDoGerente = async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    naLoja(ids.vp, 'Vila da Penha');
    return html(await ErpHomePage({ searchParams: {} }));
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    // A mesma URL num banco que não existe: toda leitura falha (a falha de verdade, não um mock).
    const urlQuebrada = new URL(URL_TESTE!);
    urlQuebrada.pathname = `/ff_inexistente_518_${sufixo}`;
    quebrado = new PrismaClient({ datasources: { db: { url: urlQuebrada.toString() } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Atenção A', slug: `atencao-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Atenção B', slug: `atencao-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome, cliente] of [['vp', 'Vila da Penha', a], ['meier', 'Méier', a], ['casaB', 'Casa do B', b]] as const) {
      const r = await cadastrarLoja(cliente, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    // Vila da Penha: 15/10 sem iFood e 16/10 sem delivery = 2 faltas. Méier: 16/10 só a loja = 2 faltas. B: 16/10 só a loja = 2.
    await lancar(a, ids.vp, '2026-10-15', ['LOJA', 'DELIVERY_PROPRIO']);
    await lancar(a, ids.vp, '2026-10-16', ['LOJA', 'IFOOD']);
    await lancar(a, ids.meier, '2026-10-16', ['LOJA']);
    await lancar(b, ids.casaB, '2026-10-16', ['LOJA']);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    await quebrado?.$disconnect();
  });

  it('a pendência sai da leitura: link do mês da mesma loja com a volta da Home, "Lançar" só para quem lança, sem outra loja nem outro parceiro', async () => {
    const visao = naLoja(ids.vp, 'Vila da Penha');
    const gerente = await painelDoDia(a, alcanceDe('GERENTE', [ids.vp]), '/erp', HOJE, visao);
    expect(pendencia(gerente)).toEqual({
      chave: 'faturamento-faltas', escopo: 'Vila da Penha', natureza: 'completar_dados', indicador: 'Faturamento de outubro', leitura: 'confirmada',
      titulo: '2 canais sem lançamento neste mês',
      texto: 'Dia que a loja vendeu e ninguém lançou deixa o faturamento e o DRE incompletos.',
      href: `/erp/faturamento?mes=2026-10&loja=${ids.vp}&volta=%2Ferp`, acao: 'Lançar o que falta',
    });
    // O shell cede a esta volta: a tela do mês é quem desenha o Voltar.
    expect(temVoltarNoShell('/erp/faturamento', new URL(gerente.pendencias[0].href, 'http://erp.interno').search.slice(1))).toBe(false);
    // Quem só vê o faturamento: a mesma pendência, sem prometer o lançamento.
    const leitor = await painelDoDia(a, alcanceDe('OPERADOR', [ids.vp], ['faturamento.ver']), '/erp', HOJE, visao);
    expect(pendencia(leitor)).toMatchObject({ titulo: '2 canais sem lançamento neste mês', acao: 'Ver o faturamento', leitura: 'confirmada' });
    expect(pendencia(leitor)!.texto).toContain('Lançar é com quem tem “lançar faturamento” nesta loja.');
    // Parceiro em leitura (suspenso): a dona também só vê.
    const bloqueada = await painelDoDia(doParceiro(A.id, db, { somenteLeitura: true }), alcanceDe('DONO', 'rede'), '/erp', HOJE, visao);
    expect(pendencia(bloqueada)).toMatchObject({ acao: 'Ver o faturamento' });
    expect(pendencia(bloqueada)!.texto).toContain('bloqueados');
    // A rede soma as duas lojas de A (2 + 2), nunca a de B; outro parceiro não vê nada de A, só as próprias faltas.
    const rede = await painelDoDia(a, alcanceDe('DONO', 'rede'), '/erp', HOJE, { tipo: 'rede' });
    expect(pendencia(rede)).toMatchObject({ titulo: '4 canais sem lançamento neste mês', href: '/erp/faturamento?mes=2026-10&rede=1&volta=%2Ferp' });
    const deB = await painelDoDia(b, alcanceDe('DONO', 'rede'), '/erp', HOJE, { tipo: 'rede' });
    expect(pendencia(deB)).toMatchObject({ titulo: '2 canais sem lançamento neste mês' });
    expect(JSON.stringify(deB)).not.toMatch(new RegExp(`Vila da Penha|Méier|${ids.vp}|${ids.meier}`));
    // Loja de A pedida no contexto de B: nada (o portão não a acha); gerente da Vila da Penha pedindo o Méier: nada.
    expect(pendencia(await painelDoDia(b, alcanceDe('DONO', 'rede'), '/erp', HOJE, visao))).toBeUndefined();
    expect(await painelDoDia(a, alcanceDe('GERENTE', [ids.vp]), '/erp', HOJE, { tipo: 'loja', lojaId: ids.meier, nome: 'Méier' })).toEqual({ indicadores: [], pendencias: [] });
    // Sem ver faturamento: nem a pendência nem o número.
    const operador = await painelDoDia(a, alcanceDe('OPERADOR', [ids.vp]), '/erp', HOJE, visao);
    expect(JSON.stringify(operador)).not.toMatch(/faturamento|canais sem lançamento/i);

    // A Home de verdade: o grupo, o indicador afetado e o link.
    const h = await homeDoGerente();
    expect(h).toContain('aria-label="Pontos de atenção"');
    expect(h).toContain('Completar dados');
    expect(h).toContain('2 canais sem lançamento neste mês');
    expect(h).toContain('Indicador afetado: Faturamento de outubro');
    expect(h).toContain(`href="/erp/faturamento?mes=2026-10&amp;loja=${ids.vp}&amp;volta=%2Ferp">Lançar o que falta</a>`);
    expect(h).not.toMatch(/Méier|Casa do B/);
  });

  it('leitura que falha não resolve: a pendência fica "não conferida", sem número e sem "Lançar"', async () => {
    const visao = naLoja(ids.vp, 'Vila da Penha');
    const p = await painelDoDia(doParceiro(A.id, quebrado), alcanceDe('GERENTE', [ids.vp]), '/erp', HOJE, visao);
    expect(p.estados?.find((e) => e.chave === 'faturamento')?.estado).toBe('erro');
    expect(pendencia(p)).toMatchObject({ leitura: 'nao_conferida', acao: 'Ver o faturamento', href: `/erp/faturamento?mes=2026-10&loja=${ids.vp}&volta=%2Ferp` });
    expect(pendencia(p)!.titulo).not.toMatch(/\d/);
    expect(JSON.stringify(p)).not.toMatch(/Lançar o que falta|ff_inexistente|Prisma|P1003/);
  });

  it('visitar, voltar, salvar com erro, volta forjada e acesso revogado não mudam a Home', async () => {
    const antes = await homeDoGerente();
    expect(antes).toContain('2 canais sem lançamento neste mês');
    const href = `/erp/faturamento?mes=2026-10&loja=${ids.vp}&volta=%2Ferp`;
    // O mês aberto pelo link: o mesmo recorte, "Voltar para o início" (leitura nova da Home) e os dias com falta levando a volta.
    const mes = html(await ErpFaturamentoPage({ searchParams: query(href) }));
    expect(mes).toContain('<a href="/erp" class=');
    expect(mes).toContain('Voltar para o início');
    expect(mes).toContain('2 canais sem lançamento neste mês.');
    expect(mes).toContain(`href="/erp/faturamento/${ids.vp}/2026-10-15?volta=%2Ferp"`);
    expect(mes).toContain(`href="/erp/faturamento/${ids.vp}/2026-10-16?volta=%2Ferp"`);
    expect(mes).not.toMatch(/Méier|Casa do B/);
    // O dia: Voltar para o mês com os filtros e a volta; o formulário leva a volta.
    const dia = html(await ErpDiaPage({ params: { lojaId: ids.vp, data: '2026-10-15' }, searchParams: { volta: '/erp' } }));
    expect(dia).toContain(`href="/erp/faturamento?mes=2026-10&amp;loja=${ids.vp}&amp;volta=%2Ferp">Voltar para o mês</a>`);
    expect(dia).toContain('<input type="hidden" name="volta" value="/erp"/>');
    // Volta inválida: o mês e o dia ficam como sempre (sem "Voltar para o início" e sem levar volta adiante).
    for (const volta of ['https://fora.test/erp', '//fora.test', '/erp/insumos', '/erp?sem-acesso=1', '/%65rp', `/rodolfo/erp/${A.slug}`, '/erp/dre/despesas?linha=x']) {
      const m = html(await ErpFaturamentoPage({ searchParams: { mes: '2026-10', loja: ids.vp, volta } }));
      expect(m, volta).not.toContain('Voltar para o início');
      expect(m, volta).not.toContain('volta=');
      expect(temVoltarNoShell('/erp/faturamento', new URLSearchParams({ volta }).toString()), volta).toBe(true);
      const d = html(await ErpDiaPage({ params: { lojaId: ids.vp, data: '2026-10-15' }, searchParams: { volta } }));
      expect(d, volta).not.toContain('volta=');
      expect(d, volta).not.toContain('name="volta"');
      expect(d, volta).toContain(`href="/erp/faturamento?mes=2026-10&amp;loja=${ids.vp}">Voltar para o mês</a>`);
    }
    // Loja de outro parceiro pela URL do mês: ignorada (fica a loja da visão); no dia, 404.
    expect(html(await ErpFaturamentoPage({ searchParams: { mes: '2026-10', loja: ids.casaB, volta: '/erp' } }))).not.toContain('Casa do B');
    expect(await rodar(() => ErpDiaPage({ params: { lojaId: ids.casaB, data: '2026-10-16' }, searchParams: { volta: '/erp' } }))).toEqual({ erro: 'NOT_FOUND' });
    expect(await homeDoGerente()).toContain('2 canais sem lançamento neste mês');

    // Salvar com erro: volta ao formulário, nada gravado, a Home igual.
    const comErro = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-15', null, form({ IFOOD: { valor: '=1+1', pedidos: '2,5' } }, '/erp')));
    expect(comErro).toMatchObject({ ok: false });
    expect(await homeDoGerente()).toContain('2 canais sem lançamento neste mês');
    // Acesso revogado (perdeu "lançar faturamento"): a action recusa; a Home passa a oferecer só "Ver o faturamento".
    const revogado = alcanceDe('GERENTE', [ids.vp], [], ['faturamento.lancar']);
    como(revogado, 'Gil Gerente');
    const recusa = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-15', null, form({ IFOOD: { valor: '800,00', pedidos: '10' } }, '/erp')));
    expect(recusa).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('lançar faturamento') } });
    const semLancar = await painelDoDia(a, revogado, '/erp', HOJE, naLoja(ids.vp, 'Vila da Penha'));
    expect(pendencia(semLancar)).toMatchObject({ titulo: '2 canais sem lançamento neste mês', acao: 'Ver o faturamento' });
    // Gerente de outra loja tentando lançar a Vila da Penha: recusado.
    como(alcanceDe('GERENTE', [ids.meier]), 'Zé do Méier');
    expect(await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-15', null, form({ IFOOD: { valor: '800,00', pedidos: '10' } }, '/erp'))))
      .toMatchObject({ ok: false, erros: { geral: 'Essa loja não está no seu acesso.' } });
    expect(await a.faturamentoLancamento.count({ where: { lojaId: ids.vp, canal: 'IFOOD', data: new Date('2026-10-15T00:00:00.000Z') } })).toBe(0);
    expect(await homeDoGerente()).toContain('2 canais sem lançamento neste mês');
  });

  it('lançamento real pela action: a volta segue no redirecionamento e só a nova leitura muda a Home (2 → 1 → nenhuma)', async () => {
    como(alcanceDe('GERENTE', [ids.vp]), 'Gil Gerente');
    // Volta forjada no formulário: grava, mas o redirecionamento não a leva.
    const forjada = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-15', null, form({ IFOOD: { valor: '800,00', pedidos: '10' } }, 'https://fora.test/erp')));
    expect(forjada).toEqual({ redirect: `/erp/faturamento/${ids.vp}/2026-10-15?feito=salvo` });
    // A mesma action com a volta da Home (agora é "igual": nada muda, e a volta segue).
    const igual = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-15', null, form({ IFOOD: { valor: '800,00', pedidos: '10' } }, '/erp')));
    expect(igual).toEqual({ redirect: `/erp/faturamento/${ids.vp}/2026-10-15?feito=igual&volta=%2Ferp` });
    // A Home relê: uma falta a menos, e só por causa da leitura.
    const uma = await homeDoGerente();
    expect(uma).toContain('1 canal sem lançamento neste mês');
    expect(uma).not.toContain('2 canais sem lançamento');
    // O mês, de volta pelo "Voltar para o mês", mostra o mesmo.
    expect(html(await ErpFaturamentoPage({ searchParams: { mes: '2026-10', loja: ids.vp, volta: '/erp' } }))).toContain('1 canal sem lançamento neste mês.');
    const ultimo = await rodar(() => faturamentoDaSessao.acaoSalvarDia(ids.vp, '2026-10-16', null, form({ DELIVERY_PROPRIO: { valor: '300,00', pedidos: '5' } }, '/erp')));
    expect(ultimo).toEqual({ redirect: `/erp/faturamento/${ids.vp}/2026-10-16?feito=salvo&volta=%2Ferp` });
    const visao = naLoja(ids.vp, 'Vila da Penha');
    const depois = await painelDoDia(a, alcanceDe('GERENTE', [ids.vp]), '/erp', HOJE, visao);
    expect(pendencia(depois)).toBeUndefined();
    expect(depois.estados?.find((e) => e.chave === 'faturamento')?.estado).toBe('ok');
    const h = await homeDoGerente();
    expect(h).not.toMatch(/canais? sem lançamento|Lançar o que falta|Indicador afetado: Faturamento/);
    // Sem falso sucesso nem causalidade: a Home não diz que alguém resolveu.
    expect(h).not.toMatch(/resolvid|você resolveu|concluíd|parabéns/i);
    // Depois de completo, uma leitura que falha continua "não conferida" (não vira "completo" nem some).
    const falhou = await painelDoDia(doParceiro(A.id, quebrado), alcanceDe('GERENTE', [ids.vp]), '/erp', HOJE, visao);
    expect(pendencia(falhou)).toMatchObject({ leitura: 'nao_conferida' });
    // O Méier e o parceiro B continuam com as faltas deles.
    expect(pendencia(await painelDoDia(a, alcanceDe('DONO', 'rede'), '/erp', HOJE, { tipo: 'rede' }))).toMatchObject({ titulo: '2 canais sem lançamento neste mês' });
    expect(pendencia(await painelDoDia(b, alcanceDe('DONO', 'rede'), '/erp', HOJE, { tipo: 'rede' }))).toMatchObject({ titulo: '2 canais sem lançamento neste mês' });
    // Remover pela action também leva a volta; a falta volta à Home só pela leitura seguinte (a fonte manda nos dois sentidos).
    const delivery = await a.faturamentoLancamento.findFirst({ where: { lojaId: ids.vp, canal: 'DELIVERY_PROPRIO', data: new Date('2026-10-16T00:00:00.000Z') } });
    const fr = new FormData();
    fr.set('motivo', 'lançado no dia errado');
    fr.set('versao', delivery!.atualizadoEm.toISOString());
    fr.set('volta', '/erp');
    const removido = await rodar(() => faturamentoDaSessao.acaoRemoverLancamento(ids.vp, '2026-10-16', 'DELIVERY_PROPRIO', null, fr));
    expect(removido).toEqual({ redirect: `/erp/faturamento/${ids.vp}/2026-10-16?feito=removido&volta=%2Ferp` });
    expect(await homeDoGerente()).toContain('1 canal sem lançamento neste mês');
  });

  it('nível 1: a volta é a Home do parceiro do espelho, só ela; o lançamento pelo espelho segue o mesmo circuito', async () => {
    const raiz = `/rodolfo/erp/${A.slug}`;
    atual.ctx = () => ({ parceiro: A, alcance: ALCANCE_FLOWFOODS, cliente: a, bloqueio: null, sessao: { userId: 'rodolfo', autorNome: 'Rodolfo' } });
    const visao = naLoja(ids.meier, 'Méier');
    const p = await painelDoDia(a, ALCANCE_FLOWFOODS, raiz, HOJE, visao);
    const href = `${raiz}/faturamento?mes=2026-10&loja=${ids.meier}&volta=${encodeURIComponent(raiz)}`;
    expect(pendencia(p)).toMatchObject({ titulo: '2 canais sem lançamento neste mês', href, acao: 'Lançar o que falta' });
    expect(html(await Nivel1HomePage({ params: { slug: A.slug } }))).toContain(`href="${href.replace(/&/g, '&amp;')}">Lançar o que falta</a>`);
    const mes = html(await Nivel1FaturamentoPage({ params: { slug: A.slug }, searchParams: query(href) }));
    expect(mes).toContain(`<a href="${raiz}" class=`);
    expect(mes).toContain(`href="${raiz}/faturamento/${ids.meier}/2026-10-16?volta=${encodeURIComponent(raiz)}"`);
    expect(temVoltarNoShell(`${raiz}/faturamento`, `volta=${encodeURIComponent(raiz)}`)).toBe(false);
    // A Home do parceiro de fora, a do /erp ou outra tela do próprio parceiro não valem como volta.
    for (const volta of ['/erp', `/rodolfo/erp/${B.slug}`, `${raiz}/insumos`, '/rodolfo']) {
      expect(html(await Nivel1FaturamentoPage({ params: { slug: A.slug }, searchParams: { mes: '2026-10', loja: ids.meier, volta } })), volta).not.toContain('Voltar para o início');
    }
    const r = await rodar(() => faturamentoDoNivel1.acaoSalvarDia(A.slug, ids.meier, '2026-10-16', null, form({ DELIVERY_PROPRIO: { valor: '100,00', pedidos: '2' }, IFOOD: { valor: '100,00', pedidos: '2' } }, raiz)));
    expect(r).toEqual({ redirect: `${raiz}/faturamento/${ids.meier}/2026-10-16?feito=salvo&volta=${encodeURIComponent(raiz)}` });
    // A volta da área do parceiro (/erp) no formulário do nível 1 não passa.
    const outra = await rodar(() => faturamentoDoNivel1.acaoSalvarDia(A.slug, ids.meier, '2026-10-16', null, form({ IFOOD: { valor: '100,00', pedidos: '2' } }, '/erp')));
    expect(outra).toEqual({ redirect: `${raiz}/faturamento/${ids.meier}/2026-10-16?feito=igual` });
    expect(pendencia(await painelDoDia(a, ALCANCE_FLOWFOODS, raiz, HOJE, visao))).toBeUndefined();
    // B, que ninguém lançou, continua com as faltas; nada de A aparece nele.
    expect(pendencia(await painelDoDia(b, ALCANCE_FLOWFOODS, `/rodolfo/erp/${B.slug}`, HOJE, { tipo: 'rede' }))).toMatchObject({ titulo: '2 canais sem lançamento neste mês' });
  });
});
