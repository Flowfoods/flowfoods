import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ contexto: null as null | (() => unknown), slug: '', leituras: 0, auditoria: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Object.assign(new Error('REDIRECT'), { url }); } }));
vi.mock('@/lib/erp/contexto', async () => ({ ...(await import('@/lib/erp/permissoes')),
  exigirParceiroDaSessao: async () => { atual.leituras++; return atual.contexto!(); },
  exigirParceiro: async (slug: string) => { atual.leituras++; if (slug !== atual.slug) throw new Error('NOT_FOUND'); return atual.contexto!(); },
}));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: atual.auditoria } } }));

import * as erp from '@/app/erp/fichas/actions';
import * as n1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import { acaoCadastrarInsumo } from '@/app/erp/insumos/actions';
import { obterFichaParaImpressao } from '@/lib/erp/ficha-impressao';
import { lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { resolverAlcance, type Permissao } from '@/lib/erp/permissoes';
import { doParceiro } from '@/lib/erp/tenant';
import { catalogo3c, retrato3c, type Catalogo3c } from './erp-ficha-3c-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import type { EstadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';

const URL_TESTE = process.env.ERP_DB_TESTE;
const completo: Permissao[] = ['fichas.ver', 'fichas.editar', 'precos.ver'];
function form(c: Catalogo3c, materiais = true) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ nome: 'Prato da action', tipo: 'PRATO', rendimento: '10', item_insumo: c.ids.ingrediente, item_quantidade: '10', item_unidade: 'un', item_fator: '1', chaveEnvio: crypto.randomUUID(), continuar: 'precos', de: 'cmv=IFOOD-acima&cmv=LOJA-acima&faixaCmv=LOJA-critico&secao=secaoabc&q=Prato' })) f.set(k, v);
  if (materiais) for (const [k, v] of Object.entries({ materiaisNoFormulario: 'sim', versaoMateriais: '', emb_canal: 'IFOOD', emb_insumo: c.ids.sacola, emb_quantidade: '1', emb_unidade: 'un' })) f.set(k, v);
  return f;
}
const novo = (r: EstadoFichaUnificada) => { if (!r?.ok || r.repetido) throw new Error(JSON.stringify(r)); return r; };

