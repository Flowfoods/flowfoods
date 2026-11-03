/**
 * Decisão 522 · os pontos de ajuda de "Lançar nota" (nova e editar) e de "Detalhe da nota" pelas páginas de verdade (Postgres
 * real), nas duas áreas, desenhadas dentro do shell da área com a ajuda que o layout entrega. Cada ponto tem o botão onde explica;
 * o texto que saiu do corpo não está na página; a nota de período fechado (editar e detalhe) mantém o aviso e deixa os botões de
 * ajuda livres; a nota que entrou no estoque tem o ponto do estoque e a que não entrou diz o porquê no corpo; quem só lança e quem
 * só vê recebem os blocos que valem para eles.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-ajuda-compra-522.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
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
import { cadastrarFornecedor, editarNota, lancarNota, obterNota } from '@/lib/erp/compras';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpLancarNotaPage from '@/app/erp/compras/nova/page';
import ErpEditarNotaPage from '@/app/erp/compras/[id]/editar/page';
import ErpNotaPage from '@/app/erp/compras/[id]/page';
import Nivel1LancarNotaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/nova/page';
import Nivel1EditarNotaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/[id]/editar/page';
import Nivel1NotaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/[id]/page';
import { cadastrarInsumoDeTeste, criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

relogioDoCenario('2026-10-17T12:00:00-03:00');

/** O que saiu do corpo (decisão 522): não pode estar na página com os pontos. */
const SAIU = [
  'o custo dos insumos passa a ser o desta compra',
  'É ela que diz qual compra é a mais nova.',
  'O preço por kg, L ou un sai da conta, com o frete rateado.',
  'Dividido entre os itens pelo valor de cada um; entra no custo.',
  'O frete foi dividido entre os itens pelo valor de cada um e entra no custo.',
  'Entrada e estorno, nunca apagados',
];

