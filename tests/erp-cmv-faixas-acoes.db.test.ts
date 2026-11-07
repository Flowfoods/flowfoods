import { PrismaClient } from '@prisma/client';
import { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ contexto: null as null | (() => unknown), slug: '', leituras: 0, auditoria: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/fichas', useSearchParams: () => null, useRouter: () => ({ push: () => {}, refresh: () => {} }), redirect: (url: string) => { throw Object.assign(new Error('REDIRECT'), { url }); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('react-dom', async orig => ({ ...(await orig<typeof import('react-dom')>()), useFormStatus: () => ({ pending: false }) }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useActionState: (_acao: unknown, estado: unknown) => [estado, undefined] }));
vi.mock('@/lib/erp/contexto', async () => {
  const permissoes = await import('@/lib/erp/permissoes');
  return { ...permissoes, exigirParceiroDaSessao: async () => { atual.leituras++; return atual.contexto!(); }, exigirParceiro: async (slug: string) => {
    atual.leituras++; if (slug !== atual.slug) throw new Error('NOT_FOUND'); return atual.contexto!();
  }, exigirPermissaoNaPagina: permissoes.exigirPermissao, visaoDaRequisicao: async () => ({ visao: 'rede' }) };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: atual.auditoria } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Permissao } from '@/lib/erp/permissoes';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { obterFaixasDeCmv, obterTaxaDoIfood } from '@/lib/erp/canais';
import type { EstadoConfiguracao } from '@/lib/erp/canal-config-campos';
import * as erp from '@/app/erp/fichas/actions';
import * as n1 from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import { acaoSalvarFaixasDeCmv, acaoImpressaoFinanceira } from '@/app/erp/fichas/actions';
import { acaoSalvarFaixasDeCmv as salvarN1, acaoImpressaoFinanceira as imprimirN1 } from '@/app/rodolfo/(painel)/erp/[slug]/fichas/actions';
import PaginaImpressao from '@/app/erp/fichas/[id]/imprimir/page';
import { DocumentoDaFicha, TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';
import { cadastrarInsumoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const canais = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const;
const json = (x: unknown) => JSON.stringify(x, (_k, v) => typeof v === 'bigint' ? v.toString() : v);

describe.skipIf(!URL_TESTE)('3B · actions reais, permissão atual e impressão sob pedido', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  async function novo() {
    const parceiro = await db.parceiroFlow.create({ data: { nome: 'Ações sintéticas 3B', slug: `acoes3b-${crypto.randomUUID()}`, status: 'ATIVO' } });
    parceiros.push(parceiro.id); const a = doParceiro(parceiro.id, db);
    const acesso = (removidas: Permissao[] = [], bloqueio: string | null = null) => {
      atual.slug = parceiro.slug; atual.contexto = () => ({ cliente: a, parceiro, alcance: resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: removidas, redeInteira: true, lojaIds: [] }), bloqueio, sessao: { userId: 'sintetico', autorNome: 'Pessoa sintética' }, pessoa: { setores: [] } });
    };
    acesso(); atual.auditoria.mockClear(); return { a, parceiro, acesso };
  }
  async function form(a: ClienteDoParceiro) {
    const f = new FormData(); f.set('versao', (await obterFaixasDeCmv(a)).versao);
    for (const canal of canais) for (const [campo, v] of Object.entries({ a: '20', b: '25', c: '35', d: '40' })) f.set(`farol_${canal}_${campo}`, v);
    return f;
  }

  for (const rota of ['ERP', 'N1'] as const) {
    const salvar = (slug: string, f: FormData) => rota === 'ERP' ? acaoSalvarFaixasDeCmv(null, f) : salvarN1(slug, null, f);
    it(`${rota}: exige ver e editar, reobtém contexto após revogação e recusa bloqueio sem gravar`, async () => {
      const { a, parceiro, acesso } = await novo(); const f = await form(a); const inicio = atual.leituras;
      for (const removidas of [['precos.editar'], ['precos.ver'], ['precos.ver', 'precos.editar']] as Permissao[][]) {
        acesso(removidas); expect(await salvar(parceiro.slug, f)).toMatchObject({ ok: false });
      }
      acesso([], 'Parceiro suspenso para gravação'); expect(await salvar(parceiro.slug, f)).toMatchObject({ ok: false, erros: { geral: 'Parceiro suspenso para gravação' } });
      expect(atual.leituras).toBe(inicio + 4); expect(await a.canalConfig.count()).toBe(0); expect(await a.historicoAlteracao.count()).toBe(0); expect(atual.auditoria).not.toHaveBeenCalled();
    });
    it(`${rota}: envio explícito usa o parceiro da sessão, igual não audita e formulário antigo ausente não retira cortes`, async () => {
      const { a, parceiro } = await novo(); const f = await form(a);
      f.set('parceiroId', 'tenant-forjado'); f.set('slug', 'slug-forjado');
      const salvo = await salvar(parceiro.slug, f);
      expect(salvo).toMatchObject({ ok: true, vez: 1, confirmacao: { versao: (await obterFaixasDeCmv(a)).versao, campos: Object.fromEntries([...f].filter(([k]) => k.startsWith('farol_'))) } });
      const antes = await a.canalConfig.findMany({ orderBy: { canal: 'asc' } }), historico = await a.historicoAlteracao.count();
      expect(antes).toHaveLength(3); expect(antes.every(c => c.parceiroId === parceiro.id)).toBe(true);
      expect(atual.auditoria).toHaveBeenCalledTimes(rota === 'N1' ? 1 : 0);
      if (rota === 'N1') expect(atual.auditoria).toHaveBeenCalledWith({ data: { userId: 'sintetico', evento: 'erp_faixas_cmv', dados: { parceiroId: parceiro.id, canais: 'LOJA,DELIVERY_PROPRIO,IFOOD' } } });
      expect(await salvar(parceiro.slug, await form(a))).toMatchObject({ ok: true, confirmacao: salvo && salvo.ok ? salvo.confirmacao : undefined });
      const antigo = new FormData(); antigo.set('versao', (await obterFaixasDeCmv(a)).versao);
      expect(await salvar(parceiro.slug, antigo)).toMatchObject({ ok: false });
      expect(await a.canalConfig.findMany({ orderBy: { canal: 'asc' } })).toEqual(antes);
      expect(await a.historicoAlteracao.count()).toBe(historico); expect(atual.auditoria).toHaveBeenCalledTimes(rota === 'N1' ? 1 : 0);
    });
  }

  for (const rota of ['ERP', 'N1'] as const) it(`${rota}: confirmação própria permite segundo envio dos quatro formulários; conflito e erro não oferecem nova versão`, async () => {
    const { a, parceiro, acesso } = await novo();
    for (const tipo of ['taxa', 'metas', 'margens', 'faixas'] as const) {
      const cfg = await obterTaxaDoIfood(a);
      const versao = tipo === 'taxa' ? cfg.versao : tipo === 'metas' ? cfg.versaoDasMetas : tipo === 'margens' ? cfg.versaoDasMargens : cfg.versaoDasFaixas;
      const campos: Record<string, string> = tipo === 'taxa' ? { comissao: '17,00', pagamento: '3,20' }
        : tipo === 'metas' ? { metaCmv_LOJA: '25,00', metaCmv_DELIVERY_PROPRIO: '26,00', metaCmv_IFOOD: '27,00' }
          : tipo === 'margens' ? { margem_LOJA: '40,00', margem_DELIVERY_PROPRIO: '41,00', margem_IFOOD: '42,00' }
            : Object.fromEntries([...(await form(a))].filter(([k]) => k.startsWith('farol_')).map(([k, v]) => [k, String(v)]));
      const acao = tipo === 'taxa' ? 'acaoSalvarTaxaDoIfood' : tipo === 'metas' ? 'acaoSalvarMetasDeCmv' : tipo === 'margens' ? 'acaoSalvarMargensAlvo' : 'acaoSalvarFaixasDeCmv';
      const enviar = (estado: EstadoConfiguracao, envio: FormData) => rota === 'ERP' ? erp[acao](estado, envio) : n1[acao](parceiro.slug, estado, envio);
      const montar = (v: string, c: Record<string, string>) => { const f = new FormData(); f.set('versao', v); for (const [k, valor] of Object.entries(c)) f.set(k, valor); return f; };
      acesso(['precos.ver']); expect(await enviar(null, montar(versao, campos))).toMatchObject({ ok: false }); acesso();
      const primeiro = await enviar(null, montar(versao, campos));
      if (!primeiro?.ok) throw new Error(json(primeiro));
      const canonicos = tipo === 'taxa' ? { comissao: '17', pagamento: '3,2' }
        : tipo === 'metas' ? { metaCmv_LOJA: '25', metaCmv_DELIVERY_PROPRIO: '26', metaCmv_IFOOD: '27' }
          : tipo === 'margens' ? { margem_LOJA: '40', margem_DELIVERY_PROPRIO: '41', margem_IFOOD: '42' } : campos;
      expect(primeiro.vez).toBe(1); expect(primeiro.confirmacao.campos).toEqual(canonicos);
      const chave = Object.keys(campos)[0], alterados = { ...primeiro.confirmacao.campos, [chave]: tipo === 'taxa' ? '18' : tipo === 'faixas' ? '21' : '28' };
      const segundo = await enviar(primeiro, montar(primeiro.confirmacao.versao, alterados));
      if (!segundo?.ok) throw new Error(json(segundo));
      expect(segundo.vez).toBe(2); expect(segundo.confirmacao.versao).not.toBe(primeiro.confirmacao.versao); expect(segundo.confirmacao.campos).toEqual(alterados);
      const iguais = await enviar(segundo, montar(segundo.confirmacao.versao, segundo.confirmacao.campos));
      expect(iguais).toMatchObject({ ok: true, vez: 3, confirmacao: segundo.confirmacao });
      const antes = await a.canalConfig.findMany({ orderBy: { canal: 'asc' } });
      const conflito = await enviar(iguais, montar(primeiro.confirmacao.versao, campos));
      expect(conflito).toMatchObject({ ok: false, conflito: true, vez: 4 }); expect(conflito).not.toHaveProperty('confirmacao');
      const erro = await enviar(conflito, montar(segundo.confirmacao.versao, { ...alterados, [chave]: 'texto inválido' }));
      expect(erro).toMatchObject({ ok: false, vez: 5 }); expect(erro).not.toHaveProperty('confirmacao');
      expect(await a.canalConfig.findMany({ orderBy: { canal: 'asc' } })).toEqual(antes);
    }
  });

  it('N1 entrega slug à resolução de sessão; rejeição não chega ao domínio nem à auditoria', async () => {
    const { a } = await novo(); await expect(salvarN1('slug-sem-autorizacao', null, await form(a))).rejects.toThrow('NOT_FOUND');
    expect(await a.canalConfig.count()).toBe(0); expect(atual.auditoria).not.toHaveBeenCalled();
  });

  it('impressão inicial não transporta faixas; pedido financeiro tem faixa sem meta, e revogação descarta todos os valores nas duas rotas', async () => {
    const { a, parceiro, acesso } = await novo();
    expect(await acaoSalvarFaixasDeCmv(null, await form(a))).toMatchObject({ ok: true });
    const i = await cadastrarInsumoDeTeste(a, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Insumo', unidade: 'UN', conteudo: '1', preco: '3' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const f = await cadastrarFicha(a, { nome: 'Prato de impressão', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: i.id, quantidade: '1', unidade: 'un' }], passos: ['Misturar.'] }, { tipo: 'manter' });
    if (!f.ok) throw new Error(JSON.stringify(f));
    const p = await a.produtoVenda.create({ data: { parceiroId: parceiro.id, fichaId: f.id, nome: 'Prato de impressão' } });
    await a.produtoCanal.createMany({ data: canais.map(canal => ({ parceiroId: parceiro.id, produtoId: p.id, canal, precoManualCentavos: 1000 })) });
    const pagina = await PaginaImpressao({ params: Promise.resolve({ id: f.id }) }) as ReactElement<ComponentProps<typeof TelaImpressaoFicha>>;
    expect(pagina.props.podeFinanceiro).toBe(true); expect(pagina.props.ficha.verCustos).toBe(false);
    expect(json(pagina.props)).not.toMatch(/farol|aBp|bBp|cBp|dBp|confortavel|cmvBp|precoCentavos/);
    const operacional = renderToStaticMarkup(createElement(TelaImpressaoFicha, pagina.props));
    expect(operacional).toContain('Misturar.'); expect(operacional).not.toContain('Confortável');
    const versao = pagina.props.ficha.versaoOperacional;
    for (const imprimir of [() => acaoImpressaoFinanceira(f.id, versao), () => imprimirN1(parceiro.slug, f.id, versao)]) {
      acesso(); const r = await imprimir(); if (!r.ok) throw new Error(r.erro);
      expect(r.canais).toHaveLength(3); expect(r.canais!.every(c => c.metaBp === null && c.farol.faixa === 'confortavel')).toBe(true);
      const html = renderToStaticMarkup(createElement(DocumentoDaFicha, { ficha: r.ficha, canais: r.canais, contexto: 'Parceiro sintético', base: '/erp/fichas', geradoEm: new Date('2026-11-06T12:00:00Z') }));
      expect(html).toContain('Confortável');
      acesso(['precos.ver']); const negado = await imprimir(); expect(negado.ok).toBe(false);
      expect(json(negado)).not.toMatch(/farol|aBp|cmvBp|precoCentavos|fisico/);
      acesso(['fichas.ver']); expect((await imprimir()).ok).toBe(false);
      acesso([], 'Parceiro suspenso para gravação'); expect((await imprimir()).ok).toBe(true);
    }
  });
});
