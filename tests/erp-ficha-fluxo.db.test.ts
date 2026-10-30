import { PrismaClient } from '@prisma/client';
import { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/erp/fichas/nova', useSearchParams: () => null,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  redirect: (url: string) => { throw Object.assign(new Error(`REDIRECT ${url}`), { url }); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1]) => { if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO'); },
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste, criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal, obterTaxaDoIfood, salvarMetasDeCmv, salvarTaxaDoIfood } from '@/lib/erp/canais';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { formatarFracao } from '@/lib/erp/unidades';
import * as acoes from '@/app/erp/fichas/actions';
import * as acoesN1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import PaginaEmbalagens from '@/app/erp/fichas/[id]/canais/page';
import PaginaEditar from '@/app/erp/fichas/[id]/editar/page';
import { TelaEmbalagensDaFicha } from '@/components/erp/telas/fichas/canais';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (s: string) => s.replace(/\s/g, ' ');
const form = (dados: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(dados)) f.set(k, v);
  return f;
};

describe.skipIf(!URL_TESTE)('Ficha: receita salva → embalagens → preço (Postgres local)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let parceiro: { id: string; slug: string; nome: string };
  let outro: { id: string; slug: string; nome: string };
  let cliente: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const lojas: string[] = [];
  const alcance = (semCustos = false): Alcance => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: semCustos ? ['precos.ver', 'precos.editar'] : [], redeInteira: false, lojaIds: lojas });
  function contexto(semCustos = false, p = parceiro) {
    atual.ctx = () => ({ cliente: doParceiro(p.id, db), parceiro: p, alcance: alcance(semCustos), sessao: { userId: 'teste', autorNome: 'Teste' }, bloqueio: null, pessoa: { setores: [] } });
  }
  const receita = (nome: string, mais: Record<string, string> = {}) => form({ nome, tipo: 'PRATO', rendimento: '10', item_insumo: ids.receita, item_quantidade: '1', item_unidade: 'un', continuar: 'embalagens', ...mais });
  async function cadastrar(nome: string, mais: Record<string, string> = {}) {
    await expect(acoes.acaoCadastrarFicha(null, receita(nome, mais))).rejects.toThrow(/REDIRECT/);
    return (await cliente.fichaTecnica.findFirstOrThrow({ where: { nome } })).id;
  }
  const canais = async (id: string) => (await custoPorCanal(cliente, (await obterFicha(cliente, id))!))!;
  const embalagens = (impressao: string, quantidadeIfood = '1') => {
    const f = form({ impressao, continuar: 'precos' });
    for (const [canal, insumo, quantidade] of [['DELIVERY_PROPRIO', ids.caixa, '1'], ['IFOOD', ids.sacola, quantidadeIfood]]) {
      f.append('emb_canal', canal); f.append('emb_insumo', insumo); f.append('emb_quantidade', quantidade); f.append('emb_unidade', 'un');
    }
    return f;
  };

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco de teste precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    const sufixo = crypto.randomUUID().slice(0, 8);
    parceiro = await db.parceiroFlow.create({ data: { nome: 'Jornada ficha', slug: `jornada-ficha-${sufixo}`, status: 'ATIVO' } });
    outro = await db.parceiroFlow.create({ data: { nome: 'Outro parceiro', slug: `outro-ficha-${sufixo}`, status: 'ATIVO' } });
    cliente = doParceiro(parceiro.id, db);
    for (const nome of ['Loja A de teste', 'Loja B de teste']) {
      const r = await cadastrarLoja(cliente, { nome }, 'Teste');
      if (!r.ok) throw new Error(JSON.stringify(r));
      lojas.push(r.id);
    }
    for (const [chave, tipo, preco] of [['receita', 'INGREDIENTE', '100,00'], ['caixa', 'EMBALAGEM', '2,00'], ['sacola', 'EMBALAGEM', '3,00'], ['sem-custo', 'INGREDIENTE', ''], ['sacola-sem-custo', 'EMBALAGEM', '']]) {
      const r = await cadastrarInsumoDeTeste(cliente, { nome: chave, tipo, unidade: 'UN', escala: 'base', conteudo: '1', preco, ...(preco === '' ? { semPreco: 'on' } : {}) });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    contexto();
  });
  afterAll(async () => {
    if (db && parceiro && outro) await limparParceiros(db, perfil, [parceiro.id, outro.id]);
    await db?.$disconnect();
  });

  it('grava, reabre e edita cada etapa; recalcula rendimento, preserva preços, histórico fechado e estoque', async () => {
    contexto();
    await expect(acoes.acaoCadastrarFicha(null, receita('Prato da jornada'))).rejects.toMatchObject({ url: expect.stringMatching(/\/canais\?feito=criada$/) });
    const id = (await cliente.fichaTecnica.findFirstOrThrow({ where: { nome: 'Prato da jornada' } })).id;
    const pagina = await PaginaEmbalagens({ params: { id }, searchParams: { feito: 'criada' } });
    expect(renderToStaticMarkup(pagina)).toContain('Ficha cadastrada.');
    expect(sp(formatarFracao((await obterFicha(cliente, id))!.custo.porRendimento))).toBe('R$ 10,00');
    await expect(acoes.acaoSalvarEmbalagens(id, null, embalagens(''))).rejects.toMatchObject({ url: `/erp/fichas/${id}?feito=embalagens&etapa=precos#preco-por-canal` });
    let c = await canais(id);
    expect(c.cmv.map(x => sp(formatarFracao(x.fisico.valor)))).toEqual(['R$ 10,00', 'R$ 12,00', 'R$ 13,00']);
    expect(c.cmv[2].resultado).toMatchObject({ tipo: 'pendente', motivo: expect.stringContaining('taxa') });
    await expect(acoes.acaoSalvarEmbalagens(id, null, embalagens(c.impressao))).rejects.toMatchObject({ url: `/erp/fichas/${id}?feito=igual&etapa=precos#preco-por-canal` });
    expect(await acoes.acaoSalvarEmbalagens(id, null, embalagens(''))).toMatchObject({ ok: false, conflito: true });
    expect(await salvarTaxaDoIfood(cliente, { versao: '', comissao: '0', pagamento: '0' })).toMatchObject({ ok: true });
    const cfg = await obterTaxaDoIfood(cliente);
    expect(await salvarMetasDeCmv(cliente, { versao: cfg.versaoDasMetas, metas: { LOJA: '25', DELIVERY_PROPRIO: '25', IFOOD: '25' } })).toMatchObject({ ok: true });
    c = await canais(id);
    const preco = form({ impressao: c.impressaoDosPrecos, custos: c.impressaoDosCustos, preco_LOJA: '30', preco_DELIVERY_PROPRIO: '40', preco_IFOOD: '50' });
    await expect(acoes.acaoSalvarPrecos(id, null, preco)).rejects.toThrow(/REDIRECT/);
    c = await canais(id);
    expect(c.cmv.map(x => x.precoCentavos)).toEqual([3000, 4000, 5000]);
    expect(c.cmv.map(x => x.sugerido.tipo === 'ok' && x.sugerido.centavos)).toEqual([4000, 4800, 5200]);
    expect(c.cmv[2].resultado).toMatchObject({ tipo: 'ok', taxa: { num: 0n } });
    const historico = await cliente.historicoAlteracao.findMany({ where: { entidadeId: id }, orderBy: { id: 'asc' } });
    await cliente.transacao(async tx => { await criarPeriodoFechadoDeTeste(tx, { nome: 'Fotografia preservada', inicio: '2026-09-01', fim: '2026-09-30' }); });
    const fotografias = await cliente.dreFotografia.findMany();
    const f = (await obterFicha(cliente, id))!;
    await expect(acoes.acaoEditarFicha(id, null, receita(f.nome, { versao: f.versao, rendimento: '20' }))).rejects.toMatchObject({ url: `/erp/fichas/${id}/canais?feito=editada` });
    await expect(acoes.acaoSalvarEmbalagens(id, null, embalagens(c.impressao, '2'))).rejects.toThrow(/#preco-por-canal/);
    c = await canais(id);
    expect(c.cmv.map(x => sp(formatarFracao(x.fisico.valor)))).toEqual(['R$ 5,00', 'R$ 7,00', 'R$ 11,00']);
    expect(c.cmv.map(x => x.precoCentavos)).toEqual([3000, 4000, 5000]);
    expect(await cliente.movimentoEstoque.count()).toBe(0);
    expect(await cliente.dreFotografia.findMany()).toEqual(fotografias);
    expect(await cliente.historicoAlteracao.findMany({ where: { id: { in: historico.map(h => h.id) } }, orderBy: { id: 'asc' } })).toEqual(historico);
  });

  it('custo parcial e embalagem sem custo não aparecem como total completo; ausência de embalagem é distinta', async () => {
    contexto();
    const id = await cadastrar('Receita incompleta', { item_insumo: ids['sem-custo'] });
    const pagina = await PaginaEmbalagens({ params: { id } });
    const h = sp(renderToStaticMarkup(pagina));
    expect(h).toContain('Nenhuma embalagem neste canal.');
    expect(h).toContain('Custo da receita incompleto: falta o custo de sem-custo.');
    expect(h).toContain('Custo físico parcial conhecido: —');
    expect(h).not.toContain('Custo físico da receita e embalagens: R$ 0,00');
    const envio = form({ impressao: '', emb_canal: 'IFOOD', emb_insumo: ids['sacola-sem-custo'], emb_quantidade: '1', emb_unidade: 'un' });
    await expect(acoes.acaoSalvarEmbalagens(id, null, envio)).rejects.toThrow(/REDIRECT/);
    const reaberta = sp(renderToStaticMarkup(await PaginaEmbalagens({ params: { id } })));
    expect(reaberta).toContain('Falta informar o custo de 1 embalagem.');
    expect(reaberta).toContain('Embalagens incompletas');
  });

  it('pedido de continuar não concede custos nem acesso a outro parceiro; perfil com várias lojas mantém receita comum', async () => {
    contexto(true);
    await expect(acoes.acaoCadastrarFicha(null, receita('Operação sem custos'))).rejects.toMatchObject({ url: expect.stringMatching(/\/[^/]+\?feito=criada$/) });
    const id = (await cliente.fichaTecnica.findFirstOrThrow({ where: { nome: 'Operação sem custos' } })).id;
    const pagina = await PaginaEditar({ params: { id } }) as ReactElement<ComponentProps<typeof TelaFormFicha>>;
    expect(pagina.props.verCustos).toBe(false);
    expect(pagina.props.opcoes.every(o => o.custo === null)).toBe(true);
    expect(renderToStaticMarkup(createElement(TelaFormFicha, pagina.props))).not.toContain('Salvar e continuar para embalagens');
    await expect(PaginaEmbalagens({ params: { id } })).rejects.toThrow('SEM_ACESSO');
    expect(await acoes.acaoSalvarEmbalagens(id, null, embalagens(''))).toMatchObject({ ok: false });
    contexto(false, outro);
    await expect(PaginaEmbalagens({ params: { id } })).rejects.toThrow('NOT_FOUND');
    expect(await acoes.acaoSalvarEmbalagens(id, null, embalagens(''))).toMatchObject({ ok: false });
    contexto();
    const reaberta = await PaginaEmbalagens({ params: { id } }) as ReactElement<ComponentProps<typeof TelaEmbalagensDaFicha>>;
    expect(reaberta.props.ficha.id).toBe(id);
    expect(reaberta.props.podeConferirPrecos).toBe(true);
  });

  it('pré-preparo e salvar padrão mantêm o detalhe; nível 1 usa o mesmo fluxo sem aceitar endereço arbitrário', async () => {
    contexto();
    const id = await cadastrar('Pré-preparo da jornada', { tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'un' });
    const f = (await obterFicha(cliente, id))!;
    await expect(acoes.acaoEditarFicha(id, null, receita(f.nome, { tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'un', versao: f.versao }))).rejects.toMatchObject({ url: `/erp/fichas/${id}?feito=igual` });
    await expect(acoes.acaoCadastrarFicha(null, receita('Salvar padrão', { continuar: 'https://exemplo.invalid/' }))).rejects.toMatchObject({ url: expect.stringMatching(/\/[^/]+\?feito=criada$/) });
    await expect(acoesN1.acaoCadastrarFicha(parceiro.slug, null, receita('Fluxo nível 1'))).rejects.toMatchObject({ url: expect.stringMatching(new RegExp(`^/rodolfo/erp/${parceiro.slug}/fichas/[^/]+/canais\\?feito=criada$`)) });
  });
});