describe.skipIf(!URL_TESTE)('Decisão 522 · pontos de ajuda de Lançar nota e de Detalhe da nota pelas páginas reais (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | null, permissoes: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: perfilBase ? null : permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const PREF = { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] };

  /** As duas áreas: as páginas de cada uma, o contexto que o portão daria e a ajuda que o layout entrega ao shell. */
  const AREAS = () => [
    {
      nome: 'parceiro',
      raiz: '/erp',
      alcance: alcanceDe('DONO'),
      preferencia: PREF as typeof PREF | null,
      nova: () => ErpLancarNotaPage(),
      editar: (id: string) => ErpEditarNotaPage({ params: { id } }),
      nota: (id: string) => ErpNotaPage({ params: { id }, searchParams: {} }),
    },
    {
      nome: 'nível 1',
      raiz: `/rodolfo/erp/${A.slug}`,
      alcance: ALCANCE_FLOWFOODS,
      preferencia: null,
      nova: () => Nivel1LancarNotaPage({ params: { slug: A.slug } }),
      editar: (id: string) => Nivel1EditarNotaPage({ params: { slug: A.slug, id } }),
      nota: (id: string) => Nivel1NotaPage({ params: { slug: A.slug, id }, searchParams: {} }),
    },
  ];
  const como = (alcance: Alcance) => {
    atual.ctx = () => ({ parceiro: A, alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
  };

  /** A página devolve um componente de servidor assíncrono: resolve até chegar na árvore que o React desenha. */
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

  /** A página, já resolvida, dentro do shell da área (a mesma montagem do layout: rota → entrada → pontos). */
  async function naTela(pagina: unknown, caminho: string, alcance: Alcance, preferencia: typeof PREF | null) {
    atual.caminho = caminho;
    const { AppShell } = await import('@/components/erp/shell/AppShell');
    const acao = async () => {};
    return renderToStaticMarkup(
      createElement(AppShell, {
        navegacao: navegacaoDoParceiro(alcance, NENHUM_MODULO_LIBERADO),
        contexto: 'Casa · Ativo',
        usuario: { nome: 'Maria', papel: 'Dona' },
        tema: 'claro',
        menuRecolhido: false,
        versao: 'Barney ERP',
        visao: { modo: 'parceiro', opcoes: [], valor: null, escolher: async () => ({ ok: true as const }) },
        notificacoes: [],
        links: [],
        sair: null,
        ajuda: {
          entradas: ajudaParaATela(alcance),
          preferencia,
          acoes: preferencia ? { fechar: acao, dicas: acao, pontosVistos: acao, pontoNunca: acao } : null,
          hoje: 20_000,
          contato: { url: 'https://wa.me/5521', display: '(21) 90000-0000' },
        },
        children: await resolver(pagina),
      } as never),
    ).replace(/&nbsp;|\u00a0|\u202f/g, ' ');
  }
  const ancora = (h: string, ponto: string) => h.indexOf(`data-ponto="${ponto}"`);
  const noCabecalho = (h: string, titulo: string, ponto: string) => {
    const i = h.indexOf(`>${titulo}</h2>`);
    const p = h.indexOf(`data-ponto="${ponto}"`, i);
    return i > -1 && p > i && p < h.indexOf('</header>', i);
  };
  /** Depois do rótulo (fora dele) e antes do campo. */
  const juntoDoRotulo = (h: string, campo: string, ponto: string) => {
    const fimDoRotulo = h.indexOf('</label>', h.indexOf(`<label for="${campo}"`));
    const doCampo = h.search(new RegExp(`<(?:select|input)\\b[^>]*\\bid="${campo}"`));
    return fimDoRotulo > -1 && ancora(h, ponto) > fimDoRotulo && ancora(h, ponto) < doCampo;
  };
  /** Os botões de ponto na ordem da página. */
  const naOrdem = (h: string) => Array.from(h.matchAll(/<(?:button|summary)\b[^>]*\bdata-ponto="([a-z0-9-]+)"/g)).map((m) => m[1]);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Ajuda 522', slug: `ajuda-522-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    const DONA = alcanceDe('DONO');
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['meier', 'Méier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const ched = await cadastrarInsumoDeTeste(a, { nome: 'Cheddar', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '40,00' });
    if (!ched.ok) throw new Error(JSON.stringify(ched));
    ids.cheddar = ched.id;
    const cx = await cadastrarVariante(a, ids.cheddar, { nome: 'Caixa', escala: 'base', conteudo: '5', preco: '200,00' });
    if (!cx.ok) throw new Error(JSON.stringify(cx));
    ids.caixa = cx.id;
    const f = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.fornecedor = f.id;

    // 01/10: abertura do estoque da Penha (2 kg de cheddar).
    const t0 = new Date('2026-10-01T10:00:00-03:00');
    expect((await iniciarAbertura(a, DONA, ids.vp, 'Marina', t0)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA, ids.vp))!;
    for (const i of ab.itens) expect((await contarItem(a, DONA, ids.vp, { itemId: i.id, embalagens: '', solto: '2', escala: 'base', versao: i.versao }, 'Marina', { agora: t0 })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA, ids.vp, { versao: v, confirmarNaoContados: true }, 'Marina', t0)).ok).toBe(true);

    // Penha: a nota de outubro (3 caixas de 5 kg + R$ 6,00 de frete) entra no estoque; a de setembro é de antes da abertura e não
    // entra; a de 15/10 entra e depois é editada para 25/09 (antes da abertura). Méier: a mais nova de todas (16/10), num estoque
    // que não foi aberto, prova que o custo vale pela compra mais recente de QUALQUER loja.
    const nota = (loja: string, data: string, numero: string) => ({ lojaId: loja, fornecedorId: ids.fornecedor, numero, serie: '1', data, frete: '6,00', total: '275,70', itens: [{ insumoId: ids.cheddar, embalagem: `v:${ids.caixa}`, quantidade: '3', valor: '269,70' }] });
    for (const [chave, loja, data, numero] of [
      ['outubro', ids.vp, '2026-10-14', '000123'],
      ['setembro', ids.vp, '2026-09-20', '000077'],
      ['editada', ids.vp, '2026-10-15', '000130'],
      ['meier', ids.meier, '2026-10-16', '000140'],
    ] as const) {
      const r = await lancarNota(a, DONA, nota(loja, data, numero), 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const versao = (await obterNota(a, DONA, ids.editada))!.versao;
    const ed = await editarNota(a, DONA, ids.editada, { ...nota(ids.vp, '2026-09-25', '000130'), versao }, 'Marina');
    if (!ed.ok) throw new Error(JSON.stringify(ed));
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Setembro de teste', inicio: '2026-09-01', fim: '2026-09-30' }));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('Lançar nota, nas duas áreas: loja e data junto do rótulo, itens e frete no cabeçalho; o texto que saiu não está; o essencial fica', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
      const h = await naTela(await area.nova(), `${area.raiz}/compras/nova`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="compra-nova"');
      for (const [campo, ponto] of [
        ['nota-lojaId', 'loja'],
        ['nota-data', 'data'],
      ])
        expect(juntoDoRotulo(h, campo, ponto), `${area.nome}: ${ponto}`).toBe(true);
      expect(noCabecalho(h, 'Itens', 'itens'), area.nome).toBe(true);
      expect(noCabecalho(h, 'Frete e total', 'frete'), area.nome).toBe(true);
      expect(naOrdem(h), area.nome).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
      // O essencial fica: a data de hoje como limite, o que se digita no valor e o "(se tiver)" do frete.
      expect(h, area.nome).toContain('A data impressa na nota (dd/mm/aaaa, até 17/10/2026).');
      expect(h, area.nome).toContain('total da linha</strong> na nota.');
      expect(h, area.nome).toContain('(se tiver)');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);
    }
  });

  it('Editar, nas duas áreas: a nota aberta tem os quatro pontos; a de período fechado mantém o aviso no topo e não desliga a ajuda', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      const h = await naTela(await area.editar(ids.outubro), `${area.raiz}/compras/${ids.outubro}/editar`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="compra-nova"');
      expect(naOrdem(h), area.nome).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
      expect(h, area.nome).toContain('R$ 269,70 + R$ 6,00 de frete = R$ 275,70');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      const f = await naTela(await area.editar(ids.setembro), `${area.raiz}/compras/${ids.setembro}/editar`, area.alcance, area.preferencia);
      expect(f, area.nome).toContain('O período Setembro de teste já foi fechado no DRE.');
      expect(f, area.nome).toContain('Esta nota é desse período: não dá para corrigir nem cancelar.');
      expect(f.indexOf('data-aviso-periodo-fechado'), area.nome).toBeLessThan(f.indexOf('>A nota</h2>'));
      expect(f, area.nome).not.toContain('<fieldset disabled=""');
      expect(naOrdem(f), area.nome).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
      for (const t of SAIU) expect(f, `${area.nome}: ${t}`).not.toContain(t);
    }
  });

  it('Detalhe, nas duas áreas: total, custo e estoque nos cabeçalhos; a nota de setembro (fechado, antes da abertura) diz o porquê e fica sem o ponto do estoque', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      const h = await naTela(await area.nota(ids.outubro), `${area.raiz}/compras/${ids.outubro}`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="compra"');
      expect(noCabecalho(h, 'Total da nota', 'total'), area.nome).toBe(true);
      expect(noCabecalho(h, 'Itens', 'custo'), area.nome).toBe(true);
      expect(noCabecalho(h, 'No estoque', 'estoque'), area.nome).toBe(true);
      expect(naOrdem(h), area.nome).toEqual(['tela', 'total', 'custo', 'estoque']);
      // O essencial fica: o que a nota fez no estoque, o saldo e a soma.
      expect(h, area.nome).toContain('Entrou no estoque da Vila da Penha.');
      expect(h, area.nome).toContain('saldo 2 kg para 17 kg');
      expect(h, area.nome).toContain('Itens R$ 269,70 + frete R$ 6,00');
      // "De qualquer loja da rede": a nota mais nova é a do Méier, e a da Penha diz a data dela (a regra que o card `custo` conta).
      expect(h, area.nome).toContain('vale a de 16/10/2026');
      expect(h, area.nome).not.toContain('vale no custo');
      expect(h, area.nome).toContain('Editar nota');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      const f = await naTela(await area.nota(ids.setembro), `${area.raiz}/compras/${ids.setembro}`, area.alcance, area.preferencia);
      expect(f, area.nome).toContain('Esta nota é desse período: não dá para editar nem cancelar.');
      expect(f, area.nome).toContain('Não mexe no estoque: a data da nota é anterior à abertura do estoque da Vila da Penha (01/10/2026).');
      expect(f, area.nome).not.toContain('Editar nota');
      expect(f, area.nome).not.toContain('>No estoque</h2>');
      expect(f, area.nome).toContain('vale a de 16/10/2026');
      expect(ancora(f, 'total'), area.nome).toBeGreaterThan(f.indexOf('data-aviso-periodo-fechado'));
      expect(naOrdem(f), area.nome).toEqual(['tela', 'total', 'custo']);
      for (const t of SAIU) expect(f, `${area.nome}: ${t}`).not.toContain(t);

      // A nota do Méier (outra loja, estoque não aberto): é a que vale no custo, e não mexe no estoque.
      const m = await naTela(await area.nota(ids.meier), `${area.raiz}/compras/${ids.meier}`, area.alcance, area.preferencia);
      expect(m, area.nome).toContain('vale no custo');
      expect(m, area.nome).toContain('Não mexe no estoque: o estoque da Méier ainda não foi aberto.');
      expect(naOrdem(m), area.nome).toEqual(['tela', 'total', 'custo']);
    }
  });

  it('Editar para uma data antes da abertura: a entrada é estornada e nenhuma nova entra (a regra do card `estoque`), e o ponto do estoque continua', async () => {
    const { movimentos, frase } = (await obterNota(a, alcanceDe('DONO'), ids.editada))!.estoque;
    expect(movimentos.map((x) => [x.estorno, x.quantidadeMilesimos])).toEqual([
      [false, 15_000],
      [true, -15_000],
    ]);
    expect(frase).toContain('Não mexe no estoque: a data da nota é anterior à abertura do estoque da Vila da Penha (01/10/2026).');
    for (const area of AREAS()) {
      como(area.alcance);
      const h = await naTela(await area.nota(ids.editada), `${area.raiz}/compras/${ids.editada}`, area.alcance, area.preferencia);
      expect(noCabecalho(h, 'No estoque', 'estoque'), area.nome).toBe(true);
      expect(h.split('Estorno · ').length - 1, area.nome).toBe(1);
      expect(naOrdem(h), area.nome).toEqual(['tela', 'total', 'custo', 'estoque']);
    }
  });

  it('quem só lança: abre Lançar nota com os quatro pontos, sem o exemplo em R$; quem só vê: a nota com os três pontos, sem Editar e sem o bloco de quem lança', async () => {
    const soLanca = alcanceDe(null, ['compras.lancar', 'lojas.ver']);
    como(soLanca);
    atual.visao = { tipo: 'rede' };
    const h = await naTela(await ErpLancarNotaPage(), '/erp/compras/nova', soLanca, PREF);
    expect(naOrdem(h)).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
    const ajudaDeQuemLanca = JSON.stringify(ajudaParaATela(soLanca).filter((e) => e.chave === 'compra-nova' || e.chave === 'compra').map((e) => e.pontos));
    expect(ajudaDeQuemLanca).not.toMatch(/R\$|\d+,\d{2}/);
    expect(ajudaDeQuemLanca).toContain('Editar ou cancelar a nota que vale');

    const soVe = alcanceDe(null, ['compras.ver', 'lojas.ver']);
    como(soVe);
    const d = await naTela(await ErpNotaPage({ params: { id: ids.outubro }, searchParams: {} }), `/erp/compras/${ids.outubro}`, soVe, PREF);
    expect(naOrdem(d)).toEqual(['tela', 'total', 'custo', 'estoque']);
    expect(d).not.toContain('Editar nota');
    expect(d).not.toContain('>Situação</h2>');
    const ajudaDeQuemVe = JSON.stringify(ajudaParaATela(soVe).filter((e) => e.chave === 'compra').map((e) => e.pontos));
    expect(ajudaDeQuemVe).not.toContain('Editar ou cancelar');
    expect(ajudaDeQuemVe).toContain('Vale no custo a compra mais recente');
  });
});
