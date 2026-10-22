/**
 * ERP 3.2 · a lista do dia nas telas (a página e as actions de verdade, com banco): o que cada pessoa recebe no HTML e o que as
 * actions deixam passar.
 *  - o gerente monta pela action (volta à lista, "lista-salva"), vê vai usar / tem / comprar com "falta" escrito, a base que
 *    falta produzir com "Pôr na lista", e gera os lotes pela action (o segundo envio volta "lotes-ja", sem lote novo);
 *  - a cozinha (Operador) lê a lista e os lotes, sem formulário; a action dela é recusada com a frase;
 *  - o chefe sem custos monta, mas o HTML não leva R$; o comprador vê "Lançar nota" e o limite seguro, sem "orçamento" nem R$;
 *  - gerente de outra loja e outro parceiro: 404; a entrada da aba leva direto quando há uma loja só;
 *  - a loja sem estoque aberto diz a frase (nunca "tem 0") e não oferece gerar; dia que passou fica para consulta;
 *  - o espelho do nível 1 abre a mesma tela com as ações dele.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao-lista-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/producao/lista',
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1], o?: { lojaId?: string }) => {
      if (!pode(ctx.alcance, p, o)) throw new Error('SEM_ACESSO');
    },
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { obterListaDoDia } from '@/lib/erp/producao-lista';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import ErpListaDoDiaPage from '@/app/erp/producao/lista/page';
import ErpListaDoDiaDaLojaPage from '@/app/erp/producao/lista/[lojaId]/page';
import ParceiroListaDoDiaDaLojaPage from '@/app/rodolfo/(painel)/erp/[slug]/producao/lista/[lojaId]/page';
import ErpHistoricoPage from '@/app/erp/historico/page';
import * as daSessao from '@/app/erp/producao/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/producao/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');
/** O texto visível (sem tags), para conferir frases que atravessam elementos. */
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 3.2 · telas da lista do dia (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `tl${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, parceiro = A, cliente = a, autor = 'Gil Gerente') => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: 'u-gil', autorNome: autor }, pessoa: { setores: ['GERENCIA'] } });
  };
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  const CHEFE_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.planejar', 'producao.registrar']);
  const COMPRADOR = () => alcanceDe(null, [ids.vp], ['producao.ver', 'compras.ver', 'compras.lancar']);

  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string; url?: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { erro: (e as Error).message, url: (e as { url?: string }).url };
    }
  };
  const pagina = async (el: Promise<unknown>) => sp(renderToStaticMarkup((await el) as ReactElement));
  const formDe = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  const lista = (lojaId = ids.vp, dia?: string, feito?: string) => pagina(ErpListaDoDiaDaLojaPage({ params: { lojaId }, searchParams: { dia, feito } }));

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Lista A', slug: `tlista-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Lista B', slug: `tlista-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const antes = new Date(Date.now() - 10 * DIA);
    const dona = alcanceDe('DONO', 'rede');
    expect((await iniciarAbertura(a, dona, ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, dona, ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '20', Leite: '2', Cebola: '10' };
    for (const i of ab.itens) expect((await contarItem(a, dona, ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, dona, ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    const base = await cadastrarFicha(a, { nome: 'Base de cebola', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1', unidade: 'kg', fator: '1,18' }] } as never, { tipo: 'manter' }, 'Marina');
    if (!base.ok) throw new Error(JSON.stringify(base));
    ids.base = base.id;
    const f = await cadastrarFicha(
      a,
      {
        nome: 'Molho cheddar',
        tipo: 'PRE_PREPARO',
        rendimento: '2',
        rendimentoUnidade: 'kg',
        itens: [
          { insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' },
          { insumoId: ids.leite, quantidade: '1', unidade: 'L' },
          { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' },
          { subfichaId: ids.base, quantidade: '200', unidade: 'g' },
        ],
      } as never,
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a entrada da aba leva direto à lista quando há uma loja só; sem lista, a cozinha lê que a gerência define', async () => {
    como(OPERADOR(), A, a, 'Caio Cozinha');
    expect(await rodar(() => ErpListaDoDiaPage())).toMatchObject({ url: `/erp/producao/lista/${ids.vp}` });
    const h = await lista();
    expect(h).toContain('Lista do dia');
    expect(h).toContain('Sem lista neste dia.');
    expect(h).toContain('Quem define a lista é a gerência');
    expect(h).not.toContain('Salvar a lista');
  });

  it('o gerente monta pela action (volta à lista com "lista-salva") e vê vai usar / tem / comprar, com "falta" escrito e a base que falta produzir', async () => {
    como(GERENTE());
    const vazio = await lista();
    expect(vazio).toContain('Salvar a lista');
    expect(vazio).toContain('inputMode="decimal"');
    const r = await rodar(() => daSessao.acaoSalvarListaDoDia(ids.vp, null, formDe({ dia: hoje, versao: '', linhaId: [''], fichaId: [ids.molho], quantidade: ['5'] })));
    expect(r).toMatchObject({ url: `/erp/producao/lista/${ids.vp}?dia=${hoje}&feito=lista-salva` });
    // Reenviar o mesmo formulário (duplo clique): volta "lista-ja", sem gravar de novo.
    const de_novo = await rodar(() => daSessao.acaoSalvarListaDoDia(ids.vp, null, formDe({ dia: hoje, versao: '', linhaId: [''], fichaId: [ids.molho], quantidade: ['5'] })));
    expect(de_novo).toMatchObject({ url: expect.stringMatching(/feito=lista-ja$/) });
    const h = await lista(ids.vp, hoje, 'lista-salva');
    const t = texto(h);
    expect(t).toContain('Lista salva.');
    expect(t).toContain('Matéria-prima: vai usar, tem e comprar');
    // Leite: vai usar 2,5 L, tem 2 L → falta 500 ml (a palavra vai junto da cor).
    expect(t).toContain('falta 500 ml');
    expect(t).toContain('2,5 L');
    expect(h).toMatch(/text-erro">falta 500 ml/);
    expect(t).toMatch(/dá/);
    // A base que o molho usa (500 g para 5 kg de molho) falta produzir, com o "Pôr na lista".
    expect(t).toContain('Pré-preparos que entram nas receitas');
    expect(t).toContain('falta produzir 500 g');
    expect(t).toContain('Pôr na lista');
    // O gerente vê custos (ver insumos e custos): a compra estimada vem com R$.
    expect(t).toContain('compra estimada do que falta, pelo último preço pago');
    expect(t).toContain('R$');
    expect(t).toContain('Gerar o lote');
    // O formulário leva as linhas em aberto que mostrou: no salvar (`vistas`) e no gerar (`linha`).
    const aberta = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!.linhas[0].id;
    expect(h).toContain(`name="vistas" value="${aberta}"`);
    expect(h).toContain(`name="linha" value="${aberta}"`);
    // O resumo da conta como atalho logo abaixo do Gerar (no celular a matéria-prima fica lá embaixo).
    expect(h).toContain('href="#materia-prima"');
    expect(h).toContain('id="materia-prima"');
    expect(t).toMatch(/\d+ insumos? falta(m)?( · \d+ abaixo de zero)?: ver a matéria-prima/);
  });

  it('a cozinha (Operador) lê a lista sem formulário; a action dela é recusada com a frase; o chefe sem custos monta sem receber R$', async () => {
    como(OPERADOR(), A, a, 'Caio Cozinha');
    const h = await lista();
    const t = texto(h);
    expect(t).toContain('Molho cheddar');
    expect(t).toContain('Na lista');
    expect(t).toContain('falta 500 ml');
    expect(h).not.toContain('Salvar a lista');
    expect(t).not.toContain('Pôr na lista');
    expect(t).not.toContain('Gerar o lote');
    // O operador padrão TEM "ver insumos e custos", mas na lista do dia a cozinha lê só quantidades: o servidor monta sem o
    // valor e sem o painel "Para quem compra" (decisão 226).
    expect(OPERADOR().permissoes.has('insumos.ver')).toBe(true);
    expect(h).not.toContain('R$');
    expect(t).not.toContain('compra estimada');
    expect(t).not.toContain('Para quem compra');
    expect(t).not.toContain('pelo último preço');
    const daCozinha = (await obterListaDoDia(a, OPERADOR(), ids.vp, hoje))!;
    expect(daCozinha.custo).toBeNull();
    expect(daCozinha.pode.verCustos).toBe(false);
    // A quantidade da linha, para quem lê, vem na cor do texto e em negrito (sem o cinza de apoio).
    expect(h).toMatch(/Molho cheddar <span class="whitespace-nowrap tabular-nums">· 5 kg<\/span>/);
    const r = await rodar(() => daSessao.acaoSalvarListaDoDia(ids.vp, null, formDe({ dia: hoje, versao: '1', linhaId: [''], fichaId: [ids.molho], quantidade: ['1'] })));
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/definir a lista do dia/) } });
    // O chefe sem "ver insumos e custos": monta, e o HTML não leva R$ nem "compra estimada".
    como(CHEFE_SEM_CUSTO());
    const c = await lista();
    expect(c).toContain('Salvar a lista');
    expect(c).not.toContain('R$');
    expect(c).not.toContain('compra estimada');
  });

  it('o comprador vê "Lançar nota" e o limite seguro (sem "orçamento" no número, sem R$); quem não vê produção não abre', async () => {
    como(COMPRADOR());
    const h = await lista();
    const t = texto(h);
    expect(t).toContain('Para quem compra');
    expect(t).toContain('Lançar nota');
    expect(t).toMatch(/Limite seguro de compra de Vila da Penha em .*: sem número \(falta a meta do CMV\)/);
    expect(t).toContain('Ver o limite seguro');
    expect(h).not.toContain('R$');
    expect(h).not.toContain('Salvar a lista');
    como(alcanceDe(null, [ids.vp], ['compras.ver']));
    expect(await rodar(() => lista())).toMatchObject({ erro: 'SEM_ACESSO' });
  });

  it('gerar os lotes pela action: volta "lotes-gerados", a linha mostra o lote e a etapa; o segundo envio volta "lotes-ja", sem lote novo', async () => {
    como(GERENTE());
    const l = (await obterListaDoDia(a, GERENTE(), ids.vp, hoje))!;
    const v = l.lista!.versao;
    // O formulário manda as linhas em aberto que mostrou (`linha`): sem nenhuma, nada vira lote (decisão 228).
    expect(await rodar(() => daSessao.acaoGerarLotesDaLista(ids.vp, null, formDe({ dia: hoje, versao: String(v) })))).toMatchObject({ ok: false, erros: { geral: 'Nenhum pré-preparo em aberto para virar lote.' } });
    expect(await a.ordemProducao.count()).toBe(0);
    const vistas = l.linhas.filter((x) => x.estado === 'NA_LISTA').map((x) => x.id);
    const r = await rodar(() => daSessao.acaoGerarLotesDaLista(ids.vp, null, formDe({ dia: hoje, versao: String(v), linha: vistas })));
    expect(r).toMatchObject({ url: `/erp/producao/lista/${ids.vp}?dia=${hoje}&feito=lotes-gerados` });
    const de_novo = await rodar(() => daSessao.acaoGerarLotesDaLista(ids.vp, null, formDe({ dia: hoje, versao: String(v), linha: vistas })));
    expect(de_novo).toMatchObject({ url: expect.stringMatching(/feito=lotes-ja$/) });
    expect(await a.ordemProducao.count()).toBe(1);
    const hg = await lista(ids.vp, hoje, 'lotes-gerados');
    const t = texto(hg);
    expect(t).toContain('Lotes gerados.');
    expect(t).toContain('Já viraram lote');
    expect(t).toMatch(/Planejada Lote \d{6}-01/);
    expect(t).toContain('Lotes gerados');
    // Depois de gerar, o aviso vem para a vista (a tela volta na mesma rolagem) e o formulário não abre linha vazia:
    // só "Mais um pré-preparo", com "Salvar" secundário.
    expect(hg).toMatch(/<div tabindex="-1" class="scroll-mt-24 outline-none"><div role="status"[^>]*>.*?Lotes gerados\./);
    expect(hg).not.toContain('<select');
    expect(t).toContain('Mais um pré-preparo');
    expect(t).toContain('Tudo o que estava na lista já virou lote.');
    expect(hg).not.toContain('Gerar o lote');
    // A cozinha vê o lote da lista (link para o lote), ainda sem formulário.
    como(OPERADOR(), A, a, 'Caio Cozinha');
    const h = await lista();
    expect(h).toMatch(new RegExp(`href="/erp/producao/${ids.vp}/[a-z0-9]+"`));
  });

  it('Histórico geral: a lista do dia entra no filtro Produção; quem não vê a produção não recebe nada dela', async () => {
    como(alcanceDe('DONO', 'rede'));
    const dona = texto(await pagina(ErpHistoricoPage({ searchParams: { entidade: 'OrdemProducao' } })));
    expect(dona).toMatch(/Gerou os lotes da lista do dia/);
    expect(dona).toMatch(/Criou lista do dia/);
    como(alcanceDe(null, 'rede', ['historico.ver', 'insumos.ver']));
    const semProducao = texto(await pagina(ErpHistoricoPage({ searchParams: {} })));
    expect(semProducao).not.toMatch(/lista do dia/i);
    expect(semProducao).not.toMatch(/Lote/);
  });

  it('alcance: o gerente da Delivery e o outro parceiro recebem 404 na lista da Penha', async () => {
    como(GERENTE_DELIVERY());
    expect(await rodar(() => lista())).toMatchObject({ erro: 'NOT_FOUND' });
    como(alcanceDe('DONO', 'rede'), B, b);
    expect(await rodar(() => lista())).toMatchObject({ erro: 'NOT_FOUND' });
  });

  it('loja sem estoque aberto: a frase do motivo (nunca "tem 0") e nada de gerar; dia que passou fica para consulta', async () => {
    como(GERENTE_DELIVERY());
    expect(await rodar(() => daSessao.acaoSalvarListaDoDia(ids.delivery, null, formDe({ dia: hoje, versao: '', linhaId: [''], fichaId: [ids.molho], quantidade: ['2'] })))).toMatchObject({ url: expect.stringMatching(/feito=lista-salva$/) });
    const t = texto(await lista(ids.delivery));
    expect(t).toContain('O estoque da Delivery ainda não foi aberto: não há saldo para cruzar.');
    expect(t).toContain('Sem saldo para cruzar: só o que vai usar');
    expect(t).not.toMatch(/tem 0\b/);
    expect(t).toContain('O estoque da Delivery ainda não foi aberto: o lote baixa os insumos do estoque');
    como(GERENTE());
    const ontem = texto(await lista(ids.vp, somarDias(hoje, -1)));
    expect(ontem).toContain('Dia que já passou: a lista fica para consulta.');
    expect(ontem).not.toContain('Salvar a lista');
    // Fora do prazo: a frase uma vez só (no aviso de cima), e nada de "Monte a lista" para quem não pode montar nesse dia.
    const longe = texto(await lista(ids.vp, somarDias(hoje, 20)));
    expect(longe.split('A lista se monta de hoje até 14 dias à frente.').length - 1).toBe(1);
    expect(longe).toContain('Sem lista neste dia.');
    expect(longe).not.toContain('Monte a lista');
    expect(longe).toContain('Sem lista, nada a tirar do estoque.');
  });

  it('o espelho do nível 1 abre a mesma lista, com as ações dele (salvar pelo espelho volta ao espelho)', async () => {
    como(ALCANCE_FLOWFOODS, A, a, 'Rodolfo');
    const h = await pagina(ParceiroListaDoDiaDaLojaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: { dia: amanhaDe(hoje) } }));
    expect(h).toContain('Lista do dia');
    expect(h).toContain('Telas Lista A');
    expect(h).toContain('Salvar a lista');
    const r = await rodar(() => doNivel1.acaoSalvarListaDoDia(A.slug, ids.vp, null, formDe({ dia: amanhaDe(hoje), versao: '', linhaId: [''], fichaId: [ids.base], quantidade: ['1'] })));
    expect(r).toMatchObject({ url: `/rodolfo/erp/${A.slug}/producao/lista/${ids.vp}?dia=${amanhaDe(hoje)}&feito=lista-salva` });
    expect(await rodar(() => pagina(ParceiroListaDoDiaDaLojaPage({ params: { slug: A.slug, lojaId: 'outra' }, searchParams: {} })))).toMatchObject({ erro: 'NOT_FOUND' });
  });
});

function amanhaDe(dia: string) {
  return somarDias(dia, 1);
}
