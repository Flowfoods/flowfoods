/**
 * Decisão 519 · os pontos de ajuda do Faturamento pelas páginas de verdade (Postgres real), nas duas áreas: a página do mês
 * (aberta pela pendência da Home, com a volta), a do dia (normal e de período fechado) e "Lançar o dia", desenhadas dentro do
 * shell da área com a ajuda que o layout entrega. Cada ponto tem o botão onde explica; o texto que saiu do corpo não está na
 * página; quem só vê abre o dia com os botões que valem para ele e sem o "Remover".
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-ajuda-faturamento-519.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
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
import { lancarDia } from '@/lib/erp/faturamento';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpFaturamentoPage from '@/app/erp/faturamento/page';
import ErpDiaPage from '@/app/erp/faturamento/[lojaId]/[data]/page';
import ErpLancarPage from '@/app/erp/faturamento/lancar/page';
import Nivel1FaturamentoPage from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/page';
import Nivel1DiaPage from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/[lojaId]/[data]/page';
import Nivel1LancarPage from '@/app/rodolfo/(painel)/erp/[slug]/faturamento/lancar/page';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { relogioDoCenario } from './relogio-do-cenario';

const URL_TESTE = process.env.ERP_DB_TESTE;

// 15 e 16 de outubro já são "até ontem" (faltas contam) e 17 é hoje (em aberto).
relogioDoCenario('2026-10-17T12:00:00-03:00');
const HOJE = '2026-10-17';
const DIA = '2026-10-16';
const FECHADO = '2026-10-03';

/** O que saiu do corpo (decisão 519): não pode estar na página com os pontos. */
const SAIU = [
  'O ticket médio é a conta, não um número lançado.',
  'Falta é canal sem lançamento até ontem; hoje ainda está em aberto.',
  'Falta é canal que a loja vende, sem lançamento, até ontem',
  'Para corrigir um número, é só salvar o dia de novo. Remover serve para o que não deveria existir.',
];

