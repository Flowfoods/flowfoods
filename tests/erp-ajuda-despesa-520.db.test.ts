/**
 * Decisão 520 · os pontos de ajuda de "Lançar despesa" (nova e editar) e de "Despesa" pelas páginas de verdade (Postgres real),
 * nas duas áreas, desenhadas dentro do shell da área com a ajuda que o layout entrega. Cada ponto tem o botão onde explica; o texto
 * que saiu do corpo não está na página; a despesa de período fechado (editar e detalhe) mantém o aviso, trava o que muda o DRE e
 * deixa os botões de ajuda livres; quem só lança e quem só vê recebem os blocos que valem para eles.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-ajuda-despesa-520.db.test.ts
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
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1]) => {
      if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO');
    },
    visaoDaRequisicao: async () => ({ visao: atual.visao }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { lancarDespesa } from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpNovaDespesaPage from '@/app/erp/dre/despesas/nova/page';
import ErpEditarDespesaPage from '@/app/erp/dre/despesas/[id]/editar/page';
import ErpDespesaPage from '@/app/erp/dre/despesas/[id]/page';
import Nivel1NovaDespesaPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/despesas/nova/page';
import Nivel1EditarDespesaPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/despesas/[id]/editar/page';
import Nivel1DespesaPage from '@/app/rodolfo/(painel)/erp/[slug]/dre/despesas/[id]/page';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

relogioDoCenario('2026-10-17T12:00:00-03:00');
const HOJE = '2026-10-17';

/** O que saiu do corpo (decisão 520): não pode estar na página com os pontos. */
const SAIU = ['O DRE conta pela competência: a luz de outubro é de outubro, mesmo paga em novembro.', 'O vencimento não muda o DRE; ele só põe a despesa no filtro “A pagar”.', 'Não muda o DRE.'];

