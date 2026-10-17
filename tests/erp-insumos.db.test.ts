/**
 * ERP 1.1 · Insumos no Postgres de verdade: cadastro com embalagem, frete e
 * "Sem preço"; editar só o que mudou, com antes/depois na mesma transação;
 * duas abas editando (a segunda é recusada, nada sobrescrito); unidade travada
 * com outra embalagem; desativar/reativar com histórico; embalagens (variantes)
 * isoladas por parceiro; operador sem "cadastrar e editar insumos" recusado
 * chamando as actions de verdade; nível 1 edita no parceiro A sem tocar no B;
 * parceiro suspenso só lê.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_shell npx vitest run tests/erp-insumos.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), auditoria: [] as unknown[] }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
// As actions de verdade, com o contexto apontado para o banco de teste.
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
  };
});
// auditLog do /rodolfo (N1): fora do teste de insumo.
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async (a: unknown) => atual.auditoria.push(a) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { listarHistorico } from '@/lib/erp/historico';
import {
  buscarInsumos,
  cadastrarInsumo,
  editarInsumo,
  listarInsumos,
  MENSAGEM_CONFLITO,
  MENSAGEM_DESATIVADO,
  mudarSituacaoInsumo,
  obterInsumo,
} from '@/lib/erp/insumos';
import { cadastrarVariante, editarVariante, mudarSituacaoVariante } from '@/lib/erp/variantes';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';
import * as daSessao from '@/app/erp/insumos/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/insumos/actions';
import { custoDaQuantidade } from '@/lib/erp/unidades';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 1.1 · cadastro de insumos (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `i${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string };
  let B: { id: string; slug: string; nome: string };
  let S: { id: string; slug: string; nome: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;

  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
  };
  const vinculo = (perfilBase: 'DONO' | 'OPERADOR') =>
    resolverAlcance({
      perfilBase,
      perfilProprio: null,
      permissoesExtras: [],
      permissoesRemovidas: [],
      redeInteira: true,
      lojaIds: [],
    });
  const ctxDaPessoa = (parceiro: typeof A, perfilBase: 'DONO' | 'OPERADOR', bloqueio: string | null = null) => ({
    parceiro,
    alcance: vinculo(perfilBase),
    cliente: doParceiro(parceiro.id, db, { somenteLeitura: bloqueio !== null }),
    bloqueio,
    podeEscrever: bloqueio === null,
    sessao: { userId: 'u', autorNome: perfilBase === 'DONO' ? 'Marina Dona' : 'Paulo Operador' },
  });
  /** Roda a action e devolve o destino do redirect (sucesso) ou o estado (erro). */
  async function rodar<T>(p: Promise<T>): Promise<{ destino: string } | T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('REDIRECT ')) return { destino: (e as Error & { url: string }).url };
      throw e;
    }
  }
  const cebola = { nome: 'Cebola', tipo: 'INGREDIENTE', unidade: 'KG', conservacao: 'SECO', conteudo: '5', escala: 'base', preco: '89,90', frete: '5,00' };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Ins A', slug: `ins-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Ins B', slug: `ins-b-${sufixo}`, status: 'ATIVO' } });
    S = await db.parceiroFlow.create({ data: { nome: 'Ins S', slug: `ins-s-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id, S.id]);
    await db?.$disconnect();
  });

  it('cadastra com embalagem, frete e custo; o mesmo custo na lista, no detalhe e no histórico', async () => {
    const r = await cadastrarInsumo(a, cebola, 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const salvo = await a.insumo.findUniqueOrThrow({ where: { id: r.id } });
    expect(salvo).toMatchObject({ conteudoMilesimos: 5000, precoEmbalagemCentavos: 8990, taxaEntregaCentavos: 500, tipo: 'INGREDIENTE', conservacao: 'SECO', ativo: true });
    const lista = await listarInsumos(a);
    expect(custoDaQuantidade(lista.linhas.find((l) => l.id === r.id)!.custo!, 1000)).toBe(1898);
    expect(custoDaQuantidade((await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))!.custo!, 1000)).toBe(1898);
    const [h] = await listarHistorico(a, { entidade: 'Insumo', verPrecos: true });
    expect(h.acao).toBe('CRIOU');
    expect(h.alvo).toBe('Cebola');
    expect(h.mudancas.find((m) => m.campo === 'custo por unidade')?.depois.replace(/ /g, ' ')).toBe('R$ 18,98/kg');
  });

  it('"Ainda não sei o preço": grava 0, lista diz Sem preço (custo null) e o filtro acha', async () => {
    const r = await cadastrarInsumo(a, { ...cebola, nome: 'Azeite', unidade: 'L', conteudo: '500', escala: 'menor', preco: '', semPreco: 'on', frete: '' });
    expect(r.ok).toBe(true);
    const semPreco = await listarInsumos(a, { semPreco: true });
    expect(semPreco.linhas.map((l) => [l.nome, l.custo, l.conteudoMilesimos])).toEqual([['Azeite', null, 500]]);
    // Ordenar por custo: "Sem preço" fica no fim nos dois sentidos.
    expect((await listarInsumos(a, { ordem: 'custo', direcao: 'asc' })).linhas.at(-1)?.nome).toBe('Azeite');
    expect((await listarInsumos(a, { ordem: 'custo', direcao: 'desc' })).linhas.at(-1)?.nome).toBe('Azeite');
  });

  it('editar grava só o que mudou, com antes/depois; sem mudança não grava nada', async () => {
    const i = (await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } }))!;
    const d = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    const r = await editarInsumo(a, i.id, { ...cebola, frete: '7,50', conservacao: 'REFRIGERADO', versao: d.versao }, 'Marina');
    expect(r).toMatchObject({ ok: true, mudou: ['conservacao', 'taxaEntregaCentavos', 'custoPorUnidade'] });
    const [h] = await listarHistorico(a, { entidade: 'Insumo', verPrecos: true });
    expect(h.acao).toBe('ALTEROU');
    expect(h.mudancas.map((m) => [m.campo, m.antes, m.depois].map((x) => x?.replace(/ /g, ' ')))).toEqual([
      ['conservação', 'Seco', 'Refrigerado'],
      ['frete', 'R$ 5,00', 'R$ 7,50'],
      ['custo por unidade', 'R$ 18,98/kg', 'R$ 19,48/kg'],
    ]);
    const antes = await a.historicoAlteracao.count();
    const nova = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    const igual = await editarInsumo(a, i.id, { ...cebola, frete: '7,50', conservacao: 'REFRIGERADO', versao: nova.versao });
    expect(igual).toMatchObject({ ok: true, mudou: [] });
    expect(await a.historicoAlteracao.count()).toBe(antes);
  });

  it('duas abas editando: a segunda recebe o conflito e nada é sobrescrito', async () => {
    const i = await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const lida = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!.versao;
    const primeira = await editarInsumo(a, i.id, { ...cebola, preco: '91,00', versao: lida });
    expect(primeira.ok).toBe(true);
    const segunda = await editarInsumo(a, i.id, { ...cebola, preco: '10,00', versao: lida });
    expect(segunda).toEqual({ ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: i.id } })).precoEmbalagemCentavos).toBe(9100);

    // Ao mesmo tempo, de verdade: só uma passa.
    const v = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!.versao;
    const juntas = await Promise.all(
      ['92,00', '93,00', '94,00'].map((preco) => editarInsumo(a, i.id, { ...cebola, preco, versao: v })),
    );
    expect(juntas.filter((x) => x.ok)).toHaveLength(1);
    expect(juntas.filter((x) => !x.ok && x.conflito)).toHaveLength(2);
  });

  it('unidade não muda com outra embalagem cadastrada (e muda sem ela)', async () => {
    const r = await cadastrarInsumo(a, { ...cebola, nome: 'Farinha' });
    if (!r.ok) throw new Error('setup');
    const sem = await editarInsumo(a, r.id, { ...cebola, nome: 'Farinha', unidade: 'UN', conteudo: '10', versao: (await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))!.versao });
    expect(sem.ok).toBe(true);
    const de25 = await cadastrarVariante(a, r.id, { nome: 'Fardo 25', conteudo: '25', preco: '120,00' });
    expect(de25.ok).toBe(true);
    const d = (await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))!;
    expect(d.travaDaUnidade).toMatch(/outra embalagem/);
    const com = await editarInsumo(a, r.id, { ...cebola, nome: 'Farinha', unidade: 'KG', versao: d.versao });
    expect(com).toMatchObject({ ok: false, erros: { unidade: expect.stringMatching(/outra embalagem/) } });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: r.id } })).unidade).toBe('UN');
  });

  it('desativar/reativar grava antes e depois com motivo; desativado sai da lista padrão', async () => {
    const i = await a.insumo.findFirstOrThrow({ where: { nome: 'Azeite' } });
    const r = await mudarSituacaoInsumo(a, i.id, false, '  saiu do cardápio ', 'Marina');
    expect(r.ok).toBe(true);
    const [h] = await listarHistorico(a, { entidade: 'Insumo', verPrecos: true });
    expect(h).toMatchObject({ acao: 'DESATIVOU', motivo: 'saiu do cardápio', alvo: 'Azeite' });
    expect(h.mudancas).toEqual([{ campo: 'situação', antes: 'Ativo', depois: 'Desativado' }]);
    expect((await listarInsumos(a)).linhas.map((l) => l.nome)).not.toContain('Azeite');
    expect((await listarInsumos(a, { situacao: 'desativados' })).linhas.map((l) => l.nome)).toEqual(['Azeite']);
    // De novo: recusado (já estava), sem histórico novo.
    const n = await a.historicoAlteracao.count();
    expect((await mudarSituacaoInsumo(a, i.id, false, null)).ok).toBe(false);
    expect(await a.historicoAlteracao.count()).toBe(n);
    // Nome repetido de um desativado oferece reativar.
    const repetido = await cadastrarInsumo(a, { ...cebola, nome: 'Azeite' });
    expect(repetido).toMatchObject({ ok: false, desativadoId: i.id, erros: { nome: expect.stringMatching(/desativado/) } });
    // Desativado não se edita (nem embalagem nova), mesmo chamando o servidor direto.
    const lido = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    expect(await editarInsumo(a, i.id, { ...cebola, nome: 'Azeite', versao: lido.versao })).toEqual({ ok: false, erros: { geral: MENSAGEM_DESATIVADO } });
    expect(await cadastrarVariante(a, i.id, { nome: 'Lata', conteudo: '1', preco: '1,00' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/reative/) } });
    expect((await mudarSituacaoInsumo(a, i.id, true, null)).ok).toBe(true);
    expect((await listarHistorico(a, { entidade: 'Insumo', verPrecos: true }))[0].acao).toBe('REATIVOU');
  });

  it('custo abaixo de 1 centavo (guardanapo 1000 un por R$ 4,00): exato na lista, na ordem, no histórico e na comparação', async () => {
    const r = await cadastrarInsumo(a, { ...cebola, nome: 'Guardanapo de papel', tipo: 'EMBALAGEM', unidade: 'UN', conteudo: '1000', frete: '', preco: '4,00' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const outro = await cadastrarInsumo(a, { ...cebola, nome: 'Palito', tipo: 'EMBALAGEM', unidade: 'UN', conteudo: '1000', frete: '', preco: '5,00' });
    if (!outro.ok) throw new Error('setup');
    const linha = (await listarInsumos(a, { q: 'Guardanapo' })).linhas[0];
    expect(linha.custo).toEqual({ centavos: 1, milesimos: 2500 });
    // Ordem por custo distingue 0,004 de 0,005 (antes os dois eram "0").
    const ordem = (await listarInsumos(a, { ordem: 'custo' })).linhas.map((l) => l.nome);
    expect(ordem.indexOf('Guardanapo de papel')).toBeLessThan(ordem.indexOf('Palito'));
    const [h] = await listarHistorico(a, { de: [{ entidade: 'Insumo', ids: [r.id] }], verPrecos: true });
    expect(h.mudancas.find((m) => m.campo === 'custo por unidade')?.depois.replace(/\u00a0/g, ' ')).toBe('R$ 0,004/un');
    const gravado = await a.historicoAlteracao.findFirstOrThrow({ where: { entidadeId: r.id } });
    expect((gravado.depois as Record<string, unknown>).custoPorUnidade).toEqual({ centavos: 1, milesimos: 2500 });
    // Duas embalagens: 1000 un por R$ 4,00 (padrão) e 5000 un por R$ 15,00.
    expect((await cadastrarVariante(a, r.id, { nome: 'Fardo 5000 un', conteudo: '5000', preco: '15,00' })).ok).toBe(true);
    const d = (await obterInsumo(a, r.id, ALCANCE_FLOWFOODS))!;
    expect(d.variantes[0].custo).toEqual({ centavos: 3, milesimos: 10_000 });
    expect(custoDaQuantidade(d.custo!, 30_000)).toBe(12); // 30 guardanapos = R$ 0,12
  });

  it('embalagens: criar, comparar, editar com versão, nome único por insumo, desativar', async () => {
    const i = await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const caixa = await cadastrarVariante(a, i.id, { nome: 'Caixa 10 kg', conteudo: '10', preco: '170,00', frete: '5,00', codigoBarras: '7891000100103' }, 'Marina');
    expect(caixa.ok).toBe(true);
    if (!caixa.ok) return;
    expect(await cadastrarVariante(a, i.id, { nome: 'Caixa 10 kg', conteudo: '9', preco: '1,00' })).toEqual({
      ok: false,
      erros: { nome: 'Este insumo já tem uma embalagem com esse nome.' },
    });
    const d = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    const v = d.variantes.find((x) => x.id === caixa.id)!;
    expect(custoDaQuantidade(v.custo!, 1000)).toBe(1750);
    // Duas abas: a primeira passa, a segunda (versão velha) é recusada.
    expect((await editarVariante(a, i.id, v.id, { nome: 'Caixa 10 kg', conteudo: '10', preco: '160,00', frete: '5,00', codigoBarras: '7891000100103', versao: v.versao })).ok).toBe(true);
    const velha = await editarVariante(a, i.id, v.id, { nome: 'Caixa 10 kg', conteudo: '10', preco: '1,00', versao: v.versao });
    expect(velha).toMatchObject({ ok: false, conflito: true });
    expect((await a.insumoVariante.findUniqueOrThrow({ where: { id: v.id } })).precoEmbalagemCentavos).toBe(16_000);
    const [h] = await listarHistorico(a, { entidade: 'InsumoVariante', verPrecos: true });
    expect(h).toMatchObject({ acao: 'ALTEROU', alvo: 'Cebola · Caixa 10 kg' });
    expect(h.mudancas.map((m) => m.campo)).toEqual(['preço', 'custo por unidade']);
    expect((await mudarSituacaoVariante(a, i.id, v.id, false, 'fornecedor parou')).ok).toBe(true);
    expect((await a.insumoVariante.findUniqueOrThrow({ where: { id: v.id } })).ativo).toBe(false);
    // A embalagem só se alcança pelo insumo dela.
    const outro = await a.insumo.findFirstOrThrow({ where: { nome: 'Farinha' } });
    expect(await mudarSituacaoVariante(a, outro.id, v.id, true, null)).toMatchObject({ ok: false, naoEncontrado: true });
  });

  it('isolamento: B não lê, não edita e não pendura embalagem no insumo de A', async () => {
    const i = await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const v = await a.insumoVariante.findFirstOrThrow({ where: { insumoId: i.id } });
    expect(await obterInsumo(b, i.id, ALCANCE_FLOWFOODS)).toBeNull();
    expect(await editarInsumo(b, i.id, { ...cebola, versao: new Date().toISOString() })).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await mudarSituacaoInsumo(b, i.id, false, null)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await cadastrarVariante(b, i.id, { nome: 'Pirata', conteudo: '1', preco: '1,00' })).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await editarVariante(b, i.id, v.id, { nome: 'x', conteudo: '1', preco: '1', versao: 'x' })).toMatchObject({ ok: false, naoEncontrado: true });
    expect((await listarInsumos(b)).total).toBe(0);
    expect(await buscarInsumos(b, 'ceb')).toEqual([]);
    expect((await buscarInsumos(a, 'ceb')).map((x) => x.nome)).toEqual(['Cebola']);
    // O mesmo nome no B é outro insumo.
    expect((await cadastrarInsumo(b, cebola)).ok).toBe(true);
    expect(await a.insumo.count({ where: { nome: 'Cebola' } })).toBe(1);
  });

  it('operador (ver sem editar) é recusado chamando as actions de verdade; nada muda', async () => {
    const i = await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const v = await a.insumoVariante.findFirstOrThrow({ where: { insumoId: i.id } });
    const d = (await obterInsumo(a, i.id, ALCANCE_FLOWFOODS))!;
    atual.ctx = () => ctxDaPessoa(A, 'OPERADOR');
    const insumos = await a.insumo.count();
    const historico = await a.historicoAlteracao.count();
    const tentativas = [
      daSessao.acaoCadastrarInsumo(null, form({ ...cebola, nome: 'Furando' })),
      daSessao.acaoEditarInsumo(i.id, null, form({ ...cebola, preco: '1,00', versao: d.versao })),
      daSessao.acaoSituacaoInsumo(i.id, null, form({ ativo: 'nao' })),
      daSessao.acaoSalvarEmbalagem(i.id, '', null, form({ nome: 'Furo', conteudo: '1', preco: '1,00' })),
      daSessao.acaoSalvarEmbalagem(i.id, v.id, null, form({ nome: 'Furo', conteudo: '1', preco: '1,00', versao: d.variantes[0].versao })),
      daSessao.acaoSituacaoEmbalagem(i.id, v.id, null, form({ ativo: 'sim' })),
    ];
    for (const r of await Promise.all(tentativas.map(rodar))) {
      expect(r && 'erros' in r && r.erros.geral).toMatch(/cadastrar e editar insumos/);
    }
    expect(await a.insumo.count()).toBe(insumos);
    expect(await a.historicoAlteracao.count()).toBe(historico);
    expect((await a.insumo.findUniqueOrThrow({ where: { id: i.id } })).ativo).toBe(true);

    // A dona, pela mesma action, cadastra e cai no detalhe.
    atual.ctx = () => ctxDaPessoa(A, 'DONO');
    const ok = await rodar(daSessao.acaoCadastrarInsumo(null, form({ ...cebola, nome: 'Pela dona' })));
    expect(ok).toEqual({ destino: expect.stringMatching(/^\/erp\/insumos\/\w+\?feito=criado$/) });
  });

  it('nível 1 edita o insumo do parceiro A sem tocar no do B', async () => {
    const deA = await a.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const deB = await b.insumo.findFirstOrThrow({ where: { nome: 'Cebola' } });
    const antesB = await b.insumo.findUniqueOrThrow({ where: { id: deB.id } });
    atual.ctx = () => ({ ...ctxDaPessoa(A, 'DONO'), alcance: ALCANCE_FLOWFOODS, sessao: { userId: 'n1', autorNome: 'Rodolfo' } });
    const d = (await obterInsumo(a, deA.id, ALCANCE_FLOWFOODS))!;
    const r = await rodar(doNivel1.acaoEditarInsumo(A.slug, deA.id, null, form({ ...cebola, preco: '99,00', versao: d.versao })));
    expect(r).toEqual({ destino: `/rodolfo/erp/${A.slug}/insumos/${deA.id}?feito=editado` });
    expect((await a.insumo.findUniqueOrThrow({ where: { id: deA.id } })).precoEmbalagemCentavos).toBe(9900);
    expect(await b.insumo.findUniqueOrThrow({ where: { id: deB.id } })).toEqual(antesB);
    // O id do B com o contexto do A não é alcançado.
    const cruzado = await rodar(doNivel1.acaoEditarInsumo(A.slug, deB.id, null, form({ ...cebola, preco: '1,00', versao: antesB.atualizadoEm.toISOString() })));
    expect(cruzado).toMatchObject({ ok: false, erros: { geral: 'Insumo não encontrado.' } });
    expect(await b.insumo.findUniqueOrThrow({ where: { id: deB.id } })).toEqual(antesB);
    expect((await listarHistorico(a, { entidade: 'Insumo', verPrecos: true }))[0].autorNome).toBe('Rodolfo');
  });

  it('parceiro suspenso: só leitura (action recusa com o motivo; o portão recusa mesmo sem ela)', async () => {
    const r = await cadastrarInsumo(doParceiro(S.id, db), { ...cebola, nome: 'Antes de suspender' });
    if (!r.ok) throw new Error('setup');
    await db.parceiroFlow.update({ where: { id: S.id }, data: { status: 'SUSPENSO' } });
    const motivo = 'Parceiro suspenso: insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar.';
    atual.ctx = () => ctxDaPessoa(S, 'DONO', motivo);
    const recusa = await rodar(daSessao.acaoSituacaoInsumo(r.id, null, form({ ativo: 'nao' })));
    expect(recusa).toMatchObject({ ok: false, erros: { geral: motivo } });
    await expect(mudarSituacaoInsumo(doParceiro(S.id, db, { somenteLeitura: true }), r.id, false, null)).rejects.toThrow();
    // Cliente comum (worker, por exemplo): o banco confere o status na transação.
    await expect(mudarSituacaoInsumo(doParceiro(S.id, db), r.id, false, null)).rejects.toThrow();
    expect((await doParceiro(S.id, db).insumo.findUniqueOrThrow({ where: { id: r.id } })).ativo).toBe(true);
  });
});
