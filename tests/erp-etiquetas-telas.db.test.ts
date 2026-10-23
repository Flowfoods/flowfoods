/**
 * ERP 3.4 · as telas de etiqueta (as páginas e as actions de verdade, com banco): o que cada pessoa recebe no HTML e o que as
 * actions deixam passar.
 *  - a cozinha (operador): a entrada vai direto à loja; o painel lista o lote concluído e a embalagem aberta, sem R$; emite a
 *    etiqueta do lote pela action (o segundo toque com a mesma chave = "ja-emitida"); a emissão mostra a prévia e os três
 *    caminhos (Zebra, .zpl, papel); o pedido de impressão devolve o ZPL e grava o resultado; o papel só abre com o pedido;
 *  - abrir a embalagem: o formulário lista o lote da nota e a validade de cada conservação; a action volta para a abertura com
 *    "aberta"; a abertura emite a etiqueta dela;
 *  - o lote do fornecedor na nota: a dona registra pela action; o operador não vê compras (sem acesso); o gerente de outra loja
 *    recebe 404; o detalhe da nota leva à tela;
 *  - o lote da Produção leva à etiqueta (só para quem imprime); histórico com totais, sem R$;
 *  - gerente de outra loja e outro parceiro: 404; o nível 1 vê e imprime, mas não abre embalagem.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-etiquetas-telas.db.test.ts
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
  usePathname: () => '/erp/etiquetas',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
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
vi.mock('@/lib/erp/credenciais', async (orig) => ({
  ...(await orig<typeof import('@/lib/erp/credenciais')>()),
  idsDaEquipe: async () => new Set(['u-caio', 'u-duda']),
  pessoasQueProduzem: async () => [],
}));
vi.mock('@/app/entrar/actions', () => ({ acaoSair: async () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { concluirProducao, listaDaProducao, obterOrdem, pegarProducao, planejarProducao } from '@/lib/erp/producao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import ErpEtiquetasPage from '@/app/erp/etiquetas/page';
import ErpEtiquetasDaLojaPage from '@/app/erp/etiquetas/[lojaId]/page';
import ErpEtiquetaDoLotePage from '@/app/erp/etiquetas/[lojaId]/lote/[ordemId]/page';
import ErpAbrirEmbalagemDaLojaPage from '@/app/erp/etiquetas/[lojaId]/abrir/page';
import ErpEmbalagemAbertaPage from '@/app/erp/etiquetas/[lojaId]/aberta/[aberturaId]/page';
import ErpEmissaoPage from '@/app/erp/etiquetas/[lojaId]/[etiquetaId]/page';
import ErpPapelPage from '@/app/erp/etiquetas/[lojaId]/[etiquetaId]/papel/page';
import ErpHistoricoDeImpressoesDaLojaPage from '@/app/erp/etiquetas/historico/[lojaId]/page';
import ErpImpressoraPage from '@/app/erp/etiquetas/impressora/page';
import ErpLotesDaNotaPage from '@/app/erp/compras/[id]/lotes/page';
import ErpNotaPage from '@/app/erp/compras/[id]/page';
import ErpLotePage from '@/app/erp/producao/[lojaId]/[ordemId]/page';
import ParceiroEtiquetasDaLojaPage from '@/app/rodolfo/(painel)/erp/[slug]/etiquetas/[lojaId]/page';
import ParceiroAbrirEmbalagemDaLojaPage from '@/app/rodolfo/(painel)/erp/[slug]/etiquetas/[lojaId]/abrir/page';
import * as daSessao from '@/app/erp/etiquetas/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/etiquetas/actions';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 3.4 · telas de etiqueta (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `tt${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const como = (alcance: Alcance, quem: { userId: string; nome: string } = { userId: 'u-duda', nome: 'Duda Lima' }, parceiro = A, cliente = a) => {
    atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: quem.userId, autorNome: quem.nome }, pessoa: { setores: [] } });
  };
  const CAIO = { userId: 'u-caio', nome: 'Caio Cozinha' };
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  const SEM_ETIQUETA = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);

  let n = 0;
  const chave = () => `tt-${sufixo}-${++n}`.padEnd(12, 'x');
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string; url?: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { erro: (e as Error).message, url: (e as { url?: string }).url };
    }
  };
  const pagina = async (el: Promise<unknown>) => sp(renderToStaticMarkup((await el) as ReactElement));
  const formDe = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
  };
  const idDa = (url: string, depoisDe: string) => url.split(depoisDe)[1].split('?')[0];

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = (await db.parceiroFlow.create({ data: { nome: 'Telas Etiquetas A', slug: `tetiq-a-${sufixo}`, status: 'ATIVO' } })) as typeof A;
    B = (await db.parceiroFlow.create({ data: { nome: 'Telas Etiquetas B', slug: `tetiq-b-${sufixo}`, status: 'ATIVO' } })) as typeof B;
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [k, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[k] = r.id;
    }
    const prazo = (dias: string) => ({ aceita_REFRIGERADO: 'on', validade_REFRIGERADO: dias, validadeEm_REFRIGERADO: 'dias' });
    for (const [k, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO', ...prazo('5') },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO', ...prazo('3') },
      creme: { nome: 'Creme de leite', unidade: 'KG', conteudo: '1', preco: '12,00', conservacao: 'REFRIGERADO', ...prazo('3') },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${k}: ${JSON.stringify(r)}`);
      ids[k] = r.id;
    }
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    for (const i of ab.itens) expect((await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: '50', escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
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
        ],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' } } },
      } as never,
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
    // Um lote concluído pelo Caio (4,6 kg).
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '5');
    if (!lista.ok) throw new Error(JSON.stringify(lista));
    const p = await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ids.molho, quantidade: '5', paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: chave() }, CAIO);
    if (!p.ok) throw new Error(JSON.stringify(p));
    ids.lote = p.id;
    const l0 = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
    expect((await pegarProducao(a, OPERADOR(), ids.vp, p.id, { versao: l0.ordem.versao }, CAIO)).ok).toBe(true);
    const r = (await obterRequisicao(a, DONA(), ids.vp, l0.requisicao!.id))!;
    expect(
      (await atenderRequisicao(a, GERENTE(), ids.vp, r.requisicao.id, { versao: r.requisicao.versao, linhas: r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true }, 'Edu Estoque')).ok,
    ).toBe(true);
    const l = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
    const c = await concluirProducao(a, OPERADOR(), ids.vp, p.id, { versao: l.ordem.versao, produzido: '4,6', escala: 'base', motivo: '', conservacao: '' }, CAIO);
    if (!c.ok) throw new Error(JSON.stringify(c));
    const forn = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!forn.ok) throw new Error(JSON.stringify(forn));
    const nota = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: forn.id, numero: '4521', serie: '', data: hoje, frete: '', total: '24,00', itens: [{ insumoId: ids.creme, embalagem: 'padrao', quantidade: '2', valor: '24,00' }] }, 'Marina');
    if (!nota.ok) throw new Error(JSON.stringify(nota));
    ids.nota = nota.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a cozinha: a entrada vai direto à loja; o painel mostra o lote concluído com a validade, o botão de abrir e nenhum R$', async () => {
    como(OPERADOR());
    expect(await rodar(() => ErpEtiquetasPage())).toMatchObject({ url: `/erp/etiquetas/${ids.vp}` });
    const h = await pagina(ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }));
    const t = texto(h);
    expect(t).toContain('Etiquetas');
    expect(t).toContain('Molho cheddar');
    expect(t).toMatch(/Vence (em 3 dias|amanhã|hoje)/);
    expect(t).toContain('fez Caio Cozinha');
    expect(t).toContain('sem etiqueta ainda');
    expect(h).toContain(`/erp/etiquetas/${ids.vp}/abrir`);
    expect(h).toContain(`/erp/etiquetas/${ids.vp}/lote/${ids.lote}`);
    expect(h).not.toContain('R$');
    // Busca pelo código do lote.
    const codigo = (await a.ordemProducao.findUnique({ where: { id: ids.lote } }))!.codigoLote;
    expect(texto(await pagina(ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { lote: codigo } })))).toContain('Molho cheddar');
    expect(texto(await pagina(ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { lote: '999999-99' } })))).toContain('Nenhum lote concluído com esse código.');
  });

  it('a etiqueta do lote: o retrato, a prévia proporcional e o formulário; a action emite e volta para a emissão; a mesma chave = "ja-emitida"', async () => {
    como(OPERADOR());
    const h = await pagina(ErpEtiquetaDoLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote } }));
    const t = texto(h);
    expect(t).toContain('Etiqueta do lote');
    expect(t).toContain('Caio Cozinha');
    expect(h).toMatch(/role="img" aria-label="Prévia da etiqueta 60 × 40 mm: Molho cheddar; REFRIGERADO; MANIPULADO \d\d\/\d\d\/\d\d \d\d:\d\d; VALIDADE \d\d\/\d\d\/\d\d \d\d:\d\d; LOTE \d{6}-\d{2}; RESP\. Caio Cozinha; Vila da Penha · E\d{6}-0000"/);
    expect(h).toContain('name="envio" value="env-');
    expect(h).not.toContain('R$');
    const k = chave();
    const form = () => formDe({ formato: 'E60X40', quantas: '3', quanto: '1', escala: 'base', hora: 'sim', envio: k });
    const r1 = (await rodar(() => daSessao.acaoEmitirDoLote(ids.vp, ids.lote, null, form()))) as { url: string };
    expect(r1.url).toMatch(new RegExp(`^/erp/etiquetas/${ids.vp}/[a-z0-9]+\\?feito=emitida$`));
    ids.etiqueta = idDa(r1.url, `/erp/etiquetas/${ids.vp}/`);
    expect(await rodar(() => daSessao.acaoEmitirDoLote(ids.vp, ids.lote, null, form()))).toMatchObject({ url: `/erp/etiquetas/${ids.vp}/${ids.etiqueta}?feito=ja-emitida` });
    // 3 × 1 kg passa de 4,6 kg? Não; 5 × 1 kg passa: a frase volta no campo.
    expect(await rodar(() => daSessao.acaoEmitirDoLote(ids.vp, ids.lote, null, formDe({ formato: 'E60X40', quantas: '5', quanto: '1', escala: 'base', hora: 'sim', envio: chave() })))).toMatchObject({ ok: false, erros: { quanto: expect.stringMatching(/passa do que saiu do lote/) } });
    // Sem permissão de etiqueta: a action recusa (a tela nem aparece).
    como(SEM_ETIQUETA());
    expect(await rodar(() => daSessao.acaoEmitirDoLote(ids.vp, ids.lote, null, form()))).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(await rodar(() => ErpEtiquetaDoLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote } }))).toMatchObject({ erro: 'SEM_ACESSO' });
  });

  it('a emissão: prévia, os três caminhos e os pedidos; o pedido devolve o ZPL e grava o resultado; o papel só abre com o pedido de papel', async () => {
    como(OPERADOR());
    const h = await pagina(ErpEmissaoPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: { feito: 'emitida' } }));
    const t = texto(h);
    expect(t).toContain('Etiqueta emitida. Agora mande para a impressora');
    expect(t).toContain('Imprimir na Zebra');
    expect(t).toContain('Baixar o arquivo .zpl');
    expect(t).toContain('Imprimir no papel (A4)');
    expect(t).toContain('Procurando a Zebra neste computador');
    expect(t).toContain('Esta etiqueta ainda não foi para a impressora.');
    expect(h).toContain('value="3"');
    expect(h).not.toContain('R$');
    const zebra = await daSessao.acaoPedirImpressao(ids.vp, ids.etiqueta, { copias: '3', transporte: 'BROWSER_PRINT', resolucao: '203', envio: chave() });
    if (!zebra.ok) throw new Error(JSON.stringify(zebra));
    expect(zebra.zpl).toMatch(/^\^XA\n\^CI28\n\^PW480\n\^LL320/);
    expect(zebra.zpl).toContain('^PQ3,0,1,Y');
    expect(zebra.situacao).toBe('PREPARADA');
    expect(await daSessao.acaoResultadoDaImpressao(ids.vp, zebra.id, 'ENVIADA', '')).toMatchObject({ ok: true });
    const papel = await daSessao.acaoPedirImpressao(ids.vp, ids.etiqueta, { copias: '2', transporte: 'PAPEL', resolucao: '203', envio: chave() });
    if (!papel.ok) throw new Error(JSON.stringify(papel));
    const hp = await pagina(ErpPapelPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: { pedido: papel.id } }));
    expect((hp.match(/<svg role="img"/g) ?? []).length).toBe(2);
    expect(hp).toContain('width:60mm;height:40mm');
    expect(hp).toContain('@page { size: A4; margin: 8mm; }');
    expect(hp).toContain('ff-nao-imprime');
    // Sem pedido, ou com o pedido da Zebra: 404 (abrir a página não grava nada).
    expect(await rodar(() => ErpPapelPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: {} }))).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => ErpPapelPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: { pedido: zebra.id } }))).toMatchObject({ erro: 'NOT_FOUND' });
    const depois = texto(await pagina(ErpEmissaoPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: {} })));
    expect(depois).toContain('Primeira impressão · 3 cópias');
    expect(depois).toContain('Reimpressão 1 · 2 cópias');
    expect(depois).toContain('Enviada à impressora');
    expect(depois).toContain('Arquivo gerado');
    // O histórico da loja: 2 pedidos, 5 etiquetas, 3 enviadas, 2 em arquivo ou papel.
    const hh = texto(await pagina(ErpHistoricoDeImpressoesDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} })));
    expect(hh).toMatch(/Pedidos 2 .*Etiquetas 5 .*Enviadas à Zebra 3 .*Arquivo ou papel 2/);
    expect(hh).not.toContain('R$');
    // A impressora: a tela de configuração e o teste (nada gravado).
    expect(texto(await pagina(ErpImpressoraPage()))).toContain('Como ligar a Zebra');
    const teste = await daSessao.acaoZplDeTeste('E60X60', '300');
    expect(teste).toMatchObject({ ok: true, nomeArquivo: 'etiqueta-teste-60x60.zpl' });
    expect((teste as { zpl: string }).zpl).toMatch(/\^PW720\n\^LL720/);
  });

  it('abrir a embalagem: o lote da nota, a validade de cada conservação; a action volta para a abertura; a abertura emite a etiqueta', async () => {
    como(DONA(), { userId: 'u-marina', nome: 'Marina' });
    const venc = new Date(Date.now() + 20 * DIA).toISOString().slice(0, 10);
    const reg = await rodar(() => daSessao.acaoRegistrarLote(ids.nota, null, formDe({ insumo: ids.creme, codigo: 'L2310', vencimento: venc.split('-').reverse().join('/'), fabricacao: '', marca: 'Tirolez', envio: chave() })));
    expect(reg).toMatchObject({ url: `/erp/compras/${ids.nota}/lotes?feito=lote-registrado` });
    como(OPERADOR());
    const h = await pagina(ErpAbrirEmbalagemDaLojaPage({ params: { lojaId: ids.vp }, searchParams: { insumo: ids.creme } }));
    const t = texto(h);
    expect(t).toContain('Abrir uma embalagem');
    expect(t).toContain('Lote L2310');
    expect(t).toContain('dura 3 dias depois de aberto');
    expect(t).toContain('prazo depois de aberto não informado');
    // Nota e fornecedor do lote só para quem vê compras: o operador não vê.
    expect(t).not.toContain('Nota 4521');
    const lote = (await a.loteDeInsumo.findFirst({ where: { codigo: 'L2310' } }))!;
    const abriu = (await rodar(() => daSessao.acaoAbrirEmbalagem(ids.vp, null, formDe({ insumo: ids.creme, lote: lote.id, conservacao: 'REFRIGERADO', quanto: '', escala: 'base', envio: chave() })))) as { url: string };
    expect(abriu.url).toMatch(new RegExp(`^/erp/etiquetas/${ids.vp}/aberta/[a-z0-9]+\\?feito=aberta$`));
    ids.aberta = idDa(abriu.url, '/aberta/');
    const ha = texto(await pagina(ErpEmbalagemAbertaPage({ params: { lojaId: ids.vp, aberturaId: ids.aberta }, searchParams: { feito: 'aberta' } })));
    expect(ha).toContain('Abertura registrada com a data e a hora de agora.');
    expect(ha).toMatch(/Vale até \d\d\/\d\d\/\d{4} às \d\d:\d\d: 3 dias depois de aberto \(refrigerado\), antes do vencimento do lote/);
    expect(ha).toContain('L2310');
    expect(ha).toContain('Tirolez');
    const em = (await rodar(() => daSessao.acaoEmitirDaAbertura(ids.vp, ids.aberta, null, formDe({ formato: 'E60X60', quantas: '1', hora: 'sim', envio: chave() })))) as { url: string };
    expect(em.url).toMatch(new RegExp(`^/erp/etiquetas/${ids.vp}/[a-z0-9]+\\?feito=emitida$`));
    const he = await pagina(ErpEmissaoPage({ params: { lojaId: ids.vp, etiquetaId: idDa(em.url, `/erp/etiquetas/${ids.vp}/`) }, searchParams: {} }));
    expect(he).toMatch(/aria-label="Prévia da etiqueta 60 × 60 mm: Creme de leite; REFRIGERADO; ABERTO \d\d\/\d\d\/\d\d \d\d:\d\d; USAR ATÉ \d\d\/\d\d\/\d\d \d\d:\d\d; VENC\. LOTE \d\d\/\d\d\/\d\d; LOTE FORN\. L2310; RESP\. Duda Lima; MARCA Tirolez; Vila da Penha · E\d{6}-\d{4}"/);
    // O painel da loja passa a mostrar a embalagem aberta.
    expect(texto(await pagina(ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} })))).toMatch(/Creme de leite aberta \d\d\/\d\d\/\d{4} às \d\d:\d\d por Duda Lima · refrigerado · lote L2310/);
  });

  it('o lote do fornecedor na nota: a dona vê e registra; o operador não vê compras; o gerente de outra loja recebe 404; o detalhe da nota leva à tela', async () => {
    como(DONA(), { userId: 'u-marina', nome: 'Marina' });
    const h = await pagina(ErpLotesDaNotaPage({ params: { id: ids.nota }, searchParams: { feito: 'lote-registrado' } }));
    const t = texto(h);
    expect(t).toContain('Lote e vencimento');
    expect(t).toContain('Lote registrado.');
    expect(t).toContain('Lote L2310');
    expect(t).toContain('1 embalagem aberta');
    // Com embalagem aberta, o lote não sai (sem o botão).
    expect(h).not.toContain('Tirar<span class="sr-only"> o lote L2310');
    expect(t).toContain('Registrar um lote');
    const hn = texto(await pagina(ErpNotaPage({ params: { id: ids.nota }, searchParams: {} })));
    expect(hn).toContain('Registrar ou ver os lotes');
    como(OPERADOR());
    expect(await rodar(() => ErpLotesDaNotaPage({ params: { id: ids.nota }, searchParams: {} }))).toMatchObject({ erro: 'SEM_ACESSO' });
    como(GERENTE_DELIVERY());
    expect(await rodar(() => ErpLotesDaNotaPage({ params: { id: ids.nota }, searchParams: {} }))).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => daSessao.acaoRegistrarLote(ids.nota, null, formDe({ insumo: ids.creme, codigo: 'X1', vencimento: '', fabricacao: '', marca: '', envio: chave() })))).toMatchObject({ ok: false });
  });

  it('o lote da Produção leva à etiqueta para quem imprime (e não para quem não imprime)', async () => {
    como(OPERADOR(), CAIO);
    expect(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: {} }))).toContain(`href="/erp/etiquetas/${ids.vp}/lote/${ids.lote}"`);
    como(SEM_ETIQUETA(), CAIO);
    expect(await pagina(ErpLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote }, searchParams: {} }))).not.toContain('/erp/etiquetas/');
  });

  it('gerente de outra loja e outro parceiro: 404 em todas as telas e as actions recusam', async () => {
    como(GERENTE_DELIVERY());
    for (const p of [
      () => ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }),
      () => ErpEtiquetaDoLotePage({ params: { lojaId: ids.vp, ordemId: ids.lote } }),
      () => ErpEmissaoPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: {} }),
      () => ErpEmbalagemAbertaPage({ params: { lojaId: ids.vp, aberturaId: ids.aberta }, searchParams: {} }),
      () => ErpHistoricoDeImpressoesDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }),
    ]) {
      expect(await rodar(p)).toMatchObject({ erro: 'NOT_FOUND' });
    }
    // A emissão de outra loja pedida pela loja dele: não acha.
    expect(await daSessao.acaoPedirImpressao(ids.delivery, ids.etiqueta, { copias: '1', transporte: 'ARQUIVO_ZPL', resolucao: '203', envio: chave() })).toMatchObject({ ok: false });
    expect(await daSessao.acaoPedirImpressao(ids.vp, ids.etiqueta, { copias: '1', transporte: 'ARQUIVO_ZPL', resolucao: '203', envio: chave() })).toMatchObject({ ok: false });
    como(alcanceDe('DONO', 'rede'), { userId: 'u-bia', nome: 'Bia' }, B, b);
    expect(await rodar(() => ErpEtiquetasDaLojaPage({ params: { lojaId: ids.vp }, searchParams: {} }))).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => ErpEmissaoPage({ params: { lojaId: ids.vp, etiquetaId: ids.etiqueta }, searchParams: {} }))).toMatchObject({ erro: 'NOT_FOUND' });
    expect(await rodar(() => ErpLotesDaNotaPage({ params: { id: ids.nota }, searchParams: {} }))).toMatchObject({ erro: 'NOT_FOUND' });
  });

  it('o nível 1 vê e imprime, mas não abre embalagem: sem o botão, com a frase; a action de abrir é recusada', async () => {
    como(ALCANCE_FLOWFOODS, { userId: 'u-rodolfo', nome: 'Rodolfo' });
    const h = await pagina(ParceiroEtiquetasDaLojaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: {} }));
    expect(texto(h)).toContain('Molho cheddar');
    expect(h).not.toContain(`/etiquetas/${ids.vp}/abrir"`);
    const ha = texto(await pagina(ParceiroAbrirEmbalagemDaLojaPage({ params: { slug: A.slug, lojaId: ids.vp }, searchParams: { insumo: ids.creme } })));
    expect(ha).toContain('Abrir a embalagem é de quem está na cozinha: a FlowFoods não abre.');
    expect(ha).not.toContain('Registrar a abertura');
    expect(await rodar(() => doNivel1.acaoAbrirEmbalagem(A.slug, ids.vp, null, formDe({ insumo: ids.creme, lote: 'sem', conservacao: 'REFRIGERADO', quanto: '', escala: 'base', envio: chave() })))).toMatchObject({
      ok: false,
      erros: { geral: expect.stringMatching(/FlowFoods não abre/) },
    });
    const pedido = await doNivel1.acaoPedirImpressao(A.slug, ids.vp, ids.etiqueta, { copias: '1', transporte: 'ARQUIVO_ZPL', resolucao: '203', envio: chave() });
    expect(pedido).toMatchObject({ ok: true, situacao: 'EXPORTADA' });
  });
});