describe.skipIf(!URL_TESTE)('Decisão 520 · pontos de ajuda de Lançar despesa e de Despesa pelas páginas reais (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | null, permissoes: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: perfilBase ? null : permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const textos = (p: Partial<TextosDaDespesa>): TextosDaDespesa => ({ envio: globalThis.crypto.randomUUID().replace(/-/g, ''), lojaId: '', linha: 'aluguel', descricao: 'Aluguel', valor: '3.100,00', tipo: 'mes', dia: '', mes: '2026-10', de: '', ate: '', recorrente: false, vencimento: '', ...p });
  const PREF = { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] };

  /** As duas áreas: as páginas de cada uma, o contexto que o portão daria e a ajuda que o layout entrega ao shell. */
  const AREAS = () => [
    {
      nome: 'parceiro',
      raiz: '/erp',
      alcance: alcanceDe('DONO'),
      preferencia: PREF as typeof PREF | null,
      nova: (sp: Record<string, string> = {}) => ErpNovaDespesaPage({ searchParams: sp }),
      editar: (id: string) => ErpEditarDespesaPage({ params: { id }, searchParams: {} }),
      despesa: (id: string) => ErpDespesaPage({ params: { id }, searchParams: {} }),
    },
    {
      nome: 'nível 1',
      raiz: `/rodolfo/erp/${A.slug}`,
      alcance: ALCANCE_FLOWFOODS,
      preferencia: null,
      nova: (sp: Record<string, string> = {}) => Nivel1NovaDespesaPage({ params: { slug: A.slug }, searchParams: sp }),
      editar: (id: string) => Nivel1EditarDespesaPage({ params: { slug: A.slug, id }, searchParams: {} }),
      despesa: (id: string) => Nivel1DespesaPage({ params: { slug: A.slug, id }, searchParams: {} }),
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
    ).replace(/&nbsp;| | /g, ' ');
  }
  const ancora = (h: string, ponto: string) => h.indexOf(`data-ponto="${ponto}"`);
  const quantas = (h: string, ponto: string) => h.split(`data-ponto="${ponto}"`).length - 1;
  const noCabecalho = (h: string, titulo: string, ponto: string) => {
    const i = h.indexOf(`>${titulo}</h2>`);
    const p = h.indexOf(`data-ponto="${ponto}"`, i);
    return i > -1 && p > i && p < h.indexOf('</header>', i);
  };
  /** Os botões de ponto na ordem da página. */
  const naOrdem = (h: string) => Array.from(h.matchAll(/<(?:button|summary)\b[^>]*\bdata-ponto="([a-z0-9-]+)"/g)).map((m) => m[1]);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Ajuda 520', slug: `ajuda-520-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['meier', 'Méier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    // O aluguel de outubro da Penha (repete todo mês, venceu em 05/10) e a luz de setembro, que fica num período fechado.
    for (const [chave, p] of [
      ['outubro', { descricao: 'Aluguel da Penha', linha: 'aluguel', valor: '3.100,00', lojaId: ids.vp, mes: '2026-10', recorrente: true, vencimento: '05/10/2026' }],
      ['setembro', { descricao: 'Luz da Penha', linha: 'energia', valor: '400,00', lojaId: ids.vp, mes: '2026-09' }],
    ] as const) {
      const r = await lancarDespesa(a, ALCANCE_FLOWFOODS, textos(p), 'Marina', HOJE);
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Setembro de teste', inicio: '2026-09-01', fim: '2026-09-30' }));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('Lançar despesa, nas duas áreas: linha junto do rótulo, competência e vencimento no cabeçalho, repete junto da caixa; o texto que saiu não está', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
      const h = await naTela(await area.nova(), `${area.raiz}/dre/despesas/nova`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="dre-despesa-nova"');
      expect(ancora(h, 'linha'), area.nome).toBeGreaterThan(h.indexOf('</label>', h.indexOf('<label for="desp-linha"')));
      expect(ancora(h, 'linha'), area.nome).toBeLessThan(h.indexOf('<select id="desp-linha"'));
      expect(noCabecalho(h, 'A que período pertence', 'competencia'), area.nome).toBe(true);
      // Fora do rótulo da caixa (botão dentro de label marcaria a caixa).
      expect(ancora(h, 'repete'), area.nome).toBeGreaterThan(h.indexOf('</label>', h.indexOf('name="recorrente"')));
      expect(noCabecalho(h, 'Conta a pagar', 'vencimento'), area.nome).toBe(true);
      expect(naOrdem(h), area.nome).toEqual(['tela', 'linha', 'competencia', 'repete', 'vencimento']);
      // O essencial fica: "Opcional.", a loja da visão e o que ela quer dizer.
      expect(h, area.nome).toMatch(/>Conta a pagar<\/h2><p[^>]*>Opcional\.<\/p>/);
      expect(h, area.nome).toContain('Entra no DRE desta loja e no da rede.');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      // "As do mês passado" é a mesma rota (a mesma entrada), sem os campos: nenhum ponto do formulário aparece.
      const mp = await naTela(await area.nova({ modo: 'mes-passado' }), `${area.raiz}/dre/despesas/nova`, area.alcance, area.preferencia);
      expect(mp, area.nome).toContain('data-ajuda-tela="dre-despesa-nova"');
      expect(naOrdem(mp), area.nome).toEqual(['tela']);
    }
  });

  it('Editar, nas duas áreas: a despesa aberta tem os quatro pontos; a de período fechado mantém o aviso, trava o que muda o DRE e não desliga a ajuda', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      const h = await naTela(await area.editar(ids.outubro), `${area.raiz}/dre/despesas/${ids.outubro}/editar`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="dre-despesa-nova"');
      expect(naOrdem(h), area.nome).toEqual(['tela', 'linha', 'competencia', 'repete', 'vencimento']);
      expect(h, area.nome).toContain('Repete todo mês (aluguel, salário, luz)');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      const f = await naTela(await area.editar(ids.setembro), `${area.raiz}/dre/despesas/${ids.setembro}/editar`, area.alcance, area.preferencia);
      expect(f, area.nome).toContain('O período Setembro de teste já foi fechado no DRE.');
      expect(f, area.nome).toContain('Esta despesa cai nele: valor, competência, linha e loja não mudam mais; descrição, vencimento e “repete todo mês” sim.');
      expect(f, area.nome).toMatch(/<select id="desp-linha" name="linha"[^>]*disabled=""/);
      expect(f, area.nome).toMatch(/<input id="desp-valor" name="valor"[^>]*disabled=""/);
      expect(f, area.nome).not.toContain('<fieldset disabled=""');
      expect(naOrdem(f), area.nome).toEqual(['tela', 'linha', 'competencia', 'repete', 'vencimento']);
      for (const t of SAIU) expect(f, `${area.nome}: ${t}`).not.toContain(t);
    }
  });

  it('Despesa, nas duas áreas: como conta e pagamento nos cabeçalhos; a de período fechado mantém o aviso e os dois pontos', async () => {
    for (const area of AREAS()) {
      como(area.alcance);
      const h = await naTela(await area.despesa(ids.outubro), `${area.raiz}/dre/despesas/${ids.outubro}`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="dre-despesa"');
      expect(noCabecalho(h, 'Despesa', 'como-conta'), area.nome).toBe(true);
      expect(noCabecalho(h, 'Conta a pagar', 'pagamento'), area.nome).toBe(true);
      expect(naOrdem(h), area.nome).toEqual(['tela', 'como-conta', 'pagamento']);
      // O selo do pagamento continua no cabeçalho, e a conta do DRE no corpo.
      expect(h, area.nome).toContain('Vencida');
      expect(h, area.nome).toContain('Dia a dia: R$ 3.100,00 em 31 dias');
      expect(h, area.nome).toContain('Marcar como paga');
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      const f = await naTela(await area.despesa(ids.setembro), `${area.raiz}/dre/despesas/${ids.setembro}`, area.alcance, area.preferencia);
      expect(f, area.nome).toContain('dá para pagar e mudar o vencimento, mas valor, competência, linha e loja não mudam mais.');
      expect(ancora(f, 'como-conta'), area.nome).toBeGreaterThan(f.indexOf('data-aviso-periodo-fechado'));
      expect(naOrdem(f), area.nome).toEqual(['tela', 'como-conta', 'pagamento']);
      for (const t of SAIU) expect(f, `${area.nome}: ${t}`).not.toContain(t);
    }
  });

  it('quem só lança: abre o formulário com os quatro pontos, sem o bloco do card do início; quem só vê: a despesa com os dois pontos, sem pagar nem o bloco de pagar', async () => {
    const soLanca = alcanceDe(null, ['despesas.lancar', 'lojas.ver']);
    como(soLanca);
    atual.visao = { tipo: 'rede' };
    const h = await naTela(await ErpNovaDespesaPage({ searchParams: {} }), '/erp/dre/despesas/nova', soLanca, PREF);
    expect(naOrdem(h)).toEqual(['tela', 'linha', 'competencia', 'repete', 'vencimento']);
    const ajudaDeQuemLanca = JSON.stringify(ajudaParaATela(soLanca).filter((e) => e.chave.startsWith('dre-despesa')));
    expect(ajudaDeQuemLanca).not.toContain('card de Despesas');
    expect(ajudaDeQuemLanca).toContain('Marque como paga');

    const soVe = alcanceDe(null, ['dre.ver', 'lojas.ver']);
    como(soVe);
    const d = await naTela(await ErpDespesaPage({ params: { id: ids.outubro }, searchParams: {} }), `/erp/dre/despesas/${ids.outubro}`, soVe, PREF);
    expect(naOrdem(d)).toEqual(['tela', 'como-conta', 'pagamento']);
    expect(d).not.toContain('Marcar como paga');
    expect(d).not.toContain('Mudar ou tirar');
    const ajudaDeQuemVe = JSON.stringify(ajudaParaATela(soVe).filter((e) => e.chave.startsWith('dre-despesa')));
    expect(ajudaDeQuemVe).not.toContain('Marque como paga');
    expect(ajudaDeQuemVe).toContain('card de Despesas de uma loja');
  });
});
