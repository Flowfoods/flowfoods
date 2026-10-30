/**
 * ERP N.2 · preço pela META DE CMV por canal no Postgres de verdade — o cenário sintético de referência do plano
 * (Notion, "Complemento aprovado — cenário de referência"), de ponta a ponta: nota de compra → custo por kg → ficha →
 * embalagens por canal → taxa do iFood → metas de CMV → preços definidos → CMV, farol e resultado em cada canal.
 * Números ILUSTRATIVOS: metas de 25%/30% e taxa de 20% existem só neste parceiro de teste, criado e apagado aqui.
 *
 * Também: a meta é gravada com versão (conflito), histórico e faixa; a margem-alvo antiga não é convertida nem apagada;
 * mudar a meta não muda preço nenhum; tirar a meta dá "sem dados" (nunca verde); a lista e o detalhe dão o mesmo número;
 * a ação recusa quem não muda preços; o operador não recebe CMV, preço nem custo no payload da ficha nem da lista.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-produto.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
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
    visaoDaRequisicao: async () => ({ visao: 'rede' }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha, listarFichas, obterFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { cmvDaLista, custoPorCanal, obterTaxaDoIfood, salvarEmbalagens, salvarMetasDeCmv, salvarPrecos, salvarTaxaDoIfood, MENSAGEM_CONFLITO_DAS_METAS } from '@/lib/erp/canais';
import { parcelasEmTexto, porcentagemDoCmv } from '@/lib/erp/cmv-produto-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { formatarFracao, type Fracao } from '@/lib/erp/unidades';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import ErpFichaPage from '@/app/erp/fichas/[id]/page';
import ErpFichasPage from '@/app/erp/fichas/page';
import * as fichasDaSessao from '@/app/erp/fichas/actions';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: string) => t.replace(/\s/g, ' ');
const reais = (f: Fracao) => sp(formatarFracao(f));

describe.skipIf(!URL_TESTE)('ERP N.2 · preço pela meta de CMV, cenário de referência (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `m${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let P: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const ctxDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', autorNome: string) => () => ({
    cliente: a,
    alcance: alcanceDe(perfilBase),
    parceiro: P,
    sessao: { userId: 'u', autorNome },
    bloqueio: null,
    pessoa: { setores: [] },
  });
  const tela = async () => (await custoPorCanal(a, (await obterFicha(a, ids.ficha))!))!;
  const formDasMetas = (versao: string, m: Partial<Record<string, string>>) => {
    const f = new FormData();
    f.set('versao', versao);
    for (const c of ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']) f.set(`metaCmv_${c}`, m[c] ?? '');
    return f;
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    P = await db.parceiroFlow.create({ data: { nome: 'Meta de CMV (N.2)', slug: `meta-cmv-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(P.id, db);
    for (const [chave, campos] of Object.entries({
      // Preço cadastrado de propósito diferente: a nota abaixo é que vale (1.5).
      insumo: { tipo: 'INGREDIENTE', nome: 'Insumo de teste', unidade: 'KG', conteudo: '5', preco: '50,00' },
      caixa: { tipo: 'EMBALAGEM', nome: 'Caixa', unidade: 'UN', conteudo: '1', preco: '0,30' },
      sacola: { tipo: 'EMBALAGEM', nome: 'Sacola', unidade: 'UN', conteudo: '1', preco: '0,80' },
    })) {
      const r = await cadastrarInsumo(a, { escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const loja = await cadastrarLoja(a, { nome: 'Loja de teste' }, 'Marina');
    const forn = await cadastrarFornecedor(a, { nome: 'Fornecedor de teste', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!loja.ok || !forn.ok) throw new Error('loja/fornecedor');
    // Compra de teste: uma embalagem de 5 kg por R$ 100,00 + R$ 10,00 de frete → R$ 22,00/kg.
    const nota = await lancarNota(
      a,
      alcanceDe('DONO'),
      { lojaId: loja.id, fornecedorId: forn.id, numero: '1', serie: '', data: hojeNoRio(), frete: '10,00', total: '110,00', itens: [{ insumoId: ids.insumo, embalagem: 'padrao', quantidade: '1', valor: '100,00' }] },
      'Marina',
    );
    if (!nota.ok) throw new Error(JSON.stringify(nota));
    // Ficha de teste: 1 kg, fator 1, rende 10 porções → R$ 22,00 a receita, R$ 2,20 a porção.
    const f = await cadastrarFicha(
      a,
      { nome: 'Prato de teste', tipo: 'PRATO', rendimento: '10', itens: [{ insumoId: ids.insumo, quantidade: '1', unidade: 'kg' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.ficha = f.id;
    const em = await salvarEmbalagens(
      a,
      ids.ficha,
      {
        impressao: '',
        linhas: [
          { canal: 'DELIVERY_PROPRIO', insumoId: ids.caixa, quantidade: '1', unidade: 'un' },
          { canal: 'IFOOD', insumoId: ids.sacola, quantidade: '1', unidade: 'un' },
        ],
      },
      'Marina',
    );
    if (!em.ok) throw new Error(JSON.stringify(em));
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, [P.id]);
      await db.$disconnect();
    }
  });

  it('a meta do iFood grava antes da taxa; todos os canais têm histórico e a taxa continua desconhecida', async () => {
    const o = await obterTaxaDoIfood(a);
    expect(o.metas).toEqual({ LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null });
    expect(await salvarMetasDeCmv(a, { versao: o.versaoDasMetas, metas: { LOJA: '25', DELIVERY_PROPRIO: '25', IFOOD: '28' } }, 'Marina')).toMatchObject({ ok: true, mudou: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] });
    const d = await obterTaxaDoIfood(a);
    expect(d.taxa).toBeNull();
    expect(d.versao).not.toBe('');
    expect(d.metas.IFOOD).toBe(2800);
    expect((await tela()).cmv[2].sugerido.tipo).toBe('ok');
    expect((await tela()).cmv[2].resultado).toMatchObject({ tipo: 'pendente', motivo: expect.stringContaining('taxa do iFood não configurada') });
    const h = await listarHistorico(a, { de: [{ entidade: 'CanalConfig', ids: (await a.canalConfig.findMany()).map((c) => c.id) }], limite: 10, verPrecos: true });
    expect(h.flatMap((x) => x.mudancas.map((m) => `${m.campo}: ${sp(String(m.depois))}`))).toEqual(expect.arrayContaining(['meta de CMV: 25%']));
  });

  it('com a taxa do iFood (20%), a meta do iFood grava; tela velha dá conflito; 0% e 100% são recusados; nada vira margem-alvo', async () => {
    const t = await obterTaxaDoIfood(a);
    expect(await salvarTaxaDoIfood(a, { comissao: '20', pagamento: '', versao: t.versao }, 'Marina')).toMatchObject({ ok: true });
    const o = await obterTaxaDoIfood(a);
    expect(await salvarMetasDeCmv(a, { versao: o.versaoDasMetas, metas: { LOJA: '0', DELIVERY_PROPRIO: '100', IFOOD: '30' } }, 'Marina')).toMatchObject({
      ok: false,
      erros: { 'metaCmv-LOJA': expect.stringMatching(/maior que 0%/), 'metaCmv-DELIVERY_PROPRIO': expect.stringMatching(/abaixo de 100%/) },
    });
    expect(await salvarMetasDeCmv(a, { versao: o.versaoDasMetas, metas: { LOJA: '25', DELIVERY_PROPRIO: '25', IFOOD: '30' } }, 'Marina')).toMatchObject({ ok: true, mudou: ['IFOOD'] });
    // A tela de antes (versão velha) não grava por cima.
    expect(await salvarMetasDeCmv(a, { versao: o.versaoDasMetas, metas: { LOJA: '28', DELIVERY_PROPRIO: '25', IFOOD: '30' } }, 'Marina')).toMatchObject({
      ok: false,
      conflito: true,
      erros: { geral: MENSAGEM_CONFLITO_DAS_METAS },
    });
    const d = await obterTaxaDoIfood(a);
    expect(d.metas).toEqual({ LOJA: 2500, DELIVERY_PROPRIO: 2500, IFOOD: 3000 });
    expect(d.margens).toEqual({ LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null });
    expect(d.taxa).toEqual({ comissaoBp: 2000, pagamentoBp: 0 });
  });

  it('a ação recusa quem não muda preços (gerente) e aceita a dona', async () => {
    const o = await obterTaxaDoIfood(a);
    atual.ctx = ctxDe('GERENTE', 'Gil');
    expect(await fichasDaSessao.acaoSalvarMetasDeCmv(null, formDasMetas(o.versaoDasMetas, { LOJA: '40', DELIVERY_PROPRIO: '25', IFOOD: '30' }))).toMatchObject({ ok: false });
    expect((await obterTaxaDoIfood(a)).metas.LOJA).toBe(2500);
    atual.ctx = ctxDe('DONO', 'Marina');
    await expect(fichasDaSessao.acaoSalvarMetasDeCmv(null, formDasMetas(o.versaoDasMetas, { LOJA: '25', DELIVERY_PROPRIO: '25', IFOOD: '30' }))).rejects.toMatchObject({
      url: '/erp/fichas/canais?feito=metas-igual',
    });
  });

  it('sem preço definido: a sugestão aparece (R$ 8,80 · R$ 10,00 · R$ 10,00), mas o CMV fica sem dados — a sugestão não é preço', async () => {
    const t = await tela();
    expect(t.cmv.map((x) => reais(x.fisico.valor))).toEqual(['R$ 2,20', 'R$ 2,50', 'R$ 3,00']);
    expect(t.cmv.map((x) => (x.sugerido.tipo === 'ok' ? x.sugerido.centavos : x.sugerido.tipo))).toEqual([880, 1000, 1000]);
    expect(t.cmv.map((x) => x.status)).toEqual(['semDados', 'semDados', 'semDados']);
    expect(t.cmv.every((x) => x.motivo === 'preço de venda não definido')).toBe(true);
    expect(t.cmv.every((x) => x.cmvBp === null)).toBe(true);
  });

  it('cenário completo: preços R$ 11,00 · R$ 12,50 · R$ 15,00 → CMV 20% nos três, dentro; resultado R$ 8,80 (80%) · R$ 10,00 (80%) · R$ 9,00 (60%)', async () => {
    const t = await tela();
    expect(await salvarPrecos(a, ids.ficha, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '11,00', DELIVERY_PROPRIO: '12,50', IFOOD: '15,00' } }, 'Marina')).toMatchObject({
      ok: true,
    });
    const d = await tela();
    expect(d.cmv.map((x) => x.precoCentavos)).toEqual([1100, 1250, 1500]);
    expect(d.cmv.map((x) => x.cmvBp && porcentagemDoCmv(x.cmvBp))).toEqual(['20,0%', '20,0%', '20,0%']);
    expect(d.cmv.map((x) => x.status)).toEqual(['dentro', 'dentro', 'dentro']);
    const res = d.cmv.map((x) => (x.resultado.tipo === 'ok' ? `${reais(x.resultado.valor)} (${porcentagemDoCmv(x.resultado.bp)})` : x.resultado.motivo));
    expect(res).toEqual(['R$ 8,80 (80,0%)', 'R$ 10,00 (80,0%)', 'R$ 9,00 (60,0%)']);
    const ifood = d.cmv[2];
    if (ifood.resultado.tipo !== 'ok') throw new Error('iFood deveria fechar');
    expect(reais(ifood.resultado.taxa)).toBe('R$ 3,00');
    expect(parcelasEmTexto('IFOOD', ifood.resultado.parcelas)).toBe('ingredientes, embalagens e taxa do iFood');
    // O histórico da ficha guarda o retrato pela meta de CMV (nunca "lucro").
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.ficha] }], limite: 1, verPrecos: true });
    const linhas = h[0].mudancas.map((m) => `${m.campo}: ${sp(String(m.depois))}`);
    expect(linhas).toEqual(
      expect.arrayContaining([
        'preço no iFood: R$ 15,00',
        'CMV no iFood: 20,0% (meta 30%, dentro da meta)',
        'resultado após os custos informados no iFood: R$ 9,00 (60,0%)',
        'custo físico do iFood na hora: R$ 3,00',
      ]),
    );
    expect(JSON.stringify(h).toLowerCase()).not.toContain('lucro');
  });

  it('a lista dá o mesmo número do detalhe (uma conta só)', async () => {
    const pagina = await listarFichas(a, {});
    const mapa = await cmvDaLista(a, pagina.linhas);
    const t = await tela();
    expect(mapa.get(ids.ficha)!.map((x) => [x.status, x.cmvBp && porcentagemDoCmv(x.cmvBp), x.precoCentavos])).toEqual(
      t.cmv.map((x) => [x.status, x.cmvBp && porcentagemDoCmv(x.cmvBp), x.precoCentavos]),
    );
  });

  it('mudar a meta não muda preço; tirar a meta da loja deixa a loja "sem dados" (nunca verde) e os outros canais seguem', async () => {
    const antes = await a.produtoCanal.findMany({ orderBy: { canal: 'asc' }, select: { canal: true, precoManualCentavos: true } });
    const o = await obterTaxaDoIfood(a);
    expect(await salvarMetasDeCmv(a, { versao: o.versaoDasMetas, metas: { LOJA: '', DELIVERY_PROPRIO: '15', IFOOD: '30' } }, 'Marina')).toMatchObject({ ok: true });
    expect(await a.produtoCanal.findMany({ orderBy: { canal: 'asc' }, select: { canal: true, precoManualCentavos: true } })).toEqual(antes);
    const t = await tela();
    expect(t.cmv.map((x) => x.status)).toEqual(['semDados', 'acima', 'dentro']);
    expect(t.cmv[0].motivo).toBe('sem meta de CMV para o canal');
    // O CMV da loja ao preço continua à vista (é número real), só não ganha farol.
    expect(t.cmv[0].cmvBp && porcentagemDoCmv(t.cmv[0].cmvBp)).toBe('20,0%');
    // Delivery com meta 15%: sugere R$ 2,50 ÷ 15% = R$ 16,67, mas o preço definido (R$ 12,50) fica.
    expect(t.cmv[1].sugerido).toMatchObject({ tipo: 'ok', centavos: 1667 });
    expect(t.cmv[1].precoCentavos).toBe(1250);
  });

  it('N.3: tirar o iFood do prato pela ação guarda o preço, vira "não ofertado" na ficha, na lista e no histórico; voltar recupera tudo', async () => {
    const t = await tela();
    const form = (ofertas: Record<string, boolean>) => {
      const f = new FormData();
      f.set('impressao', t.impressaoDosPrecos);
      f.set('custos', t.impressaoDosCustos);
      f.set('ofertas', '1');
      for (const [c, v] of Object.entries({ LOJA: '11,00', DELIVERY_PROPRIO: '12,50', IFOOD: '15,00' })) f.set(`preco_${c}`, v);
      for (const [c, v] of Object.entries(ofertas)) if (v) f.set(`oferta_${c}`, 'sim');
      return f;
    };
    atual.ctx = ctxDe('DONO', 'Marina');
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.ficha, null, form({ LOJA: true, DELIVERY_PROPRIO: true, IFOOD: false }))).rejects.toMatchObject({
      url: `/erp/fichas/${ids.ficha}?feito=precos`,
    });
    // O preço do iFood fica guardado: só a oferta mudou.
    const linha = (await a.produtoCanal.findFirst({ where: { canal: 'IFOOD' }, select: { precoManualCentavos: true, ativo: true } }))!;
    expect(linha).toEqual({ precoManualCentavos: 1500, ativo: false });
    const d = await tela();
    expect(d.ofertados).toEqual({ LOJA: true, DELIVERY_PROPRIO: true, IFOOD: false });
    expect(d.cmv[2]).toMatchObject({ status: 'naoOfertado', cmvBp: null, motivo: null });
    expect(d.impressaoDosPrecos).toMatch(/IFOOD:1500:fora$/);
    // A lista concorda.
    const mapa = await cmvDaLista(a, (await listarFichas(a, {})).linhas);
    expect(mapa.get(ids.ficha)![2].status).toBe('naoOfertado');
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.ficha] }], limite: 1, verPrecos: true });
    expect(h[0].mudancas.map((m) => `${m.campo}: ${sp(String(m.depois))}`)).toEqual(
      expect.arrayContaining(['preço no iFood: não ofertado (guardado R$ 15,00)', 'CMV no iFood: não ofertado']),
    );
    // Tela velha (que ainda achava o iFood ofertado) dá conflito em vez de gravar por cima.
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.ficha, null, form({ LOJA: true, DELIVERY_PROPRIO: true, IFOOD: true }))).resolves.toMatchObject({ ok: false, conflito: true });
    // Voltar ao canal com a tela nova: o preço guardado volta a valer.
    const t2 = await tela();
    const f2 = form({ LOJA: true, DELIVERY_PROPRIO: true, IFOOD: true });
    f2.set('impressao', t2.impressaoDosPrecos);
    f2.set('custos', t2.impressaoDosCustos);
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.ficha, null, f2)).rejects.toMatchObject({ url: `/erp/fichas/${ids.ficha}?feito=precos` });
    const v = await tela();
    expect(v.cmv[2]).toMatchObject({ status: 'dentro', precoCentavos: 1500 });
  });

  it('N.3: chamada sem a pergunta de oferta (ofertas ausente) não mexe no que está gravado', async () => {
    await a.produtoCanal.updateMany({ where: { canal: 'LOJA' }, data: { ativo: false } });
    const t = await tela();
    expect(await salvarPrecos(a, ids.ficha, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '11,50', DELIVERY_PROPRIO: '12,50', IFOOD: '15,00' } }, 'Marina')).toMatchObject({ ok: true });
    expect(await a.produtoCanal.findFirst({ where: { canal: 'LOJA' }, select: { precoManualCentavos: true, ativo: true } })).toEqual({ precoManualCentavos: 1150, ativo: false });
    await a.produtoCanal.updateMany({ where: { canal: 'LOJA' }, data: { ativo: true, precoManualCentavos: 1100 } });
  });

  it('operador: nem CMV, nem preço, nem custo no payload da ficha e da lista (o servidor nem lê)', async () => {
    atual.ctx = ctxDe('OPERADOR', 'Caio');
    const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const ficha = (await ErpFichaPage({ params: { id: ids.ficha }, searchParams: {} })) as { props: { canais: unknown } };
    expect(ficha.props.canais).toBeNull();
    // A tela da lista recebe `cmv` (um Map) só de quem vê preços; ao operador, nada sai do servidor.
    type El = { props: { children: El[] | El; cmv?: Map<string, unknown> } };
    const telaDaLista = (pagina: unknown) => ([] as El[]).concat((pagina as El).props.children).find((c) => c && 'cmv' in c.props)!;
    const doOperador = telaDaLista(await ErpFichasPage({ searchParams: {} }));
    expect(doOperador.props.cmv).toBeUndefined();
    expect(json(doOperador)).toMatch(/Prato de teste/);
    expect(json(doOperador)).not.toMatch(/cmvBp|metaBp|precoCentavos|"fisico"/);
    atual.ctx = ctxDe('DONO', 'Marina');
    const daDona = telaDaLista(await ErpFichasPage({ searchParams: {} }));
    expect(daDona.props.cmv).toBeInstanceOf(Map);
    expect(daDona.props.cmv!.has(ids.ficha)).toBe(true);
  });

  it('F4: filtro da lista pelo status do CMV num canal — conta no servidor sobre o conjunto todo; quem não vê preços não filtra', async () => {
    const mapa = await cmvDaLista(a, (await listarFichas(a, {})).linhas);
    const doPrato = mapa.get(ids.ficha)!;
    for (const c of doPrato) {
      const com = await listarFichas(a, { cmv: { canal: c.canal, status: c.status } }, { verPrecos: true });
      expect(com.linhas.map((l) => l.id)).toContain(ids.ficha);
      expect(com.linhas.every((l) => l.tipo === 'PRATO')).toBe(true);
      const outro = c.status === 'acima' ? 'dentro' : 'acima';
      expect((await listarFichas(a, { cmv: { canal: c.canal, status: outro } }, { verPrecos: true })).linhas.map((l) => l.id)).not.toContain(ids.ficha);
    }
    // sem `verPrecos`, o filtro é ignorado (a lista volta igual à sem filtro): o status não vaza pela contagem
    const semFiltro = await listarFichas(a, {});
    const ignorado = await listarFichas(a, { cmv: { canal: 'LOJA', status: doPrato[0].status === 'acima' ? 'dentro' : 'acima' } });
    expect(ignorado.total).toBe(semFiltro.total);
    // pela tela do operador: o parâmetro na URL não muda nada
    atual.ctx = ctxDe('OPERADOR', 'Caio');
    type El = { props: { children: El[] | El; total?: number; filtros?: { cmv: unknown } } };
    const telaDaLista = (pagina: unknown) => ([] as El[]).concat((pagina as El).props.children).find((c) => c && 'filtros' in c.props && 'total' in c.props)!;
    const op = telaDaLista(await ErpFichasPage({ searchParams: { cmv: 'LOJA-acima' } }));
    expect(op.props.filtros!.cmv).toBeNull();
    expect(op.props.total).toBe(semFiltro.total);
    atual.ctx = ctxDe('DONO', 'Marina');
  });
});
