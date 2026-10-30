/** Meta independente da taxa: serviços reais, fixtures locais e gates de ambas as superfícies. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Object.assign(new Error(`REDIRECT ${url}`), { url }); } }));
vi.mock('@/lib/erp/contexto', async () => {
  const permissoes = await import('@/lib/erp/permissoes');
  return { ...permissoes, exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), exigirPermissaoNaPagina: permissoes.exigirPermissao };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste, criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { cadastrarFicha, obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal, obterTaxaDoIfood, salvarMetasDeCmv, salvarPrecos, salvarTaxaDoIfood } from '@/lib/erp/canais';
import { resolverAlcance } from '@/lib/erp/permissoes';
import * as acoes from '@/app/erp/fichas/actions';
import * as acoesN1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import Pagina from '@/app/erp/fichas/canais/page';

const URL_TESTE = process.env.ERP_DB_TESTE;
describe.skipIf(!URL_TESTE)('Meta iFood antes da taxa (Postgres local)', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  async function novo() {
    const p = await db.parceiroFlow.create({ data: { nome: 'Meta independente teste', slug: `meta-indep-${crypto.randomUUID()}`, status: 'ATIVO' } });
    parceiros.push(p.id);
    return { p, a: doParceiro(p.id, db) };
  }
  const configurarMeta = async (a: ClienteDoParceiro, meta: string) => salvarMetasDeCmv(a, { versao: (await obterTaxaDoIfood(a)).versaoDasMetas, metas: { IFOOD: meta } }, 'Teste');
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco de teste precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
  });
  afterAll(async () => {
    if (db && parceiros.length) await limparParceiros(db, perfil, parceiros);
    await db?.$disconnect();
  });

  it('meta → taxa zero explícita → taxa positiva preserva preço manual, fotografia e histórico anteriores', async () => {
    const { a } = await novo();
    const insumo = await cadastrarInsumoDeTeste(a, { nome: 'Receita QA', tipo: 'INGREDIENTE', unidade: 'UN', escala: 'base', conteudo: '1', preco: '3,00' });
    if (!insumo.ok) throw new Error(JSON.stringify(insumo));
    const ficha = await cadastrarFicha(a, { nome: 'Prato QA', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: insumo.id, quantidade: '1', unidade: 'un' }] }, { tipo: 'manter' }, 'Teste');
    if (!ficha.ok) throw new Error(JSON.stringify(ficha));
    const conta = async () => (await custoPorCanal(a, (await obterFicha(a, ficha.id))!))!;
    const inicial = await conta();
    expect(await salvarPrecos(a, ficha.id, { impressao: inicial.impressaoDosPrecos, custos: inicial.impressaoDosCustos, precos: { IFOOD: '15' } })).toMatchObject({ ok: true });
    await a.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'Fechado preservado', inicio: '2026-01-01', fim: '2026-01-31' }));
    const fotografia = await a.dreFotografia.findMany({ orderBy: { id: 'asc' } });
    const historico = await a.historicoAlteracao.findMany({ orderBy: { id: 'asc' } });
    const preco = await a.produtoCanal.findMany({ orderBy: { id: 'asc' } });

    expect(await configurarMeta(a, '30')).toMatchObject({ ok: true, mudou: ['IFOOD'] });
    const soMeta = await obterTaxaDoIfood(a);
    expect(soMeta).toMatchObject({ taxa: null, metas: { IFOOD: 3000 } });
    expect(soMeta.versao).not.toBe('');
    expect((await conta()).cmv[2]).toMatchObject({ sugerido: { tipo: 'ok', centavos: 1000 }, precoCentavos: 1500, status: 'dentro', resultado: { tipo: 'pendente', motivo: 'taxa do iFood não configurada' } });
    expect(await salvarTaxaDoIfood(a, { versao: '', comissao: '0', pagamento: '0' })).toMatchObject({ ok: false, conflito: true });
    const antesDoZero = await a.historicoAlteracao.count();
    expect(await salvarTaxaDoIfood(a, { versao: soMeta.versao, comissao: '0', pagamento: '0' }, 'Zero explícito')).toMatchObject({ ok: true, mudou: ['comissao', 'pagamento'] });
    expect(await a.historicoAlteracao.count()).toBe(antesDoZero + 1);
    const h = await a.historicoAlteracao.findFirstOrThrow({ where: { autorNome: 'Zero explícito' } });
    expect(h.antes).toMatchObject({ comissao: 'não configurada', pagamento: 'não configurado' });
    expect(h.depois).toMatchObject({ comissao: '0%', pagamento: '0%' });
    const zero = await obterTaxaDoIfood(a);
    expect(zero.taxa).toEqual({ comissaoBp: 0, pagamentoBp: 0 });
    expect((await conta()).cmv[2].resultado).toMatchObject({ tipo: 'ok', valor: { num: 1200n, den: 1n } });
    expect(await salvarTaxaDoIfood(a, { versao: zero.versao, comissao: '0', pagamento: '0' })).toMatchObject({ ok: true, mudou: [] });
    expect(await a.historicoAlteracao.count()).toBe(antesDoZero + 1);
    expect(await salvarTaxaDoIfood(a, { versao: zero.versao, comissao: '20', pagamento: '' })).toMatchObject({ ok: true });
    const comTaxa = (await conta()).cmv[2];
    expect(comTaxa.sugerido).toMatchObject({ tipo: 'ok', centavos: 1000 });
    if (comTaxa.resultado.tipo !== 'ok') throw new Error('Resultado deveria fechar');
    expect(comTaxa.resultado.valor.num).toBe(900n * comTaxa.resultado.valor.den);
    expect(await configurarMeta(a, '')).toMatchObject({ ok: true });
    expect((await obterTaxaDoIfood(a)).taxa).toEqual({ comissaoBp: 2000, pagamentoBp: 0 });
    expect(await a.produtoCanal.findMany({ orderBy: { id: 'asc' } })).toEqual(preco);
    expect(await a.dreFotografia.findMany({ orderBy: { id: 'asc' } })).toEqual(fotografia);
    expect(await a.historicoAlteracao.findMany({ where: { id: { in: historico.map(h => h.id) } }, orderBy: { id: 'asc' } })).toEqual(historico);
    expect(await a.movimentoEstoque.count()).toBe(0);
  });

  it('primeira meta e primeira taxa em corrida não sobrescrevem; versão compartilhada protege atualizações', async () => {
    const { a } = await novo();
    const inicial = await obterTaxaDoIfood(a);
    const pedidos = await Promise.all([
      salvarMetasDeCmv(a, { versao: inicial.versaoDasMetas, metas: { IFOOD: '30' } }, 'Meta'),
      salvarTaxaDoIfood(a, { versao: inicial.versao, comissao: '0', pagamento: '' }, 'Taxa'),
    ]);
    expect(pedidos.filter(r => r.ok)).toHaveLength(1);
    expect(pedidos.find(r => !r.ok)).toMatchObject({ conflito: true });
    expect(await a.canalConfig.count()).toBe(1);
    const primeiro = await obterTaxaDoIfood(a);
    if (!pedidos[0].ok) expect(await configurarMeta(a, '30')).toMatchObject({ ok: true });
    else expect(await salvarTaxaDoIfood(a, { versao: primeiro.versao, comissao: '0', pagamento: '' })).toMatchObject({ ok: true });
    const atual = await obterTaxaDoIfood(a);
    expect(atual).toMatchObject({ metas: { IFOOD: 3000 }, taxa: { comissaoBp: 0, pagamentoBp: 0 } });
    const concorrentes = await Promise.all([
      salvarMetasDeCmv(a, { versao: atual.versaoDasMetas, metas: { IFOOD: '35' } }),
      salvarTaxaDoIfood(a, { versao: atual.versao, comissao: '20', pagamento: '' }),
    ]);
    expect(concorrentes.filter(r => r.ok)).toHaveLength(1);
    expect(concorrentes.find(r => !r.ok)).toMatchObject({ conflito: true });
  });

  it('gates do parceiro e nível 1 e isolamento não mudam ao configurar só a meta', async () => {
    const { p, a } = await novo(), { p: outro, a: b } = await novo();
    const contexto = (permissoesRemovidas: string[], parceiro = p, cliente = a) => {
      atual.ctx = () => ({ cliente, parceiro, alcance: resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas, redeInteira: true, lojaIds: [] }), sessao: { userId: 'teste', autorNome: 'Teste' }, bloqueio: null });
    };
    const envio = async (cliente = a) => {
      const f = new FormData(); f.set('versao', (await obterTaxaDoIfood(cliente)).versaoDasMetas); f.set('metaCmv_IFOOD', '30'); return f;
    };
    for (const removidas of [['precos.editar'], ['precos.ver']]) {
      contexto(removidas);
      expect(await acoes.acaoSalvarMetasDeCmv(null, await envio())).toMatchObject({ ok: false });
      expect(await acoesN1.acaoSalvarMetasDeCmv(p.slug, null, await envio())).toMatchObject({ ok: false });
    }
    await expect(Pagina({ searchParams: {} })).rejects.toThrow();
    expect(await a.canalConfig.count()).toBe(0);
    contexto([]);
    await expect(acoes.acaoSalvarMetasDeCmv(null, await envio())).rejects.toMatchObject({ url: '/erp/fichas/canais?feito=metas' });
    contexto([], outro, b);
    await expect(acoesN1.acaoSalvarMetasDeCmv(outro.slug, null, await envio(b))).rejects.toMatchObject({ url: `/rodolfo/erp/${outro.slug}/fichas/canais?feito=metas` });
    expect(await b.canalConfig.findFirst({ where: { id: (await a.canalConfig.findFirstOrThrow()).id } })).toBeNull();
    expect((await obterTaxaDoIfood(a)).taxa).toBeNull();
    expect((await obterTaxaDoIfood(b)).taxa).toBeNull();
  });

  it('defaults preservam a semântica anterior e o CHECK recusa estados pendentes incoerentes', async () => {
    const { a } = await novo(), { a: b } = await novo();
    const anterior = await a.canalConfig.create({ data: { parceiroId: a.parceiroId, canal: 'IFOOD' } });
    expect(anterior).toMatchObject({ taxaConfigurada: true, taxaBp: 0, taxaPagamentoBp: 0 });
    expect((await obterTaxaDoIfood(a)).taxa).toEqual({ comissaoBp: 0, pagamentoBp: 0 });
    await expect(b.canalConfig.create({ data: { parceiroId: b.parceiroId, canal: 'IFOOD', taxaConfigurada: false, taxaBp: 1200 } })).rejects.toThrow();
    await expect(b.canalConfig.create({ data: { parceiroId: b.parceiroId, canal: 'LOJA', taxaConfigurada: false } })).rejects.toThrow();
    expect(await configurarMeta(b, '30')).toMatchObject({ ok: true });
    expect(await configurarMeta(b, '')).toMatchObject({ ok: true });
    expect((await obterTaxaDoIfood(b)).taxa).toBeNull();
    expect(await b.canalConfig.count()).toBe(1);
  });
});
