/**
 * Decisão 523 · o custo de agora dos insumos no formulário de nota (e na prévia do "Conferir o impacto") só para quem vê custo de
 * compra (`compras.ver`), pelas páginas e actions reais (Postgres real), nas duas áreas.
 *
 *  - quem só lança nota (perfil próprio) e o operador que ganhou "lançar nota" (tem `insumos.ver`, que não é régua de R$): Lançar
 *    e Editar não levam ao navegador o custo de agora nem a data da última compra (nem a chave no que a página entrega ao
 *    `FormNota`, que é o que vai no RSC), e o HTML não tem "hoje R$ …"; a linha do item continua com a conta do que se digita;
 *  - a prévia do "Conferir o impacto" de quem só lança traz o total e o estoque, sem o custo antes → depois e sem as fichas;
 *  - quem vê compras (perfil próprio que vê e lança, a dona, o nível 1) recebe tudo como antes.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-compra-custo-523.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string }, caminho: '/erp' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => atual.caminho,
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
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1], escopo?: { lojaId?: string }) => {
      if (!pode(ctx.alcance, p, escopo)) throw new Error('SEM_ACESSO');
    },
    visaoDaRequisicao: async () => ({ visao: atual.visao }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota, obterNota, type PreviaDaNota } from '@/lib/erp/compras';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { formatarCusto, type CustoExato } from '@/lib/erp/unidades';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { FormNota } from '@/components/erp/telas/compras/form-nota';
import { PreviaDoImpacto } from '@/components/erp/telas/compras/previa';
import type { EstadoNota } from '@/components/erp/telas/compras/estado';
import ErpLancarNotaPage from '@/app/erp/compras/nova/page';
import ErpEditarNotaPage from '@/app/erp/compras/[id]/editar/page';
import ErpNotaPage from '@/app/erp/compras/[id]/page';
import Nivel1LancarNotaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/nova/page';
import Nivel1EditarNotaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/[id]/editar/page';
import * as acoesDoParceiro from '@/app/erp/compras/actions';
import * as acoesDoNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/compras/actions';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

relogioDoCenario('2026-10-17T12:00:00-03:00');

const sp = (t: string) => t.replace(/&nbsp;| | /g, ' ');
/** O texto visível do HTML (sem marcação), para ler a linha do item como a pessoa lê. */
const texto = (h: string) => sp(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');

describe.skipIf(!URL_TESTE)('Decisão 523 · custo de agora no formulário de nota só para quem vê compras (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const proprio = (permissoes: string[]): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const DONA = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  /** Lança nota e não vê compras (perfil próprio). */
  const SO_LANCA = proprio(['compras.lancar', 'lojas.ver']);
  /** O operador que ganhou "lançar nota": tem `insumos.ver` ("Ver insumos e custos"), que não é a régua do R$ de compra. */
  const OPERADOR_QUE_LANCA = resolverAlcance({ perfilBase: 'OPERADOR', perfilProprio: null, permissoesExtras: ['compras.lancar'], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  /** Vê e lança (perfil próprio). */
  const VE_E_LANCA = proprio(['compras.ver', 'compras.lancar', 'lojas.ver']);
  const SEM_CUSTO = () => [
    { nome: 'só lança', alcance: SO_LANCA },
    { nome: 'operador que lança', alcance: OPERADOR_QUE_LANCA },
  ];

  /** As duas áreas: as páginas e a action de cada uma. O nível 1 real é sempre `ALCANCE_FLOWFOODS`. */
  const AREAS = () => [
    {
      nome: 'parceiro',
      raiz: '/erp',
      quemVe: [
        { nome: 'vê e lança', alcance: VE_E_LANCA },
        { nome: 'dona', alcance: DONA },
      ],
      nova: () => ErpLancarNotaPage(),
      editar: (id: string) => ErpEditarNotaPage({ params: { id } }),
      conferir: (form: FormData, notaId = '') => acoesDoParceiro.acaoSalvarNota(notaId, null, form),
    },
    {
      nome: 'nível 1',
      raiz: `/rodolfo/erp/${A.slug}`,
      quemVe: [{ nome: 'nível 1', alcance: ALCANCE_FLOWFOODS }],
      nova: () => Nivel1LancarNotaPage({ params: { slug: A.slug } }),
      editar: (id: string) => Nivel1EditarNotaPage({ params: { slug: A.slug, id } }),
      conferir: (form: FormData, notaId = '') => acoesDoNivel1.acaoSalvarNota(A.slug, notaId, null, form),
    },
  ];
  const como = (alcance: Alcance) => {
    atual.ctx = () => ({ parceiro: A, alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
  };

  /**
   * O que a página entrega ao navegador: a árvore que `TelaFormNota` (componente do servidor) monta, com as props do `FormNota`
   * (componente do navegador). É isto que vai serializado no RSC; a nota inteira que `TelaFormNota` recebe fica no servidor.
   */
  async function doNavegador(pagina: unknown) {
    const el = (await pagina) as ReactElement<Parameters<typeof TelaFormNota>[0]>;
    expect(el.type).toBe(TelaFormNota);
    const arvore = TelaFormNota(el.props);
    let form: Parameters<typeof FormNota>[0] | null = null;
    const andar = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(andar);
      if (!isValidElement(x)) return;
      if (x.type === FormNota) form = x.props as Parameters<typeof FormNota>[0];
      andar((x.props as { children?: unknown }).children);
    };
    andar(arvore);
    expect(form).not.toBeNull();
    const json = JSON.stringify(arvore, (k, v) => (['_owner', '_store', '_self', '_source'].includes(k) ? undefined : v));
    return { form: form!, json, html: sp(renderToStaticMarkup(el)) };
  }

  /** "Conferir" de uma nota nova (3 caixas por R$ 300,00 = R$ 20,00/kg) ou, com `editar`, da nota de 14/10 da Penha. */
  const formDaPrevia = (editar?: { versao: string }) => {
    const f = new FormData();
    const campos = editar
      ? // A nota de 14/10 com a data de hoje e R$ 300,00 + R$ 6,00: passa a ser a mais nova (R$ 20,40/kg).
        { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '000123', serie: '1', data: '2026-10-17', frete: '6,00', total: '306,00', versao: editar.versao }
      : { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '000200', serie: '1', data: '2026-10-17', frete: '', total: '300,00' };
    for (const [k, v] of Object.entries({ ...campos, intencao: 'conferir' })) f.set(k, v);
    f.append('item_insumo', ids.cheddar);
    f.append('item_embalagem', `v:${ids.caixa}`);
    f.append('item_quantidade', '3');
    f.append('item_valor', '300,00');
    return f;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Custo 523', slug: `custo-523-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['meier', 'Méier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const ched = await cadastrarInsumoDeTeste(a, { nome: 'Cheddar', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '40,00' });
    if (!ched.ok) throw new Error(JSON.stringify(ched));
    ids.cheddar = ched.id;
    // Sem nota: o custo de agora é o preço do cadastro.
    const bacon = await cadastrarInsumoDeTeste(a, { nome: 'Bacon', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '37,13' });
    if (!bacon.ok) throw new Error(JSON.stringify(bacon));
    ids.bacon = bacon.id;
    const cx = await cadastrarVariante(a, ids.cheddar, { nome: 'Caixa', escala: 'base', conteudo: '5', preco: '200,00' });
    if (!cx.ok) throw new Error(JSON.stringify(cx));
    ids.caixa = cx.id;
    const f = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.fornecedor = f.id;
    const molho = await cadastrarFicha(a, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }] }, { tipo: 'manter' }, 'Marina');
    if (!molho.ok) throw new Error(JSON.stringify(molho));

    // Penha 14/10: 3 caixas de 5 kg por R$ 269,70 + R$ 6,00 de frete = R$ 18,38/kg (a nota que se edita).
    // Méier 16/10: 3 caixas por R$ 281,70, sem frete = R$ 18,78/kg, a mais nova: é o custo de agora do cheddar.
    for (const [chave, loja, data, numero, valor, frete] of [
      ['outubro', ids.vp, '2026-10-14', '000123', '269,70', '6,00'],
      ['meier', ids.meier, '2026-10-16', '000140', '281,70', ''],
    ] as const) {
      const total = frete ? '275,70' : valor;
      const r = await lancarNota(a, DONA, { lojaId: loja, fornecedorId: ids.fornecedor, numero, serie: '1', data, frete, total, itens: [{ insumoId: ids.cheddar, embalagem: `v:${ids.caixa}`, quantidade: '3', valor }] }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('quem só lança (e o operador que lança), nas duas áreas: Lançar e Editar sem o custo de agora nem a data da última compra; a linha do item continua', async () => {
    for (const area of AREAS()) {
      for (const p of SEM_CUSTO()) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
        atual.caminho = `${area.raiz}/compras/nova`;
        const nova = await doNavegador(area.nova());
        // Os insumos continuam no seletor, com unidade e embalagens (o que a conta da linha precisa).
        expect(nova.form.opcoes.insumos.map((i) => i.nome), onde).toEqual(['Bacon', 'Cheddar']);
        expect(nova.form.opcoes.insumos.find((i) => i.nome === 'Cheddar')!.embalagens.map((e) => e.nome), onde).toEqual(['Caixa']);
        for (const i of nova.form.opcoes.insumos) {
          expect(Object.keys(i), `${onde}: ${i.nome}`).not.toContain('custo');
          expect(Object.keys(i), `${onde}: ${i.nome}`).not.toContain('ultimaCompraEm');
        }
        // Nada no que vai ao navegador: nem a chave, nem a data da última compra.
        expect(nova.json, onde).not.toMatch(/"custo"|"ultimaCompraEm"|2026-10-16/);
        expect(nova.html, onde).not.toMatch(/· hoje|sem custo informado|R\$ 18,78|R\$ 37,13/);

        atual.caminho = `${area.raiz}/compras/${ids.outubro}/editar`;
        const editar = await doNavegador(area.editar(ids.outubro));
        expect(editar.json, onde).not.toMatch(/"custo"|"ultimaCompraEm"|2026-10-16/);
        expect(editar.html, onde).not.toMatch(/· hoje|sem custo informado|R\$ 18,78|R\$ 37,13/);
        // A linha do item: a conta do que está digitado (R$ 269,70 + R$ 6,00 ÷ 15 kg), sem o "hoje".
        expect(texto(editar.html), onde).toContain('15 kg · R$ 18,38/kg com frete');
        expect(texto(editar.html), onde).not.toContain('com frete ·');
        expect(editar.html, onde).toContain('R$ 269,70 + R$ 6,00 de frete = R$ 275,70');
      }
    }
  });

  it('quem vê compras, nas duas áreas: o custo de agora chega como antes (a data da última compra, a ninguém), e o Editar diz "hoje R$ 18,78/kg"', async () => {
    for (const area of AREAS()) {
      for (const p of area.quemVe) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        atual.visao = { tipo: 'rede' };
        atual.caminho = `${area.raiz}/compras/nova`;
        const nova = await doNavegador(area.nova());
        const porNome = new Map(nova.form.opcoes.insumos.map((i) => [i.nome, i]));
        expect(sp(formatarCusto(porNome.get('Cheddar')!.custo as CustoExato, 'KG')), onde).toBe('R$ 18,78/kg');
        expect(sp(formatarCusto(porNome.get('Bacon')!.custo as CustoExato, 'KG')), onde).toBe('R$ 37,13/kg');
        // A data da última compra não vai para ninguém (nenhuma tela usa; diria que houve compra em loja que a pessoa pode não ver).
        for (const i of nova.form.opcoes.insumos) expect(Object.keys(i), `${onde}: ${i.nome}`).not.toContain('ultimaCompraEm');
        expect(nova.json, onde).not.toMatch(/"ultimaCompraEm"|2026-10-16/);

        atual.caminho = `${area.raiz}/compras/${ids.outubro}/editar`;
        const editar = await doNavegador(area.editar(ids.outubro));
        expect(texto(editar.html), onde).toContain('15 kg · R$ 18,38/kg com frete · hoje R$ 18,78/kg');
      }
    }
  });

  it('"Conferir o impacto", nas duas áreas: quem só lança vê o total e o estoque, sem custo antes → depois e sem fichas; quem vê compras, tudo', async () => {
    const notas = await a.notaEntrada.count();
    for (const area of AREAS()) {
      for (const p of SEM_CUSTO()) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        const r = (await area.conferir(formDaPrevia())) as NonNullable<EstadoNota>;
        expect(r.erros, onde).toEqual({});
        const previa = r.previa!;
        expect(previa.veCusto, onde).toBe(false);
        expect(previa.custos, onde).toEqual([]);
        expect(previa.fichas, onde).toEqual([]);
        expect(previa.maisFichas, onde).toBe(0);
        expect(previa.totalCentavos, onde).toBe(30_000);
        // Nada do custo de agora, do preço do cadastro nem das fichas na resposta da action (que vai no RSC).
        expect(JSON.stringify(r), onde).not.toMatch(/18,78|40,00|Molho cheddar|"antes"|"depois"|"vale"/);
        const h = sp(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa })));
        expect(h, onde).toContain('Prévia: total e estoque');
        expect(h, onde).toContain('Itens R$ 300,00 + frete R$ 0,00 = <span class="font-semibold">R$ 300,00</span>');
        expect(h, onde).toContain('>Estoque</h3>');
        expect(h, onde).not.toMatch(/R\$ 18,78|R\$ 20,00\/kg|Fichas que mudam junto|o que muda no custo|Cheddar/);
      }
      for (const p of area.quemVe) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        const r = (await area.conferir(formDaPrevia())) as NonNullable<EstadoNota>;
        const previa = r.previa! as Extract<PreviaDaNota, { veCusto: true }>;
        expect(previa.veCusto, onde).toBe(true);
        const ched = previa.custos.find((i) => i.nome === 'Cheddar')!;
        expect([sp(ched.antes), sp(ched.depois), ched.efeito], onde).toEqual(['R$ 18,78/kg', 'R$ 20,00/kg', 'sobe']);
        expect(previa.fichas.map((f) => f.nome), onde).toContain('Molho cheddar');
        const h = sp(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa })));
        expect(h, onde).toContain('Prévia: o que muda no custo');
        expect(h, onde).toContain('Fichas que mudam junto');
        expect(texto(h), onde).toContain('R$ 18,78/kg → passa a R$ 20,00/kg');
      }
    }
    expect(await a.notaEntrada.count()).toBe(notas);
  });

  it('"Conferir" na edição, nas duas áreas: quem só lança recebe a prévia sem custo nem fichas; quem vê compras, o custo de antes → depois e as fichas', async () => {
    const versao = (await obterNota(a, DONA, ids.outubro))!.versao;
    const antes = await a.notaEntrada.findUnique({ where: { id: ids.outubro }, select: { atualizadoEm: true, totalCentavos: true } });
    for (const area of AREAS()) {
      for (const p of SEM_CUSTO()) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        const r = (await area.conferir(formDaPrevia({ versao }), ids.outubro)) as NonNullable<EstadoNota>;
        expect(r.erros, onde).toEqual({});
        const previa = r.previa!;
        expect([previa.veCusto, previa.custos, previa.fichas, previa.maisFichas], onde).toEqual([false, [], [], 0]);
        expect(previa.totalCentavos, onde).toBe(30_600);
        expect(JSON.stringify(r), onde).not.toMatch(/18,78|40,00|Molho cheddar|"antes"|"depois"|"vale"/);
      }
      for (const p of area.quemVe) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        const r = (await area.conferir(formDaPrevia({ versao }), ids.outubro)) as NonNullable<EstadoNota>;
        const previa = r.previa! as Extract<PreviaDaNota, { veCusto: true }>;
        expect(previa.veCusto, onde).toBe(true);
        const ched = previa.custos.find((i) => i.nome === 'Cheddar')!;
        expect([sp(ched.antes), sp(ched.depois), ched.efeito], onde).toEqual(['R$ 18,78/kg', 'R$ 20,40/kg', 'sobe']);
        expect(previa.fichas.map((f) => f.nome), onde).toContain('Molho cheddar');
      }
    }
    // "Conferir" não grava: a nota continua como estava.
    expect(await a.notaEntrada.findUnique({ where: { id: ids.outubro }, select: { atualizadoEm: true, totalCentavos: true } })).toEqual(antes);
  });

  it('o detalhe da nota (só com `compras.ver`) diz, depois de lançar, que o custo vale onde a nota é a compra mais recente', async () => {
    como(DONA);
    const h = sp(renderToStaticMarkup((await ErpNotaPage({ params: { id: ids.outubro }, searchParams: { feito: 'lancada' } })) as ReactElement));
    expect(h).toContain('Nota lançada. Onde ela é a compra mais recente do insumo, o custo dela já vale nas fichas.');
    expect(h).not.toContain('O custo dos insumos dela já vale nas fichas.');
    // A própria nota da Penha não é a mais recente do cheddar (a do Méier é), e o item diz isso.
    expect(h).toContain('vale a de 16/10/2026');
    // Quem só lança não abre o detalhe (é de `compras.ver`): a frase nunca chega a ele.
    como(SO_LANCA);
    await expect(ErpNotaPage({ params: { id: ids.outubro }, searchParams: { feito: 'lancada' } })).rejects.toThrow('SEM_ACESSO');
  });
});