describe.skipIf(!URL_TESTE)('Decisão 519 · pontos de ajuda do Faturamento pelas páginas reais (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: 'ATIVO' };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede', extras: string[] = []): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: extras, permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const lancar = async (lojaId: string, data: string, canais: string[]) => {
    const r = await lancarDia(a, alcanceDe('DONO', 'rede'), { lojaId, data, canais: canais.map((canal) => ({ canal, valor: '1.000,00', pedidos: '20', clientes: '20', naoVendeu: false, versao: '' })) }, 'Marina', HOJE);
    if (!r.ok) throw new Error(JSON.stringify(r));
  };

  /** As duas áreas: as páginas de cada uma, o contexto que o portão daria e a ajuda que o layout entrega ao shell. */
  const AREAS = () => [
    {
      nome: 'parceiro',
      raiz: '/erp',
      alcance: alcanceDe('DONO', 'rede'),
      preferencia: { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] },
      mes: (sp: Record<string, string>) => ErpFaturamentoPage({ searchParams: sp }),
      dia: (lojaId: string, data: string) => ErpDiaPage({ params: { lojaId, data }, searchParams: {} }),
      lancar: () => ErpLancarPage({ searchParams: {} }),
    },
    {
      nome: 'nível 1',
      raiz: `/rodolfo/erp/${A.slug}`,
      alcance: ALCANCE_FLOWFOODS,
      preferencia: null,
      mes: (sp: Record<string, string>) => Nivel1FaturamentoPage({ params: { slug: A.slug }, searchParams: sp }),
      dia: (lojaId: string, data: string) => Nivel1DiaPage({ params: { slug: A.slug, lojaId, data }, searchParams: {} }),
      lancar: () => Nivel1LancarPage({ params: { slug: A.slug }, searchParams: {} }),
    },
  ];

  /** A página, já resolvida, dentro do shell da área (a mesma montagem do layout: rota → entrada → pontos). */
  async function naTela(pagina: unknown, caminho: string, alcance: Alcance, preferencia: { dicasLigadas: boolean; escolhida: boolean; fechadas: string[]; pontos: string[] } | null) {
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
        children: pagina,
      } as never),
    ).replace(/ /g, ' ');
  }
  const ancora = (h: string, ponto: string) => h.indexOf(`data-ponto="${ponto}"`);
  const quantas = (h: string, ponto: string) => h.split(`data-ponto="${ponto}"`).length - 1;
  const noCabecalho = (h: string, titulo: string, ponto: string) => {
    const i = h.indexOf(`>${titulo}</h2>`);
    const p = h.indexOf(`data-ponto="${ponto}"`, i);
    return i > -1 && p > i && p < h.indexOf('</header>', i);
  };
  const foraDeFieldset = (h: string, ponto: string) => {
    const antes = h.slice(0, ancora(h, ponto));
    return ancora(h, ponto) > -1 && (antes.match(/<fieldset\b/g) ?? []).length === (antes.match(/<\/fieldset>/g) ?? []).length;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Ajuda 519', slug: `ajuda-519-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    a = doParceiro(A.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['meier', 'Méier']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    // Vila da Penha lança desde 01/10: 15/10 sem iFood e 16/10 sem delivery (2 faltas). O 03/10 fica num período fechado.
    for (let d = 1; d <= 14; d++) await lancar(ids.vp, `2026-10-${String(d).padStart(2, '0')}`, ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']);
    await lancar(ids.vp, '2026-10-15', ['LOJA', 'DELIVERY_PROPRIO']);
    await lancar(ids.vp, DIA, ['LOJA', 'IFOOD']);
    await lancar(ids.meier, DIA, ['LOJA']);
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Início de outubro', inicio: '2026-10-01', fim: '2026-10-05' }));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  it('o mês aberto pela Home, nas duas áreas: volta, números, falta no lugar; o texto que saiu não está na página', async () => {
    for (const area of AREAS()) {
      atual.ctx = () => ({ parceiro: A, alcance: area.alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
      atual.visao = { tipo: 'loja', lojaId: ids.vp, nome: 'Vila da Penha' };
      const h = await naTela(await area.mes({ mes: '2026-10', loja: ids.vp, volta: area.raiz }), `${area.raiz}/faturamento`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="faturamento"');
      expect(h, area.nome).toContain('2 lançamentos faltando neste mês.');
      expect(ancora(h, 'volta'), area.nome).toBeGreaterThan(h.indexOf('>Voltar para o início</a>'));
      expect(noCabecalho(h, 'Por canal', 'numeros'), area.nome).toBe(true);
      expect(noCabecalho(h, 'Dia a dia · Vila da Penha', 'falta'), area.nome).toBe(true);
      expect(h, area.nome).toContain('Lançando desde 01/10/2026.');
      // Sem número de integração no mês: o ponto da integração nem aparece.
      expect(quantas(h, 'integracao'), area.nome).toBe(0);
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      // A rede: a falta mora no cabeçalho de "Por loja"; sem a volta, nada de ponto da volta.
      atual.visao = { tipo: 'rede' };
      const rede = await naTela(await area.mes({ mes: '2026-10', rede: '1' }), `${area.raiz}/faturamento`, area.alcance, area.preferencia);
      expect(noCabecalho(rede, 'Por loja', 'falta'), area.nome).toBe(true);
      expect(quantas(rede, 'volta'), area.nome).toBe(0);
      for (const t of SAIU) expect(rede, `${area.nome}: ${t}`).not.toContain(t);
    }
  });

  it('o dia, nas duas áreas: números e Não vendeu no primeiro canal, Remover no painel; no dia fechado, o porquê abaixo do aviso', async () => {
    for (const area of AREAS()) {
      atual.ctx = () => ({ parceiro: A, alcance: area.alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
      const h = await naTela(await area.dia(ids.vp, DIA), `${area.raiz}/faturamento/${ids.vp}/${DIA}`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="faturamento-dia"');
      expect(noCabecalho(h, 'Loja', 'numeros'), area.nome).toBe(true);
      expect([quantas(h, 'numeros'), quantas(h, 'nao-vendeu'), quantas(h, 'remover'), quantas(h, 'periodo-fechado')], area.nome).toEqual([1, 1, 1, 0]);
      expect(ancora(h, 'nao-vendeu'), area.nome).toBeGreaterThan(h.indexOf('name="naoVendeu_LOJA"'));
      expect(ancora(h, 'nao-vendeu'), area.nome).toBeLessThan(h.indexOf('>Delivery próprio</h2>'));
      expect(noCabecalho(h, 'Lançou no dia ou na loja errada?', 'remover'), area.nome).toBe(true);
      for (const t of SAIU) expect(h, `${area.nome}: ${t}`).not.toContain(t);

      const f = await naTela(await area.dia(ids.vp, FECHADO), `${area.raiz}/faturamento/${ids.vp}/${FECHADO}`, area.alcance, area.preferencia);
      expect(f, area.nome).toContain('O período Início de outubro já foi fechado no DRE.');
      expect(ancora(f, 'periodo-fechado'), area.nome).toBeGreaterThan(f.indexOf('data-aviso-periodo-fechado'));
      expect(f, area.nome).toContain('<fieldset disabled=""');
      for (const p of ['periodo-fechado', 'numeros', 'nao-vendeu']) expect(foraDeFieldset(f, p), `${area.nome}: ${p}`).toBe(true);
      expect(quantas(f, 'remover'), area.nome).toBe(0);
    }
  });

  it('"Lançar o dia" com duas lojas, nas duas áreas: loja e data junto do rótulo, atalhos no cabeçalho', async () => {
    for (const area of AREAS()) {
      atual.ctx = () => ({ parceiro: A, alcance: area.alcance, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
      atual.visao = { tipo: 'rede' };
      const h = await naTela(await area.lancar(), `${area.raiz}/faturamento/lancar`, area.alcance, area.preferencia);
      expect(h, area.nome).toContain('data-ajuda-tela="faturamento-lancar"');
      expect(ancora(h, 'loja'), area.nome).toBeGreaterThan(h.indexOf('<label for="loja"'));
      expect(ancora(h, 'loja'), area.nome).toBeLessThan(h.indexOf('<select'));
      expect(ancora(h, 'data'), area.nome).toBeGreaterThan(h.indexOf('<label for="data"'));
      expect(noCabecalho(h, 'Atalhos', 'atalhos'), area.nome).toBe(true);
    }
  });

  it('quem só vê abre o dia com números e Não vendeu (fora do bloco travado) e sem o Remover, nem o texto dele', async () => {
    const soVe = alcanceDe('OPERADOR', 'rede', ['faturamento.ver']);
    atual.ctx = () => ({ parceiro: A, alcance: soVe, cliente: a, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Vera' } });
    const h = await naTela(await ErpDiaPage({ params: { lojaId: ids.vp, data: DIA }, searchParams: {} }), `/erp/faturamento/${ids.vp}/${DIA}`, soVe, { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] });
    expect(h).toContain('Você pode ver este dia.');
    expect([quantas(h, 'numeros'), quantas(h, 'nao-vendeu'), quantas(h, 'remover')]).toEqual([1, 1, 0]);
    for (const p of ['numeros', 'nao-vendeu']) expect(foraDeFieldset(h, p), p).toBe(true);
    expect(h).not.toContain('Remover serve');
    expect(JSON.stringify(ajudaParaATela(soVe))).not.toMatch(/Remover serve|Para tirar a falta/);
  });
});
