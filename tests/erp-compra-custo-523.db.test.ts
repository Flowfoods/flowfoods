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
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormStatus: () => ({ pending: false }) }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useActionState: (_acao: unknown, inicial: unknown) => [inicial, undefined] }));
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
import { cadastrarLoja, salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, cancelarNota, editarNota, lancarNota, obterNota, previaDaNota, type PreviaDaNota } from '@/lib/erp/compras';
import { lerEntradaDaNota } from '@/components/erp/telas/compras/executar';
import { lerRetornoDeCompra } from '@/lib/erp/compra-retorno';
import { obterDocumento, receberXml } from '@/lib/erp/documentos-fiscais';
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
import { bytes, xmlDe } from './erp-documento-fiscal-apoio';

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
  let B: typeof A;
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
      nova: () => ErpLancarNotaPage({}),
      editar: (id: string) => ErpEditarNotaPage({ params: Promise.resolve({ id }) }),
      conferir: (form: FormData, notaId = '') => acoesDoParceiro.acaoSalvarNota(notaId, null, form),
    },
    {
      nome: 'nível 1',
      raiz: `/rodolfo/erp/${A.slug}`,
      quemVe: [{ nome: 'nível 1', alcance: ALCANCE_FLOWFOODS }],
      nova: () => Nivel1LancarNotaPage({ params: Promise.resolve({ slug: A.slug }) }),
      editar: (id: string) => Nivel1EditarNotaPage({ params: Promise.resolve({ slug: A.slug, id }) }),
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
    ids.lojaOutra = ids.meier;
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
    B = (await db.parceiroFlow.create({ data: { nome: 'Parceiro isolado', slug: `custo-523-b-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    const b = doParceiro(B.id, db);
    const lojaB = await cadastrarLoja(b, { nome: 'Loja privada B' }, 'Teste');
    const insumoB = await cadastrarInsumoDeTeste(b, { nome: 'Insumo privado B', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '987,65' });
    const fornecedorB = await cadastrarFornecedor(b, { nome: 'Fornecedor privado B', ...SEM_NOTA_FISCAL }, 'Teste');
    if (!lojaB.ok || !insumoB.ok || !fornecedorB.ok) throw new Error('Fixture B inválida');
    ids.lojaB = lojaB.id;
    ids.insumoB = insumoB.id;
    const notaB = await lancarNota(b, DONA, { lojaId: lojaB.id, fornecedorId: fornecedorB.id, numero: 'B123', serie: '1', data: '2026-10-15', frete: '', total: '987,65', itens: [{ insumoId: insumoB.id, embalagem: 'padrao', quantidade: '1', valor: '987,65' }] }, 'Teste');
    if (!notaB.ok) throw new Error(JSON.stringify(notaB));
    ids.notaB = notaB.id;
  });

  afterAll(async () => {
    if (db && perfil) await limparParceiros(db, perfil, [A?.id, B?.id].filter((id): id is string => Boolean(id)));
    await db?.$disconnect();
  });

  it('quem só lança (e o operador que lança), nas duas áreas: Lançar sem custo histórico e Editar recusado', async () => {
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
        await expect(area.editar(ids.outubro), onde).rejects.toThrow();
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

  it('"Conferir" na edição, nas duas áreas: quem só lança é recusado; quem vê e lança mantém impacto e fichas', async () => {
    const versao = (await obterNota(a, DONA, ids.outubro))!.versao;
    const antes = await a.notaEntrada.findUnique({ where: { id: ids.outubro }, select: { atualizadoEm: true, totalCentavos: true } });
    for (const area of AREAS()) {
      for (const p of SEM_CUSTO()) {
        const onde = `${area.nome} · ${p.nome}`;
        como(p.alcance);
        const r = (await area.conferir(formDaPrevia({ versao }), ids.outubro)) as NonNullable<EstadoNota>;
        expect(r.erros.geral, onde).toContain('ver compras e notas');
        expect(r.previa, onde).toBeUndefined();
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
    const h = sp(renderToStaticMarkup((await ErpNotaPage({ params: Promise.resolve({ id: ids.outubro }), searchParams: Promise.resolve({ feito: 'lancada' }) })) as ReactElement));
    expect(h).toContain('Nota lançada. Onde ela é a compra mais recente do insumo, o custo dela já vale nas fichas.');
    expect(h).not.toContain('O custo dos insumos dela já vale nas fichas.');
    // A própria nota da Penha não é a mais recente do cheddar (a do Méier é), e o item diz isso.
    expect(h).toContain('vale a de 16/10/2026');
    // Quem só lança não abre o detalhe (é de `compras.ver`): a frase nunca chega a ele.
    como(SO_LANCA);
    await expect(ErpNotaPage({ params: Promise.resolve({ id: ids.outubro }), searchParams: Promise.resolve({ feito: 'lancada' }) })).rejects.toThrow('SEM_ACESSO');
  });

  const restrito = (ve: boolean) => resolverAlcance({ perfilBase: null, perfilProprio: ['compras.lancar', 'lojas.ver', ...(ve ? ['compras.ver'] : [])], permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds: [ids.vp] });

  it('loja restrita: prévia e detalhe preservam o custo da rede, mas não entregam a data de nota de outra loja', async () => {
    como(restrito(true));
    const form = formDaPrevia();
    form.set('data', '2026-10-15');
    const r = (await acoesDoParceiro.acaoSalvarNota('', null, form))!;
    expect(r.erros).toEqual({});
    expect(r.previa?.veCusto).toBe(true);
    expect(r.previa?.custos[0]).toMatchObject({ efeito: 'nao-muda' });
    expect(sp(r.previa!.custos[0].antes)).toBe('R$ 18,78/kg');
    expect(r.previa!.custos[0]).not.toHaveProperty('vale');
    expect(JSON.stringify(r)).not.toContain('16/10/2026');
    const previaHtml = texto(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa: r.previa! })));
    expect(previaHtml).toContain('vale uma compra mais recente');
    expect(previaHtml).not.toMatch(/16\/10\/2026|undefined/);
    const nota = (await obterNota(a, restrito(true), ids.outubro))!;
    expect(nota.itens[0].valeNoCusto).toBe(false);
    expect(nota.itens[0].valeOutra).toBeNull();
    const detalhe = await ErpNotaPage({ params: Promise.resolve({ id: ids.outubro }), searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(detalhe)).not.toContain('16/10/2026');

    como(DONA);
    const autorizada = (await acoesDoParceiro.acaoSalvarNota('', null, form))!;
    expect(autorizada.previa!.custos[0].vale).toBe('16/10/2026');
    expect((await obterNota(a, DONA, ids.outubro))!.itens[0].valeOutra).toBe('16/10/2026');
  });

  it('editar na loja restrita: as duas actions omitem a data vencedora de outra loja e não alteram a nota', async () => {
    const nota = (await obterNota(a, DONA, ids.outubro))!;
    const antes = await a.notaEntrada.findUnique({ where: { id: ids.outubro }, select: { atualizadoEm: true, totalCentavos: true } });
    for (const area of AREAS()) {
      const form = formDaPrevia({ versao: nota.versao });
      form.set('data', '2026-10-15');
      como(restrito(true));
      const restrita = (await area.conferir(form, ids.outubro))!;
      expect(restrita.erros, area.nome).toEqual({});
      expect(restrita.previa?.veCusto, area.nome).toBe(true);
      const custo = restrita.previa!.custos.find((i) => i.nome === 'Cheddar')!;
      expect(custo, area.nome).toMatchObject({ efeito: 'nao-muda' });
      expect(sp(custo.antes), area.nome).toBe('R$ 18,78/kg');
      expect(custo, area.nome).not.toHaveProperty('vale');
      expect(JSON.stringify(restrita), area.nome).not.toContain('16/10/2026');
      const html = texto(renderToStaticMarkup(createElement(PreviaDoImpacto, { previa: restrita.previa! })));
      expect(html, area.nome).toContain('vale uma compra mais recente');
      expect(html, area.nome).not.toMatch(/16\/10\/2026|undefined/);

      como(DONA);
      const autorizada = (await area.conferir(form, ids.outubro))!;
      expect(autorizada.previa!.custos.find((i) => i.nome === 'Cheddar')?.vale, area.nome).toBe('16/10/2026');
    }
    expect(await a.notaEntrada.findUnique({ where: { id: ids.outubro }, select: { atualizadoEm: true, totalCentavos: true } })).toEqual(antes);
  });

  it('Conferir XML recebido pelas duas actions: só lança é recusado sem dados; quem vê recebe a prévia, sem gravar', async () => {
    // Reaproveita o XML explicitamente sintético da F.1b, com emissão dentro do relógio deste cenário.
    const cnpj = await salvarCnpjDaLoja(a, ids.vp, '11.444.777/0001-61', '', 'Teste');
    expect(cnpj.ok).toBe(true);
    const recebida = await receberXml(a, DONA, bytes(xmlDe([[/2026-10-21/g, '2026-10-15']], '523')), 'Teste');
    if (!recebida.ok) throw new Error(JSON.stringify(recebida));
    const doc = (await obterDocumento(a, DONA, recebida.id))!;
    const antes = {
      notas: await a.notaEntrada.count(),
      vinculos: await a.vinculoItemFornecedor.count(),
      documento: await a.documentoFiscal.findUnique({ where: { id: recebida.id }, select: { atualizadoEm: true, situacao: true } }),
    };
    const form = new FormData();
    form.set('versao', doc.versao);
    form.set('intencao', 'conferir');
    form.set('data', '17/10/2026');
    for (const [n, insumo, embalagem, fator] of [
      [1, ids.cheddar, `v:${ids.caixa}`, '1'],
      [2, ids.bacon, 'padrao', '10'],
      [3, ids.cheddar, 'padrao', '1'],
    ] as const) {
      form.append('item_n', String(n));
      form.append('item_insumo', insumo);
      form.append('item_embalagem', embalagem);
      form.append('item_fator', fator);
    }
    const conferir = [
      () => acoesDoParceiro.acaoConferirDocumento(recebida.id, null, form),
      () => acoesDoNivel1.acaoConferirDocumento(A.slug, recebida.id, null, form),
    ];
    for (const acao of conferir) {
      como(restrito(false));
      const r = (await acao())!;
      // A action exige lançar, mas carregarDocumento também exige ver compras; preservar a política vigente.
      expect(r.erros).toEqual({ geral: 'Nota recebida não encontrada.' });
      expect(r.previa).toBeUndefined();
      expect(r.contas).toBeUndefined();
      expect(JSON.stringify(r)).not.toMatch(/18,78|37,13|Molho cheddar|"antes"|"depois"|"vale"/);
      como(DONA);
      const autorizada = (await acao())!;
      expect(autorizada.erros).toEqual({});
      expect(autorizada.previa).toMatchObject({ veCusto: true, totalCentavos: 58_000 });
      expect(sp(autorizada.previa!.custos.find((i) => i.nome === 'Cheddar')!.antes)).toBe('R$ 18,78/kg');
      expect(autorizada.previa!.fichas.map((f) => f.nome)).toContain('Molho cheddar');
    }
    expect({
      notas: await a.notaEntrada.count(),
      vinculos: await a.vinculoItemFornecedor.count(),
      documento: await a.documentoFiscal.findUnique({ where: { id: recebida.id }, select: { atualizadoEm: true, situacao: true } }),
    }).toEqual(antes);
  });

  it('só lança em uma loja: páginas e action omitem custo atual, e recusam outra loja e outro parceiro', async () => {
    como(restrito(false));
    atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
    const nova = await doNavegador(ErpLancarNotaPage({}));
    expect(nova.json).not.toMatch(/"custo"|ultimaCompraEm|987,65|Insumo privado B/);
    const r = (await acoesDoParceiro.acaoSalvarNota('', null, formDaPrevia()))!;
    expect(r.previa).toMatchObject({ veCusto: false, custos: [], fichas: [] });
    await expect(ErpEditarNotaPage({ params: Promise.resolve({ id: ids.meier }) })).rejects.toThrow('SEM_ACESSO');
    await expect(ErpEditarNotaPage({ params: Promise.resolve({ id: ids.notaB }) })).rejects.toThrow('SEM_ACESSO');
    for (const lojaId of [ids.lojaOutra, ids.lojaB]) {
      const form = formDaPrevia();
      form.set('lojaId', lojaId);
      const negado = (await acoesDoParceiro.acaoSalvarNota('', null, form))!;
      expect(negado.previa).toBeUndefined();
      expect(Object.keys(negado.erros).length).toBeGreaterThan(0);
      expect(JSON.stringify(negado)).not.toMatch(/987,65|Insumo privado B|16\/10\/2026/);
    }
    const form = formDaPrevia();
    form.set('item_insumo', ids.insumoB);
    expect((await acoesDoParceiro.acaoSalvarNota('', null, form))!.previa).toBeUndefined();
    como(DONA);
    expect(await obterNota(a, DONA, ids.notaB)).toBeNull();
    await expect(ErpNotaPage({ params: Promise.resolve({ id: ids.notaB }), searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');
  });

  it('sem permissão e parceiro suspenso: a action recusa antes de calcular ou gravar', async () => {
    const antes = await a.notaEntrada.count();
    como(proprio([]));
    await expect(ErpLancarNotaPage({})).rejects.toThrow('SEM_ACESSO');
    expect((await acoesDoParceiro.acaoSalvarNota('', null, formDaPrevia()))!.previa).toBeUndefined();
    atual.ctx = () => ({ parceiro: { ...A, status: 'SUSPENSO' }, alcance: DONA, cliente: doParceiro(A.id, db, { somenteLeitura: true }), bloqueio: 'Parceiro suspenso.', podeEscrever: false, sessao: { userId: 'u', autorNome: 'Teste' } });
    const suspenso = (await acoesDoParceiro.acaoSalvarNota('', null, formDaPrevia()))!;
    expect(suspenso.erros.geral).toBe('Parceiro suspenso.');
    expect(suspenso.previa).toBeUndefined();
    expect(await a.notaEntrada.count()).toBe(antes);
  });

  it('decisão de 07/11: lançamento retorna a uma nova compra limpa na mesma loja, com marcador diferente a cada sucesso', async () => {
    const marcadores = new Set<string>();
    for (const area of AREAS()) {
      como(SO_LANCA);
      atual.caminho = area.raiz + '/compras/nova';
      for (let i = 0; i < 2; i++) {
        const form = formDaPrevia();
        form.set('intencao', 'lancar');
        form.set('numero', '7000' + (area.nome === 'parceiro' ? '1' : '2') + i);
        let destino = '';
        try { await area.conferir(form); } catch (e) { destino = (e as { url?: string }).url ?? ''; }
        const url = new URL(destino, 'http://fixture.local');
        expect(url.pathname).toBe(area.raiz + '/compras/nova');
        expect([...url.searchParams.keys()].sort()).toEqual(['feito', 'loja', 'nova']);
        const query = Object.fromEntries(url.searchParams);
        const retorno = lerRetornoDeCompra(query)!;
        expect(retorno.lojaId).toBe(ids.vp);
        expect(marcadores.has(retorno.chave)).toBe(false);
        marcadores.add(retorno.chave);
        const pagina = area.nome === 'parceiro' ? ErpLancarNotaPage({ searchParams: Promise.resolve(query) })
          : Nivel1LancarNotaPage({ params: Promise.resolve({ slug: A.slug }), searchParams: Promise.resolve(query) });
        const navegador = await doNavegador(pagina);
        expect(navegador.html).toContain('Nota lançada.');
        expect(navegador.form.inicial).toMatchObject({ lojaId: ids.vp, numero: '', fornecedorId: '', frete: '', total: '', itens: [] });
        expect(navegador.form.cancelar).toBe(area.raiz);
        expect(navegador.html).toContain('Voltar para o início');
        expect(navegador.json).not.toMatch(/"custo"|"ultimaCompraEm"/);
        const gravada = await a.notaEntrada.findFirst({ where: { numero: String(form.get('numero')) }, select: { id: true, totalCentavos: true } });
        expect(gravada?.totalCentavos).toBe(30000);
        expect(destino).not.toContain(gravada!.id);
      }
    }
    expect(marcadores.size).toBe(4);
  });

  it('decisão de 07/11: a própria nota também é protegida no domínio e nas duas actions; recusas não alteram dados', async () => {
    const form = formDaPrevia();
    form.set('numero', 'propria-politica');
    const criada = await lancarNota(a, SO_LANCA, lerEntradaDaNota(form), 'Marina');
    if (!criada.ok) throw new Error(JSON.stringify(criada));
    const nota = (await obterNota(a, DONA, criada.id))!;
    form.set('versao', nota.versao);
    form.set('intencao', 'lancar');
    const snapshot = async () => ({
      nota: await a.notaEntrada.findUnique({ where: { id: criada.id }, include: { itens: true } }),
      historico: await a.historicoAlteracao.count(),
      movimentos: await a.movimentoEstoque.findMany({ orderBy: { id: 'asc' } }),
      documentos: await a.documentoFiscal.findMany({ orderBy: { id: 'asc' } }),
    });
    const antes = await snapshot();
    const entrada = lerEntradaDaNota(form);
    for (const alcance of [SO_LANCA, proprio(['compras.ver'])]) {
      const editada = await editarNota(a, alcance, criada.id, entrada, 'Marina');
      const cancelada = await cancelarNota(a, alcance, criada.id, 'Digitada em dobro', 'Marina');
      const previa = await previaDaNota(a, alcance, entrada, criada.id);
      expect(editada.ok).toBe(false);
      expect(cancelada.ok).toBe(false);
      expect(previa.ok).toBe(false);
      como(alcance);
      for (const area of AREAS()) expect((await area.conferir(form, criada.id))!.erros.geral).toBeTruthy();
      const motivo = new FormData(); motivo.set('motivo', 'Digitada em dobro');
      expect((await acoesDoParceiro.acaoCancelarNota(criada.id, null, motivo))!.erros.geral).toBeTruthy();
      expect((await acoesDoNivel1.acaoCancelarNota(A.slug, criada.id, null, motivo))!.erros.geral).toBeTruthy();
    }
    expect(await obterNota(a, SO_LANCA, criada.id)).toBeNull();
    expect(await snapshot()).toEqual(antes);
    // Ambas as capacidades não ampliam o alcance: origem e destino são conferidos.
    const restrito = resolverAlcance({ perfilBase: null, perfilProprio: ['compras.ver', 'compras.lancar', 'lojas.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds: [ids.vp] });
    expect((await editarNota(a, restrito, criada.id, { ...entrada, lojaId: ids.lojaOutra }, 'Gerente')).ok).toBe(false);
    expect((await previaDaNota(a, restrito, { ...entrada, lojaId: ids.lojaOutra }, criada.id)).ok).toBe(false);
    const fora = await lancarNota(a, DONA, { ...entrada, lojaId: ids.lojaOutra, numero: 'POL-FORA' }, 'Dona');
    if (!fora.ok) throw new Error(JSON.stringify(fora));
    const versaoFora = (await obterNota(a, DONA, fora.id))!.versao;
    const antesFora = await snapshot();
    expect((await editarNota(a, restrito, fora.id, { ...entrada, versao: versaoFora }, 'Gerente')).ok).toBe(false);
    expect((await previaDaNota(a, restrito, entrada, fora.id)).ok).toBe(false);
    expect(await snapshot()).toEqual(antesFora);
    // O perfil autorizado continua editando e cancelando; a trilha é preservada.
    entrada.numero = 'POL-EDITADA';
    expect((await editarNota(a, VE_E_LANCA, criada.id, entrada, 'Gerente')).ok).toBe(true);
    expect((await cancelarNota(a, VE_E_LANCA, criada.id, 'Digitada em dobro', 'Gerente')).ok).toBe(true);
    expect((await obterNota(a, VE_E_LANCA, criada.id))?.cancelada).toBe(true);
    expect(await a.historicoAlteracao.count()).toBeGreaterThan(antes.historico);
  });
});
