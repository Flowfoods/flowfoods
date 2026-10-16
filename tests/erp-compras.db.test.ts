/**
 * ERP 1.5 · Entrada de compra no Postgres de verdade, pelas actions de verdade:
 * - a dona cadastra o fornecedor e lança na Vila da Penha uma nota com 3
 *   itens e frete: "Conferir" mostra a prévia (Cheddar: antes → depois e o
 *   Burger cheddar em cascata) sem gravar; "Lançar" grava nota, itens com
 *   snapshot e frete rateado, histórico — e NENHUM movimento de estoque
 *   (decisão 64);
 * - o cheddar entra mais caro e o "Burger cheddar" muda na hora;
 * - último preço: data da nota manda (nota de data velha lançada depois não
 *   muda o custo); mesma data, a lançada por último;
 * - a mesma nota (fornecedor + número + série, "000123" = "123") é recusada,
 *   inclusive em corrida (dois lançamentos simultâneos: um entra);
 * - cancelar a última volta o custo ao preço anterior; editar concorrente é
 *   recusado; nota cancelada não se edita;
 * - gerente de outra loja não vê, não lança e não cancela na Vila da Penha;
 *   operador não tem compras (action recusada, nada gravado);
 * - isolamento: o parceiro B não lê nota/fornecedor de A nem usa insumo de A,
 *   nem por SQL cru no contexto dele;
 * - heranças da 1.4: (a) CHECKs validados + 23514 vira frase; (c) ficha com
 *   principal e nenhuma validade é recusada pela action, nada gravado.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-compras.db.test.ts
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
  return { exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo, mudarSituacaoInsumo, motivoDaUnidadeTravada, obterInsumo, listarInsumos } from '@/lib/erp/insumos';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cadastrarFicha, obterFicha } from '@/lib/erp/fichas';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cancelarNota, editarNota, lancarNota, listarNotas, obterFornecedor, obterNota, cadastrarFornecedor } from '@/lib/erp/compras';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import { formatarFracao } from '@/lib/erp/unidades';
import * as comprasDaSessao from '@/app/erp/compras/actions';
import * as fichasDaSessao from '@/app/erp/fichas/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: string) => t.replace(/ /g, ' ');

describe.skipIf(!URL_TESTE)('ERP 1.5 · compras (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${Date.now().toString(36)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const ctxDe = (parceiro: typeof A, alcance: Alcance, autorNome: string) => ({
    parceiro,
    alcance,
    cliente: doParceiro(parceiro.id, db),
    bloqueio: null,
    podeEscrever: true,
    sessao: { userId: 'u', autorNome },
  });
  const DONA = () => alcanceDe('DONO', 'rede');
  const comoDona = () => (atual.ctx = () => ctxDe(A, DONA(), 'Marina Dona'));
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      throw e;
    }
  };
  const idDo = (r: unknown) => (r as { redirect: string }).redirect.split('?')[0].split('/').pop()!;

  /** A nota do roteiro: 3 itens (cheddar em caixa, pão, carne a granel) + R$ 6,00 de frete. */
  const formDaNota = (extra: Record<string, string> = {}, itens?: [string, string, string, string][]) => {
    const f = new FormData();
    const campos = { lojaId: ids.vp, fornecedorId: ids.laticinios, numero: '000123', serie: '1', data: '2026-10-14', frete: '6,00', total: '330,60', ...extra };
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    for (const [insumo, embalagem, quantidade, valor] of itens ?? [
      [ids.cheddar, `v:${ids.caixa}`, '3', '224,50'], // 15 kg
      [ids.pao, 'padrao', '2', '54,90'], // 24 un
      [ids.carne, 'granel', '1', '45,20'], // 1 kg
    ]) {
      f.append('item_insumo', insumo);
      f.append('item_embalagem', embalagem);
      f.append('item_quantidade', quantidade);
      f.append('item_valor', valor);
    }
    return f;
  };
  const custoDoBurger = async () => sp(formatarFracao((await obterFicha(a, ids.burger))!.custo.porRendimento));
  const custoDoCheddar = async () => {
    const i = (await obterInsumo(a, ids.cheddar, DONA()))!;
    return i.custo ? sp(formatarFracao({ num: BigInt(i.custo.centavos) * 1000n, den: BigInt(i.custo.milesimos) })) : null;
  };
  /** Lança direto pela regra (sem a action): a nota mínima de um insumo. */
  const nota = (numero: string, data: string, valor: string, extra: Partial<Record<string, string>> = {}, insumo = ids.cheddar) =>
    lancarNota(a, DONA(), {
      lojaId: ids.vp,
      fornecedorId: ids.laticinios,
      numero,
      serie: '',
      data,
      frete: '',
      total: valor,
      itens: [{ insumoId: insumo, embalagem: 'padrao', quantidade: '1', valor }],
      ...extra,
    });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Compras A', slug: `compras-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Compras B', slug: `compras-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['centro', 'Centro']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar', unidade: 'KG', conteudo: '1', preco: '40,00' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      carne: { nome: 'Carne moída', unidade: 'KG', conteudo: '1', preco: '42,00' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const cx = await cadastrarVariante(a, ids.cheddar, { nome: 'Caixa', escala: 'base', conteudo: '5', preco: '200,00' });
    if (!cx.ok) throw new Error(JSON.stringify(cx));
    ids.caixa = cx.id;
    const molho = await cadastrarFicha(a, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }] }, { tipo: 'manter' }, 'Marina');
    if (!molho.ok) throw new Error(JSON.stringify(molho));
    ids.molho = molho.id;
    const burger = await cadastrarFicha(
      a,
      { nome: 'Burger cheddar', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ids.pao, quantidade: '1', unidade: 'un' }, { subfichaId: ids.molho, quantidade: '40', unidade: 'g' }, { insumoId: ids.carne, quantidade: '180', unidade: 'g' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!burger.ok) throw new Error(JSON.stringify(burger));
    ids.burger = burger.id;
    const ib = await cadastrarInsumo(b, { nome: 'Cheddar', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '30,00' });
    if (!ib.ok) throw new Error(JSON.stringify(ib));
    ids.cheddarB = ib.id;
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a dona cadastra o fornecedor pela action (CNPJ conferido), com histórico', async () => {
    comoDona();
    const ruim = new FormData();
    ruim.set('nome', 'Laticínios Rio');
    ruim.set('documento', '11.222.333/0001-82');
    expect(await rodar(() => comprasDaSessao.acaoCadastrarFornecedor(null, ruim))).toMatchObject({ erros: { documento: expect.stringMatching(/inválido/) } });
    const form = new FormData();
    form.set('nome', 'Laticínios Rio');
    form.set('documento', '11.222.333/0001-81');
    form.set('contato', 'Seu Jorge (21) 99999-0000');
    const r = await rodar(() => comprasDaSessao.acaoCadastrarFornecedor(null, form));
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/erp\/compras\/fornecedores\/.+\?feito=criado$/) });
    ids.laticinios = idDo(r);
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Fornecedor', ids: [ids.laticinios] }] });
    expect(h.mudancas.find((m) => m.campo === 'CNPJ/CPF')?.depois).toBe('11.222.333/0001-81');
    const outro = await cadastrarFornecedor(a, { nome: 'Hortifruti Penha' }, 'Marina');
    if (!outro.ok) throw new Error('fornecedor');
    ids.horti = outro.id;
  });

  it('"Conferir" mostra a prévia (total, frete rateado, Cheddar antes → depois, Burger em cascata) e NÃO grava', async () => {
    comoDona();
    const antesDoBurger = await custoDoBurger();
    const form = formDaNota();
    form.set('intencao', 'conferir');
    const r = (await rodar(() => comprasDaSessao.acaoSalvarNota('', null, form))) as { previa: NonNullable<import('@/components/erp/telas/compras/estado').EstadoNota>['previa'] };
    const p = r.previa!;
    expect(p.totalCentavos).toBe(33060);
    expect(p.itens.reduce((s, i) => s + i.freteRateadoCentavos, 0)).toBe(600);
    const ched = p.custos.find((i) => i.nome === 'Cheddar')!;
    // R$ 224,50 + R$ 4,15 de frete ÷ 15 kg = R$ 15,24/kg (era R$ 40,00 cadastrado).
    expect(sp(ched.antes)).toBe('R$ 40,00/kg');
    expect(sp(ched.depois)).toBe('R$ 15,24/kg');
    expect(ched.efeito).toBe('desce');
    const burger = p.fichas.find((f) => f.nome === 'Burger cheddar')!;
    expect(sp(burger.antes)).toBe(`${antesDoBurger} por porção`);
    expect(p.fichas.map((f) => f.nome)).toContain('Molho cheddar');
    expect(await a.notaEntrada.count()).toBe(0);
  });

  it('"Lançar" grava nota + itens com snapshot e frete rateado + histórico; o custo muda na hora; nenhum movimento de estoque', async () => {
    comoDona();
    const antes = await custoDoBurger();
    const r = await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota()));
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/erp\/compras\/.+\?feito=lancada$/) });
    ids.nota = idDo(r);
    const n = (await obterNota(a, DONA(), ids.nota))!;
    expect(n).toMatchObject({ numero: '123', serie: '1', entradaEm: '2026-10-14', totalCentavos: 33060, freteCentavos: 600, loja: 'Vila da Penha', fornecedorNome: 'Laticínios Rio' });
    expect(n.itens.map((i) => [i.nome, i.embalagem, i.quantidadeMilesimos])).toEqual([
      ['Cheddar', 'Caixa · 5 kg', 15000],
      ['Pão brioche', 'Padrão · 12 un', 24000],
      ['Carne moída', 'A granel (kg)', 1000],
    ]);
    expect(n.itens.reduce((s, i) => s + i.freteRateadoCentavos, 0)).toBe(600);
    expect(n.itens.every((i) => i.valeNoCusto)).toBe(true);
    expect(await custoDoCheddar()).toBe('R$ 15,24');
    expect(await custoDoBurger()).not.toBe(antes);
    // Decisão 64: o estoque só abre na 1.6.
    expect(await a.movimentoEstoque.count()).toBe(0);
    expect(await a.saldoEstoque.count()).toBe(0);
    const [h] = await listarHistorico(a, { de: [{ entidade: 'NotaEntrada', ids: [ids.nota] }] });
    expect(h.acao).toBe('CRIOU');
    expect(h.alvo).toBe('Nota 123 · série 1');
    expect(sp(h.mudancas.find((m) => m.campo === 'itens')!.depois)).toContain('Cheddar, Caixa · 5 kg: 3 = 15 kg por R$ 224,50');
    // A unidade do insumo comprado trava.
    expect(await motivoDaUnidadeTravada(a, ids.carne)).toMatch(/compra/);
    // "Sem preço" não é mais quem tem compra; o detalhe do insumo mostra a última compra.
    const i = (await obterInsumo(a, ids.cheddar, DONA()))!;
    expect(i.ultimaCompra).toMatchObject({ entradaEm: '2026-10-14', detalhe: { notaId: ids.nota, numero: '123', fornecedor: 'Laticínios Rio', lojaNome: 'Vila da Penha' } });
    expect(i.compras).toHaveLength(1);
    expect((await listarInsumos(a, { q: 'Cheddar' })).linhas[0].ultimaCompra).toMatchObject({ entradaEm: '2026-10-14' });
  });

  it('o cheddar entra mais caro e o "Burger cheddar" muda na hora (cascata pelo molho)', async () => {
    const antes = await custoDoBurger();
    const r = await nota('200', '2026-10-15', '60,00'); // 1 kg a R$ 60,00
    expect(r.ok).toBe(true);
    ids.cara = (r as { id: string }).id;
    expect(await custoDoCheddar()).toBe('R$ 60,00');
    // 40 g de molho = 20 g de cheddar: de R$ 15,24/kg para R$ 60,00/kg sobe ~R$ 0,90.
    expect(await custoDoBurger()).not.toBe(antes);
    const molho = (await obterFicha(a, ids.molho))!;
    expect(sp(formatarFracao(molho.custo.porRendimento))).toBe('R$ 30,00');
  });

  it('último preço: nota de data mais velha lançada depois NÃO muda o custo; mesma data, a lançada por último vence', async () => {
    const velha = await nota('150', '2026-10-01', '10,00');
    expect(velha.ok).toBe(true);
    expect(await custoDoCheddar()).toBe('R$ 60,00');
    const mesmaData = await nota('201', '2026-10-15', '55,00');
    expect(mesmaData.ok).toBe(true);
    expect(await custoDoCheddar()).toBe('R$ 55,00');
    ids.mesmaData = (mesmaData as { id: string }).id;
  });

  it('a mesma nota não entra duas vezes ("000123" = "123"), e a recusa aponta para ela', async () => {
    comoDona();
    const r = (await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota({ numero: '123' })))) as { erros: Record<string, string>; duplicadaId?: string };
    expect(r.erros.numero).toMatch(/já foi lançada \(Nota 123 · série 1, Vila da Penha, 14\/10\/2026\)/);
    expect(r.duplicadaId).toBe(ids.nota);
    // Série diferente é outra nota; outro fornecedor com o mesmo número também.
    expect((await nota('123', '2026-10-02', '1,00', { serie: '2' })).ok).toBe(true);
    expect((await nota('123', '2026-10-02', '1,00', { fornecedorId: ids.horti })).ok).toBe(true);
  });

  it('em corrida: dois lançamentos simultâneos da mesma nota, um entra e o outro é recusado', async () => {
    const [x, y] = await Promise.all([nota('777', '2026-10-03', '5,00'), nota('777', '2026-10-03', '5,00')]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    const recusada = (x.ok ? y : x) as { erros: Record<string, string> };
    expect(recusada.erros.numero).toMatch(/já foi lançada|acabou de ser lançada/);
    expect(await a.notaEntrada.count({ where: { numero: '777' } })).toBe(1);
  });

  it('cancelar a última volta o custo ao preço anterior; motivo obrigatório; com histórico; cancelada não se edita', async () => {
    comoDona();
    expect(await custoDoCheddar()).toBe('R$ 55,00');
    const sem = await rodar(() => comprasDaSessao.acaoCancelarNota(ids.mesmaData, null, new FormData()));
    expect(sem).toMatchObject({ erros: { motivo: expect.stringMatching(/por que/) } });
    const form = new FormData();
    form.set('motivo', 'Digitada em dobro');
    const r = await rodar(() => comprasDaSessao.acaoCancelarNota(ids.mesmaData, null, form));
    expect(r).toMatchObject({ redirect: expect.stringMatching(/\?feito=cancelada$/) });
    expect(await custoDoCheddar()).toBe('R$ 60,00');
    const n = (await obterNota(a, DONA(), ids.mesmaData))!;
    expect(n.cancelada).toBe(true);
    expect(n.motivoCancelamento).toBe('Digitada em dobro');
    const [h] = await listarHistorico(a, { de: [{ entidade: 'NotaEntrada', ids: [ids.mesmaData] }] });
    expect(h).toMatchObject({ acao: 'CANCELOU', motivo: 'Digitada em dobro' });
    expect(h.mudancas).toEqual([{ campo: 'situação', antes: 'Lançada', depois: 'Cancelada' }]);
    // A chave fica livre: relançar certa entra.
    expect((await nota('201', '2026-10-15', '52,00')).ok).toBe(true);
    expect(await custoDoCheddar()).toBe('R$ 52,00');
    const e = await editarNota(a, DONA(), ids.mesmaData, { ...n, lojaId: ids.vp, fornecedorId: ids.laticinios, numero: '201', serie: '', data: '2026-10-15', frete: '', total: '1,00', itens: [], versao: n.versao }, 'Marina');
    expect(e).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/cancelada/) } });
  });

  it('editar: o custo acompanha; duas abas com a mesma versão, a segunda é recusada; histórico diz o que entrou e saiu', async () => {
    const n = (await obterNota(a, DONA(), ids.cara))!;
    const entrada = (valor: string) => ({
      lojaId: ids.vp,
      fornecedorId: ids.laticinios,
      numero: '200',
      serie: '',
      data: '2026-10-15',
      frete: '',
      total: valor,
      itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor }],
      versao: n.versao,
    });
    // A nota 201 relançada (R$ 52,00, mesma data, lançada depois) é a que vale; editar a 200 não muda o custo.
    const r1 = await editarNota(a, DONA(), ids.cara, entrada('61,00'), 'Marina');
    expect(r1).toMatchObject({ ok: true, mudou: expect.arrayContaining(['itensDaNota', 'totalCentavos']) });
    const r2 = await editarNota(a, DONA(), ids.cara, entrada('62,00'), 'Paulo');
    expect(r2).toMatchObject({ ok: false, conflito: true });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'NotaEntrada', ids: [ids.cara] }] });
    expect(h.acao).toBe('ALTEROU');
    expect(h.mudancas.map((m) => m.campo)).toEqual(expect.arrayContaining(['entrou', 'saiu', 'total']));
  });

  it('gerente de OUTRA loja: não vê, não lança e não cancela na Vila da Penha (action e regra)', async () => {
    const gerente = alcanceDe('GERENTE', [ids.centro]);
    atual.ctx = () => ctxDe(A, gerente, 'Gil Gerente');
    expect((await listarNotas(a, gerente)).linhas).toHaveLength(0);
    expect((await listarNotas(a, gerente, { lojaId: ids.vp })).linhas).toHaveLength(0);
    expect(await obterNota(a, gerente, ids.nota)).toBeNull();
    const r = (await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota({ numero: '900' })))) as { erros: Record<string, string> };
    expect(r.erros.lojaId).toMatch(/fora do seu acesso/);
    const motivo = new FormData();
    motivo.set('motivo', 'tentativa');
    expect(await rodar(() => comprasDaSessao.acaoCancelarNota(ids.nota, null, motivo))).toMatchObject({ erros: { geral: 'Nota não encontrada.' } });
    expect((await obterNota(a, DONA(), ids.nota))!.cancelada).toBe(false);
    // Na loja dele, lança.
    const ok = await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota({ numero: '901', lojaId: ids.centro })));
    expect(ok).toMatchObject({ redirect: expect.stringMatching(/feito=lancada/) });
    expect((await listarNotas(a, gerente)).linhas.map((l) => l.numero)).toEqual(['901']);
    // A recusa de nota repetida numa loja que ele não vê não diz qual é.
    const dup = (await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota({ numero: '123', lojaId: ids.centro })))) as { erros: Record<string, string>; duplicadaId?: string };
    expect(dup.erros.numero).toMatch(/em outra loja/);
    expect(dup.duplicadaId).toBeUndefined();
    // O fornecedor mostra só as notas das lojas dele.
    expect((await obterFornecedor(a, gerente, ids.laticinios))!.notas.map((n) => n.numero)).toEqual(['901']);
  });

  it('operador: compras nem aparece; a action recusa e nada é gravado', async () => {
    const operador = alcanceDe('OPERADOR', 'rede');
    expect(modulosDoParceiro(operador).map((m) => m.chave)).not.toContain('compras');
    expect(modulosDoParceiro(DONA()).find((m) => m.chave === 'compras')?.href).toBe('/erp/compras');
    atual.ctx = () => ctxDe(A, operador, 'Paulo Operador');
    const antes = await a.notaEntrada.count();
    const r = (await rodar(() => comprasDaSessao.acaoSalvarNota('', null, formDaNota({ numero: '950' })))) as { erros: Record<string, string> };
    expect(r.erros.geral).toMatch(/lançar nota de compra/);
    const f = new FormData();
    f.set('nome', 'Fornecedor do operador');
    expect(await rodar(() => comprasDaSessao.acaoCadastrarFornecedor(null, f))).toMatchObject({ erros: { geral: expect.stringMatching(/cadastrar fornecedores/) } });
    expect(await a.notaEntrada.count()).toBe(antes);
  });

  it('insumo: gerente de outra loja e operador sem "ver compras" recebem o CUSTO, mas nada da nota (número, fornecedor, loja, valores)', async () => {
    const gerente = alcanceDe('GERENTE', [ids.centro]);
    const operador = alcanceDe('OPERADOR', 'rede');
    const daDona = (await obterInsumo(a, ids.cheddar, DONA()))!;
    expect(daDona.ultimaCompra?.detalhe?.lojaNome).toBe('Vila da Penha');
    for (const [quem, alcance] of [['gerente do Centro', gerente], ['operador', operador]] as const) {
      const i = (await obterInsumo(a, ids.cheddar, alcance))!;
      // O custo de referência da rede continua (é o que a ficha usa).
      expect(i.custo, quem).toEqual(daDona.custo);
      expect(i.ultimaCompra?.custo, quem).toEqual(daDona.ultimaCompra?.custo);
      // A nota que dá o custo é da Vila da Penha: fora do acesso de compras dos dois.
      expect(i.ultimaCompra?.detalhe, quem).toBeNull();
      const json = JSON.stringify(i);
      expect(json, quem).not.toContain('Vila da Penha');
      expect(json, quem).not.toContain(ids.nota);
      expect(i.compras.every((c) => c.lojaId === ids.centro), quem).toBe(true);
      expect(i.precoPorFornecedor.every((c) => c.lojaId === ids.centro), quem).toBe(true);
    }
    // O gerente vê a nota da loja dele (901, no Centro); o operador, nenhuma.
    expect((await obterInsumo(a, ids.cheddar, gerente))!.compras.map((c) => c.rotulo)).toEqual(['901-1']);
    const doOperador = (await obterInsumo(a, ids.cheddar, operador))!;
    expect(doOperador.compras).toEqual([]);
    expect(doOperador.precoPorFornecedor).toEqual([]);
    expect(JSON.stringify(doOperador)).not.toContain('Laticínios');
    // Fornecedor: sem "ver compras", nenhuma nota nem preço; o gerente só as do Centro.
    const fOp = (await obterFornecedor(a, operador, ids.laticinios))!;
    expect([fOp.notas, fOp.insumos]).toEqual([[], []]);
    expect((await obterFornecedor(a, gerente, ids.laticinios))!.insumos.every((x) => x.entradaEm === '2026-10-14')).toBe(true);
    // Lista de insumos: só a data da compra (nada de nota ou fornecedor).
    const linha = (await listarInsumos(a, { q: 'Cheddar' })).linhas[0];
    expect(Object.keys(linha.ultimaCompra ?? {})).toEqual(['entradaEm']);
  });

  it('isolamento: B não lê nota nem fornecedor de A, não usa insumo nem fornecedor de A, nem por SQL cru', async () => {
    const donaB = alcanceDe('DONO', 'rede');
    expect(await obterNota(b, donaB, ids.nota)).toBeNull();
    expect(await obterFornecedor(b, donaB, ids.laticinios)).toBeNull();
    expect((await listarNotas(b, donaB)).total).toBe(0);
    const forn = await cadastrarFornecedor(b, { nome: 'Laticínios Rio' }, 'Bia'); // mesmo nome, outro parceiro: pode
    expect(forn.ok).toBe(true);
    const fB = (forn as { id: string }).id;
    const comInsumoDeA = await lancarNota(b, donaB, { lojaId: ids.lojaB, fornecedorId: fB, numero: '1', serie: '', data: '2026-10-14', frete: '', total: '10,00', itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor: '10,00' }] }, 'Bia');
    expect(comInsumoDeA).toMatchObject({ ok: false, erros: { 'item-0': 'Insumo não encontrado neste cadastro.' } });
    const comFornecedorDeA = await lancarNota(b, donaB, { lojaId: ids.lojaB, fornecedorId: ids.laticinios, numero: '1', serie: '', data: '2026-10-14', frete: '', total: '10,00', itens: [{ insumoId: ids.cheddarB, embalagem: 'padrao', quantidade: '1', valor: '10,00' }] }, 'Bia');
    expect(comFornecedorDeA).toMatchObject({ ok: false, erros: { fornecedorId: expect.stringMatching(/não encontrado/) } });
    const naLojaDeA = await lancarNota(b, donaB, { lojaId: ids.vp, fornecedorId: fB, numero: '1', serie: '', data: '2026-10-14', frete: '', total: '10,00', itens: [{ insumoId: ids.cheddarB, embalagem: 'padrao', quantidade: '1', valor: '10,00' }] }, 'Bia');
    expect(naLojaDeA).toMatchObject({ ok: false, erros: { lojaId: expect.any(String) } });
    expect(await cancelarNota(b, donaB, ids.nota, 'tentar', 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    // SQL cru no contexto de B não enxerga as notas de A (RLS; sem RLS, o filtro do portão).
    const [{ n }] = await b.sql<{ n: string }>`SELECT count(*)::text AS n FROM "NotaEntrada" WHERE "id" = ${ids.nota}`;
    if (perfil.rls) expect(n).toBe('0');
    // A nota de B com o mesmo número não colide com a de A (chave por parceiro), e o custo de B é o de B.
    const okB = await lancarNota(b, donaB, { lojaId: ids.lojaB, fornecedorId: fB, numero: '123', serie: '1', data: '2026-10-14', frete: '', total: '33,00', itens: [{ insumoId: ids.cheddarB, embalagem: 'padrao', quantidade: '1', valor: '33,00' }] }, 'Bia');
    expect(okB.ok).toBe(true);
    expect((await obterInsumo(b, ids.cheddarB, alcanceDe("DONO", "rede")))!.custo).toEqual({ centavos: 33, milesimos: 10 });
    expect(await custoDoCheddar()).toBe('R$ 52,00');
  });

  describe('heranças da 1.4', () => {
    it('(a) os CHECKs de validade do Insumo estão validados (valem também para linhas antigas)', async () => {
      const r = await db.$queryRaw<{ conname: string; convalidated: boolean }[]>`
        SELECT conname, convalidated FROM pg_constraint
        WHERE conrelid = '"Insumo"'::regclass AND conname IN ('Insumo_validades_faixa', 'Insumo_validade_principal')`;
      expect(r).toHaveLength(2);
      expect(r.every((c) => c.convalidated)).toBe(true);
    });

    it('(a) linha que um CHECK recusa vira frase ao desativar, não erro 500', async () => {
      const nome = `Fora da regra ${sufixo}`;
      const r = await cadastrarInsumo(a, { nome, tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
      if (!r.ok) throw new Error(JSON.stringify(r));
      // Um CHECK NOT VALID que esta linha (gravada antes) viola: a próxima escrita nela é recusada (23514).
      const check = `Insumo_validade_teste_${sufixo}`;
      await db.$executeRawUnsafe(`ALTER TABLE "Insumo" ADD CONSTRAINT "${check}" CHECK ("nome" <> '${nome}') NOT VALID`);
      try {
        const d = await mudarSituacaoInsumo(a, r.id, false, 'teste', 'Marina Dona');
        expect(d.ok).toBe(false);
        expect(!d.ok && d.erros.geral).toMatch(/validade gravada neste insumo está fora da regra/);
        expect((await a.insumo.findUnique({ where: { id: r.id } }))?.ativo).toBe(true);
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "Insumo" DROP CONSTRAINT "${check}"`);
      }
    });

    it('(c) ficha com a principal escolhida e nenhuma validade: a action avisa e nada é gravado', async () => {
      comoDona();
      const form = new FormData();
      form.set('nome', `Molho sem validade ${sufixo}`);
      form.set('tipo', 'PRE_PREPARO');
      form.set('rendimento', '1');
      form.set('rendimentoUnidade', 'kg');
      form.append('item_insumo', ids.cheddar);
      form.append('item_quantidade', '500');
      form.append('item_unidade', 'g');
      form.append('item_fator', '');
      form.set('validadeNoFormulario', 'sim');
      form.set('conservacao', 'REFRIGERADO');
      const r = await rodar(() => fichasDaSessao.acaoCadastrarFicha(null, form));
      expect(r).toMatchObject({ erros: { conservacao: expect.stringMatching(/nenhuma conservação tem validade/) } });
      expect(await a.fichaTecnica.count({ where: { nome: `Molho sem validade ${sufixo}` } })).toBe(0);
    });
  });
});