describe.skipIf(!URL_TESTE)('3C · actions reais, permissões parciais e confirmação própria', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [], consultas: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório.');
    const cliente = new PrismaClient({ datasources: { db: { url: URL_TESTE } }, log: [{ emit: 'event', level: 'query' }] });
    cliente.$on('query', e => consultas.push(e.query)); db = cliente; perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  function acesso(c: Catalogo3c, permissoes = completo, bloqueio: string | null = null) {
    atual.slug = c.parceiro.slug; atual.contexto = () => ({ parceiro: c.parceiro, cliente: bloqueio ? doParceiro(c.parceiro.id, db, { somenteLeitura: true }) : c.a,
      alcance: resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }), bloqueio,
      sessao: { userId: 'pessoa-da-sessao', autorNome: 'Pessoa sintética' }, pessoa: { setores: [] } });
  }
  for (const rota of ['ERP', 'N1'] as const) {
    const criar = (c: Catalogo3c, f: FormData, anterior: EstadoFichaUnificada = null) => rota === 'ERP' ? erp.acaoCadastrarFichaUnificada(anterior, f) : n1.acaoCadastrarFichaUnificada(c.parceiro.slug, anterior, f);
    const editar = (c: Catalogo3c, id: string, f: FormData, anterior: EstadoFichaUnificada = null) => rota === 'ERP' ? erp.acaoEditarFichaUnificada(id, anterior, f) : n1.acaoEditarFichaUnificada(c.parceiro.slug, id, anterior, f);
    const imprimir = (c: Catalogo3c, id: string, versao: string, financeiro = false) => rota === 'ERP'
      ? financeiro ? erp.acaoImpressaoFinanceira(id, versao) : erp.acaoImpressaoOperacional(id, versao)
      : financeiro ? n1.acaoImpressaoFinanceira(c.parceiro.slug, id, versao) : n1.acaoImpressaoOperacional(c.parceiro.slug, id, versao);

    it(`${rota}: confirma ficha+materiais sem editar preço/catálogo; ACK próprio, reenvio e segundo save preservam retorno`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c); atual.auditoria.mockClear();
      const f = form(c); f.set('parceiroId', 'forjado'); f.set('userId', 'forjado');
      const r = novo(await criar(c, f)); expect(r.vez).toBe(1); expect(r.versaoMateriais).toBeTruthy();
      const destino = new URL(r.destino, 'http://localhost'); expect(destino.pathname).toBe(`${rota === 'ERP' ? '/erp' : `/rodolfo/erp/${c.parceiro.slug}`}/fichas/${r.id}`);
      expect(destino.searchParams.get('etapa')).toBe('precos'); expect(destino.hash).toBe('#preco-por-canal');
      const retorno = new URLSearchParams(destino.searchParams.get('de')!); expect(retorno.getAll('cmv').sort()).toEqual(['IFOOD-acima', 'LOJA-acima']); expect(retorno.get('secao')).toBe('secaoabc');
      const salvo = await retrato3c(c.a); expect(salvo.materiais).toHaveLength(1); expect(salvo.precos).toEqual([]);
      const replay = await criar(c, f, r); expect(replay).toMatchObject({ ok: true, repetido: true, vez: 2, id: r.id });
      expect(replay).not.toHaveProperty('versao'); expect(replay).not.toHaveProperty('versaoMateriais'); expect(await retrato3c(c.a)).toEqual(salvo);
      expect(atual.auditoria).toHaveBeenCalledTimes(rota === 'N1' ? 1 : 0);
      f.set('versao', r.versao); f.set('versaoMateriais', r.versaoMateriais!); f.set('descricao', 'Segunda gravação'); f.set('emb_quantidade', '2');
      const segundo = novo(await editar(c, r.id, f, r)); expect(segundo.versao).not.toBe(r.versao); expect(segundo.vez).toBe(2);
      const antesConflito = await retrato3c(c.a);
      const velho = await editar(c, r.id, f, segundo); expect(velho).toMatchObject({ ok: false, conflito: true, vez: 3 }); expect(velho).not.toHaveProperty('versao');
      expect(await retrato3c(c.a)).toEqual(antesConflito);
    });

    it(`${rota}: revogação ou suspensão após abrir o formulário recusa antes de ler o corpo ou consultar o banco`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c); const f = form(c), antes = await retrato3c(c.a), leituras = atual.leituras;
      const get = vi.spyOn(f, 'get').mockImplementation(() => { throw new Error('Corpo não deveria ser lido'); });
      for (const [permissoes, bloqueio] of [[['fichas.ver', 'precos.ver'], null], [completo, 'Parceiro suspenso']] as [Permissao[], string | null][]) {
        acesso(c, permissoes, bloqueio); consultas.length = 0;
        expect(await criar(c, f)).toMatchObject({ ok: false }); expect(await editar(c, 'idforjado', f)).toMatchObject({ ok: false }); expect(consultas).toEqual([]);
      }
      expect(get).not.toHaveBeenCalled(); expect(atual.leituras).toBe(leituras + 4); expect(await retrato3c(c.a)).toEqual(antes);
    });

    it(`${rota}: sem precos.ver pode editar receita omitindo materiais, mas qualquer marcador forjado é recusado`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c); const r = novo(await criar(c, form(c))), antes = await retrato3c(c.a);
      acesso(c, ['fichas.editar', 'fichas.ver']);
      const f = form(c, false); f.set('versao', r.versao); f.set('descricao', 'Apenas receita');
      const salvo = novo(await editar(c, r.id, f)); expect(salvo.versaoMateriais).toBeNull(); expect(salvo.destino).not.toContain('etapa=precos');
      expect((await retrato3c(c.a)).materiais).toEqual(antes.materiais);
      const retorno = new URLSearchParams(new URL(salvo.destino, 'http://localhost').searchParams.get('de')!); expect(retorno.has('cmv')).toBe(false); expect(retorno.has('faixaCmv')).toBe(false); expect(retorno.get('secao')).toBe('secaoabc');
      for (const marcador of ['sim', 'nao', '']) { f.set('materiaisNoFormulario', marcador); consultas.length = 0; expect(await editar(c, r.id, f)).toMatchObject({ ok: false }); expect(consultas).toEqual([]); }
    });

    it(`${rota}: editor sem fichas.ver recebe destino autorizado; replay não afirma versão ou ficha ainda ativa`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c, ['fichas.editar']); const f = form(c, false);
      const r = novo(await criar(c, f)); expect(r.destino).toContain(`/fichas/${r.id}/editar?`); expect(r.destino).not.toContain('etapa=precos');
      const replay = await criar(c, f); expect(replay).toMatchObject({ ok: true, repetido: true, destino: rota === 'ERP' ? '/erp' : `/rodolfo/erp/${c.parceiro.slug}` }); expect(replay).not.toHaveProperty('versao');
    });

    it(`${rota}: action legada de materiais volta à edição em sucesso e no-op sem conceder fichas.ver`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c); const r = novo(await criar(c, form(c)));
      acesso(c, ['fichas.editar', 'precos.ver']);
      for (const igual of [false, true]) {
        const leitura = (await lerEdicaoDaFicha(c.a, r.id, { verPrecos: true }))!, antes = await retrato3c(c.a), f = new FormData();
        for (const [k, v] of Object.entries({ impressao: leitura.materiais!.versao, emb_canal: 'IFOOD', emb_insumo: c.ids.sacola, emb_quantidade: '2', emb_unidade: 'un', continuar: 'precos', de: 'secao=secaoabc&cmv=IFOOD-acima&q=Prato' })) f.set(k, v);
        let redirecionamento = '';
        const acao = rota === 'ERP' ? erp.acaoSalvarEmbalagens(r.id, null, f) : n1.acaoSalvarEmbalagens(c.parceiro.slug, r.id, null, f);
        await acao.catch(e => { expect(e).toMatchObject({ url: expect.any(String) }); redirecionamento = e.url; });
        const url = new URL(redirecionamento, 'http://localhost');
        expect(url.pathname).toBe(`${rota === 'ERP' ? '/erp' : `/rodolfo/erp/${c.parceiro.slug}`}/fichas/${r.id}/editar`);
        const de = new URLSearchParams(url.searchParams.get('de')!); expect(de.get('secao')).toBe('secaoabc'); expect(de.get('cmv')).toBe('IFOOD-acima');
        expect(url.searchParams.has('etapa')).toBe(false); expect(url.hash).toBe('');
        const depois = await retrato3c(c.a); expect(depois.materiais[0].quantidadeMilesimos).toBe(2000); if (igual) expect(depois).toEqual(antes);
        const papel = (await obterFichaParaImpressao(c.a, r.id))!; expect(await imprimir(c, r.id, papel.versaoOperacional)).toMatchObject({ ok: false });
      }
    });

    it(`${rota}: impressão operacional e financeira revalidam permissões; suspensão só bloqueia escrita`, async () => {
      const c = await catalogo3c(db, parceiros); acesso(c); const r = novo(await criar(c, form(c))), p = (await obterFichaParaImpressao(c.a, r.id))!;
      acesso(c, ['fichas.ver']); consultas.length = 0;
      expect(await imprimir(c, r.id, p.versaoOperacional, true)).toMatchObject({ ok: false }); expect(consultas).toEqual([]);
      const op = await imprimir(c, r.id, p.versaoOperacional); expect(op).toMatchObject({ ok: true, ficha: { custo: null, verCustos: false, materiais: p.materiais } }); expect(op).not.toHaveProperty('canais');
      acesso(c, ['precos.ver']); consultas.length = 0;
      expect(await imprimir(c, r.id, p.versaoOperacional)).toMatchObject({ ok: false }); expect(await imprimir(c, r.id, p.versaoOperacional, true)).toMatchObject({ ok: false }); expect(consultas).toEqual([]);
      acesso(c, ['fichas.ver', 'precos.ver'], 'Parceiro suspenso'); expect(await imprimir(c, r.id, p.versaoOperacional, true)).toMatchObject({ ok: true });
    });
  }

  it('criar embalagem no catálogo requer insumos.editar e não associa automaticamente à ficha', async () => {
    const c = await catalogo3c(db, parceiros); acesso(c);
    const categoria = (await c.a.insumo.findUniqueOrThrow({ where: { id: c.ids.caixa } })).categoriaId!;
    const f = new FormData(); for (const [k, v] of Object.entries({ nome: 'Pote cadastrado à parte', tipo: 'EMBALAGEM', categoriaId: categoria, conservacao: 'SECO', unidade: 'UN', escala: 'base', conteudo: '1', preco: '4', volta: '/erp/fichas/nova' })) f.set(k, v);
    expect(await acaoCadastrarInsumo(null, f)).toMatchObject({ erros: { geral: expect.any(String) } });
    expect(await c.a.insumo.count({ where: { nome: 'Pote cadastrado à parte' } })).toBe(0);
    acesso(c, ['insumos.editar', 'insumos.ver']); await expect(acaoCadastrarInsumo(null, f)).rejects.toThrow('REDIRECT');
    const cadastrado = await c.a.insumo.findFirstOrThrow({ where: { nome: 'Pote cadastrado à parte' } }); expect(await c.a.produtoEmbalagem.count()).toBe(0); expect(await c.a.fichaTecnica.count()).toBe(0);
    acesso(c); const receita = form(c); receita.set('emb_insumo', cadastrado.id); expect(await erp.acaoCadastrarFichaUnificada(null, receita)).toMatchObject({ ok: true });
    expect((await c.a.produtoEmbalagem.findFirstOrThrow()).insumoId).toBe(cadastrado.id);
  });
});
