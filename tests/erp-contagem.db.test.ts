/**
 * ERP 1.7 · Contagem do dia a dia no Postgres de verdade:
 * - planejar (curva ABC pelo valor, vencidos pela frequência, o lugar);
 *   operador não planeja nem aplica; gerente de outra loja não alcança;
 *   loja sem estoque aberto não tem ciclo; um insumo numa contagem aberta só;
 * - contar: o esperado é o livro no momento de contar; nota entrando no meio
 *   da contagem fica no estoque (ajuste = contado − esperado sobre o saldo de
 *   agora) e a conferência mostra o que mudou depois;
 * - concluir: versão conferida, CONTAGEM ± com valor exato, razão coerente
 *   com o saldo, idempotente (também em corrida);
 * - fecha sozinha (tudo dentro da tolerância); não fecha com diferença
 *   grande, sem preço ou nota no meio; vencida fecha sem aplicar;
 * - período: cobertura × piso, o fechamento não conclui abaixo do piso, fecha
 *   no piso, fechar de novo = recusado/já feito; ciclo não começa com
 *   fechamento aberto;
 * - regras da loja só pela dona (rede inteira), condicionais, com histórico;
 * - teto (herança a): valor acima de R$ 1 milhão recusado na cíclica;
 * - isolamento: o parceiro B não enxerga nada de A.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-contagem.db.test.ts
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
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import {
  conferenciaDaContagem,
  concluirContagem,
  contarNaContagem,
  descartarContagem,
  iniciarCiclo,
  iniciarFechamento,
  obterContagem,
  obterRegras,
  planejamentoDoCiclo,
  salvarRegras,
  situacaoDoPeriodo,
} from '@/lib/erp/contagem';
import { camposDasRegras, REGRAS_PADRAO } from '@/lib/erp/contagem-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as estoqueDaSessao from '@/app/erp/estoque/actions';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;

describe.skipIf(!URL_TESTE)('ERP 1.7 · contagem do dia a dia (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  // Semana do parceiro termina HOJE: o fechamento do período já pode começar (3 últimos dias).
  const diaDaSemana = ((new Date(`${hoje}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const CFG = { tipo: 'SEMANAL' as const, diaInicio: (diaDaSemana % 7) + 1 };

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);

  const saldo = async (insumoId: string, lojaId = ids.vp) => (await a.saldoEstoque.findFirst({ where: { lojaId, insumoId }, select: { quantidadeMilesimos: true, valorCentavos: true } })) ?? null;
  const itemDe = async (contagemId: string, nome: string) => (await obterContagem(a, DONA(), ids.vp, contagemId))!.itens.find((i) => i.nome === nome)!;
  const contar = async (alcance: Alcance, autor: string, contagemId: string, nome: string, solto: string, embalagens = '', agora?: Date) => {
    const i = await itemDe(contagemId, nome);
    return contarNaContagem(a, alcance, ids.vp, contagemId, { itemId: i.id, embalagens, solto, escala: 'base', versao: i.versao }, autor, agora);
  };
  const versaoDe = async (contagemId: string) => (await a.contagem.findUnique({ where: { id: contagemId }, select: { versao: true } }))!.versao;
  const concluir = async (alcance: Alcance, contagemId: string, confirmar = false) => concluirContagem(a, alcance, ids.vp, contagemId, { versao: await versaoDe(contagemId), confirmarNaoContados: confirmar }, 'Gil Gerente');
  const razaoCoerente = async () => {
    const [r] = await db.$queryRawUnsafe<{ divergentes: number; quebrados: number }[]>(
      `SELECT
         (SELECT count(*)::int FROM "SaldoEstoque" s WHERE s."parceiroId" = $1 AND (s."quantidadeMilesimos", s."valorCentavos") <>
            (SELECT coalesce(sum(m."quantidadeMilesimos"), 0)::int, coalesce(sum(m."valorCentavos"), 0)::int FROM "MovimentoEstoque" m
              WHERE m."parceiroId" = s."parceiroId" AND m."lojaId" = s."lojaId" AND m."insumoId" = s."insumoId")) AS divergentes,
         (SELECT count(*)::int FROM "MovimentoEstoque" m WHERE m."parceiroId" = $1 AND m."saldoAntesMilesimos" + m."quantidadeMilesimos" <> m."saldoDepoisMilesimos") AS quebrados`,
      A.id,
    );
    return r;
  };
  const notaDeCheddar = (numero: string, caixas: string, valor: string) => ({
    lojaId: ids.vp,
    fornecedorId: ids.fornecedor,
    numero,
    serie: '',
    data: hoje,
    frete: '',
    total: valor,
    itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: caixas, valor }],
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Contagem A', slug: `contagem-a-${sufixo}`, status: 'ATIVO' } });
    // 2.2a: a regra do período vive em RegraDoPeriodo (a semana do parceiro termina HOJE).
    await db.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: CFG.tipo, diaInicio: CFG.diaInicio, criadoPorNome: 'teste' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Contagem B', slug: `contagem-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar fatiado', unidade: 'KG', conteudo: '5', preco: '89,90', frete: '5,00', conservacao: 'REFRIGERADO' },
      presunto: { nome: 'Presunto', unidade: 'KG', conteudo: '1', preco: '30,00', conservacao: 'REFRIGERADO' },
      batata: { nome: 'Batata palito', unidade: 'KG', conteudo: '2', semPreco: 'on', conservacao: 'REFRIGERADO' },
      carne: { nome: 'Carne moída', unidade: 'KG', conteudo: '1', preco: '42,00', conservacao: 'CONGELADO' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      ketchup: { nome: 'Ketchup sachê', unidade: 'UN', conteudo: '100', preco: '20,00' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const f = await cadastrarFornecedor(a, { nome: 'Laticínios Rio' }, 'Marina');
    if (!f.ok) throw new Error('fornecedor');
    ids.fornecedor = f.id;
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    // A Penha abriu o estoque há 10 dias (antes do período de agora).
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Cheddar fatiado': '10', Presunto: '4', 'Batata palito': '5', 'Carne moída': '20', 'Pão brioche': '24', 'Ketchup sachê': '100' };
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('loja sem estoque aberto não planeja ciclo nem fecha período', async () => {
    expect(await iniciarCiclo(a, DONA(), ids.delivery, { insumoIds: [ids.cheddar], titulo: '' }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi aberto/) } });
    expect(await iniciarFechamento(a, DONA(), ids.delivery, { inicio: '' }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi aberto/) } });
    expect(await situacaoDoPeriodo(a, DONA(), ids.delivery)).toMatchObject({ aberto: false });
  });

  it('planejamento: curva ABC pelo valor de hoje, vencidos pela frequência, o lugar escolhido', async () => {
    const p = (await planejamentoDoCiclo(a, GERENTE(), ids.vp, { conservacao: 'REFRIGERADO', quais: 'vencidos' }))!;
    const por = Object.fromEntries(p.linhas.map((l) => [l.nome, l]));
    // carne R$ 840 e cheddar R$ 189,80 = A (até 80 %); presunto R$ 120 = B; pão, ketchup e batata (sem preço) = C.
    expect(Object.fromEntries(p.linhas.map((l) => [l.nome, l.classe]))).toEqual({ 'Batata palito': 'C', 'Carne moída': 'A', 'Cheddar fatiado': 'A', 'Ketchup sachê': 'C', 'Pão brioche': 'C', Presunto: 'B' });
    // Contados há 10 dias: A (7 dias) venceu; B (15) e C (30) em dia.
    expect(por['Cheddar fatiado']).toMatchObject({ situacao: 'vencido', sugerido: true });
    expect(por['Carne moída']).toMatchObject({ situacao: 'vencido', sugerido: false }); // congelado: outro lugar
    expect(por.Presunto).toMatchObject({ situacao: 'em-dia', sugerido: false });
    const todos = (await planejamentoDoCiclo(a, GERENTE(), ids.vp, { conservacao: 'REFRIGERADO', quais: 'todos' }))!;
    expect(todos.linhas.filter((l) => l.sugerido).map((l) => l.nome)).toEqual(['Batata palito', 'Cheddar fatiado', 'Presunto']);
    const recontar = (await planejamentoDoCiclo(a, GERENTE(), ids.vp, { conservacao: '', quais: 'vencidos', insumo: ids.pao }))!;
    expect(recontar.linhas.filter((l) => l.sugerido).map((l) => l.nome)).toEqual(['Pão brioche']);
  });

  it('operador não planeja; gerente da Delivery não alcança a Penha; lista vazia é recusada', async () => {
    expect(await iniciarCiclo(a, OPERADOR(), ids.vp, { insumoIds: [ids.cheddar], titulo: '' }, 'Caio')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    expect(await iniciarCiclo(a, GERENTE_DELIVERY(), ids.vp, { insumoIds: [ids.cheddar], titulo: '' }, 'Gil')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await planejamentoDoCiclo(a, GERENTE_DELIVERY(), ids.vp, { conservacao: '', quais: 'vencidos' })).toBeNull();
    expect(await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [], titulo: '' }, 'Gil')).toMatchObject({ ok: false, erros: { lista: expect.any(String) } });
    expect(await a.contagem.count({ where: { tipo: 'CICLICA' } })).toBe(0);
  });

  it('o gerente começa o ciclo dos refrigerados: lista congelada, prazo no fim do dia seguinte; o mesmo insumo não entra em outro ciclo aberto', async () => {
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar, ids.presunto, ids.batata], titulo: '' }, 'Gil Gerente');
    expect(r.ok).toBe(true);
    ids.ciclo = (r as { id: string }).id;
    const c = (await obterContagem(a, OPERADOR(), ids.vp, ids.ciclo))!;
    expect(c.contagem).toMatchObject({ tipo: 'CICLICA', status: 'ABERTA', titulo: 'Refrigerado · 3 insumos', iniciadaPorNome: 'Gil Gerente' });
    expect(c.estado).toBe('EM_CONTAGEM');
    expect(c.itens.map((i) => i.nome)).toEqual(['Batata palito', 'Cheddar fatiado', 'Presunto']);
    expect(c.contagem.fechaAutomaticoEm!.getTime()).toBeGreaterThan(Date.now() + DIA - 1000);
    expect(await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar, ids.pao], titulo: 'Outro' }, 'Gil')).toMatchObject({
      ok: false,
      conflito: true,
      erros: { lista: expect.stringMatching(/Cheddar fatiado \(Refrigerado · 3 insumos\)/) },
    });
    const p = (await planejamentoDoCiclo(a, GERENTE(), ids.vp, { conservacao: '', quais: 'todos' }))!;
    expect(p.linhas.find((l) => l.nome === 'Cheddar fatiado')).toMatchObject({ emOutraContagem: 'Refrigerado · 3 insumos', sugerido: false });
  });

  it('operador conta; nota de cheddar entra NO MEIO: o esperado é o do momento de contar e a nota continua no estoque', async () => {
    expect(await contar(OPERADOR(), 'Caio Estoque', ids.ciclo, 'Cheddar fatiado', '9')).toMatchObject({ ok: true });
    expect(await lancarNota(a, DONA(), notaDeCheddar('501', '1', '94,90'), 'Marina')).toMatchObject({ ok: true });
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(15_000);
    expect(await contar(OPERADOR(), 'Caio Estoque', ids.ciclo, 'Presunto', '4')).toMatchObject({ ok: true });
    const ultimo = await contar(OPERADOR(), 'Caio Estoque', ids.ciclo, 'Batata palito', '6');
    // Tudo contado, mas fora da tolerância (cheddar −1 kg = R$ 18,98; batata sem preço): não fecha sozinha.
    expect(ultimo).toMatchObject({ ok: true });
    expect('fechouSozinha' in ultimo && ultimo.fechouSozinha).toBeFalsy();
    const conf = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.ciclo))!;
    expect(conf.estado).toBe('PRONTA');
    const ch = conf.linhas.find((l) => l.item.nome === 'Cheddar fatiado')!;
    expect(ch).toMatchObject({ esperadoMilesimos: 10_000, atualMilesimos: 15_000 });
    expect(ch.div).toMatchObject({ diferencaMilesimos: -1000, valorCentavos: -1898, mudouDepoisMilesimos: 5000, ficaEmMilesimos: 14_000, dentroDaTolerancia: false });
    expect(ch.depois).toEqual([expect.objectContaining({ tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 5000, notaId: expect.any(String) })]);
    expect(conf.linhas.find((l) => l.item.nome === 'Presunto')!.div).toMatchObject({ diferencaMilesimos: 0, dentroDaTolerancia: true });
    expect(conf.linhas.find((l) => l.item.nome === 'Batata palito')!.div).toMatchObject({ diferencaMilesimos: 1000, valorCentavos: null, dentroDaTolerancia: false });
    expect(conf.soma).toEqual({ sobraCentavos: 0, faltaCentavos: 1898, comDiferenca: 2, semPreco: 1, foraDaTolerancia: 2 });
  });

  it('o operador não aplica; versão velha é recusada; o gerente aplica: CONTAGEM ± com valor exato, saldo = atual + diferença', async () => {
    expect(await concluir(OPERADOR(), ids.ciclo)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    expect(await concluirContagem(a, GERENTE(), ids.vp, ids.ciclo, { versao: 0, confirmarNaoContados: false }, 'Gil')).toMatchObject({ ok: false, conflito: true });
    const [x, y] = await Promise.all([concluir(GERENTE(), ids.ciclo), concluir(GERENTE(), ids.ciclo)]);
    expect(x.ok && y.ok).toBe(true);
    expect([x, y].filter((r) => 'jaFeito' in r && r.jaFeito)).toHaveLength(1);
    const movs = await a.movimentoEstoque.findMany({ where: { lojaId: ids.vp, tipo: 'CONTAGEM' }, orderBy: { insumoNomeSnapshot: 'asc' }, select: { insumoNomeSnapshot: true, quantidadeMilesimos: true, valorCentavos: true, saldoAntesMilesimos: true, saldoDepoisMilesimos: true, chaveIdempotencia: true } });
    expect(movs.map(({ chaveIdempotencia, ...m }) => ({ ...m, chave: chaveIdempotencia!.startsWith('contagem:') }))).toEqual([
      { insumoNomeSnapshot: 'Batata palito', quantidadeMilesimos: 1000, valorCentavos: 0, saldoAntesMilesimos: 5000, saldoDepoisMilesimos: 6000, chave: true },
      { insumoNomeSnapshot: 'Cheddar fatiado', quantidadeMilesimos: -1000, valorCentavos: -1898, saldoAntesMilesimos: 15_000, saldoDepoisMilesimos: 14_000, chave: true },
    ]);
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(14_000);
    // Fechada: o "fica em" é o que o ajuste desta contagem deixou (não soma a diferença de novo).
    const fechada = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.ciclo))!;
    expect(fechada.linhas.find((l) => l.item.nome === 'Cheddar fatiado')!.div.ficaEmMilesimos).toBe(14_000);
    const c = (await a.contagem.findUnique({ where: { id: ids.ciclo } }))!;
    expect(c).toMatchObject({ status: 'FECHADA', desfecho: 'APLICADA', fechadaPorNome: 'Gil Gerente', naoContadosNoFechamento: 0 });
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    // Depois de aplicada, número novo não entra.
    expect(await contar(OPERADOR(), 'Caio', ids.ciclo, 'Presunto', '5')).toMatchObject({ ok: false, fechada: true, erros: { geral: expect.stringMatching(/já foi aplicada/) } });
    const h = await listarHistorico(a, { de: [{ entidade: 'Contagem', ids: [ids.ciclo] }], limite: 10, verPrecos: true });
    expect(h.map((l) => l.acao)).toEqual(expect.arrayContaining(['INICIOU', 'CONCLUIU']));
  });

  it('fecha sozinha: tudo contado e dentro da tolerância (R$ 5,00) — aplicada na transação de quem salvou o último', async () => {
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.presunto, ids.ketchup], titulo: 'Conferência rápida' }, 'Gil Gerente');
    ids.sozinha = (r as { id: string }).id;
    expect(await contar(OPERADOR(), 'Caio', ids.sozinha, 'Ketchup sachê', '100')).toMatchObject({ ok: true });
    // Presunto 4,1 kg (esperado 4): + 100 g × R$ 30/kg = R$ 3,00 — cabe.
    const ultimo = await contar(OPERADOR(), 'Caio', ids.sozinha, 'Presunto', '4,1');
    expect(ultimo).toMatchObject({ ok: true, fechouSozinha: true });
    const c = (await a.contagem.findUnique({ where: { id: ids.sozinha } }))!;
    expect(c).toMatchObject({ status: 'FECHADA', desfecho: 'APLICADA_SOZINHA' });
    expect(c.fechadaPorNome).toMatch(/Caio \(fechou sozinha: tudo dentro da tolerância de R\$\s5,00\)/);
    expect(await a.movimentoEstoque.findFirst({ where: { tipo: 'CONTAGEM', insumoId: ids.presunto }, select: { quantidadeMilesimos: true, valorCentavos: true } })).toEqual({ quantidadeMilesimos: 100, valorCentavos: 300 });
    expect(await concluir(GERENTE(), ids.sozinha)).toMatchObject({ ok: true, jaFeito: true });
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('nota antes de contar entra no esperado (fecha sozinha); nota depois de contar segura para o gerente; teto: valor acima de R$ 1 milhão é recusado ao aplicar; descartar', async () => {
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar], titulo: '' }, 'Gil');
    ids.notaNoMeio = (r as { id: string }).id;
    await lancarNota(a, DONA(), notaDeCheddar('502', '1', '94,90'), 'Marina'); // entra antes de contar: o esperado já inclui
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(19_000);
    const i = await itemDe(ids.notaNoMeio, 'Cheddar fatiado');
    // A tela abriu antes da nota; o número bate com o livro de quando salvou.
    expect(await contarNaContagem(a, OPERADOR(), ids.vp, ids.notaNoMeio, { itemId: i.id, embalagens: '', solto: '19', escala: 'base', versao: i.versao }, 'Caio')).toMatchObject({ ok: true, fechouSozinha: true });
    const r2 = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar], titulo: '' }, 'Gil');
    ids.meio2 = (r2 as { id: string }).id;
    const j = await itemDe(ids.meio2, 'Cheddar fatiado');
    // Teto (herança a): 100 mil kg passam na contagem, mas o valor (R$ 1,9 milhão) não passa ao aplicar.
    expect(await contarNaContagem(a, OPERADOR(), ids.vp, ids.meio2, { itemId: j.id, embalagens: '', solto: '100000', escala: 'base', versao: j.versao }, 'Caio')).toMatchObject({ ok: true });
    const conf = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.meio2))!;
    expect(conf.acimaDoTeto).toEqual([expect.stringMatching(/“Cheddar fatiado” daria mais de R\$ 1\.000\.000,00/)]);
    expect(await concluir(GERENTE(), ids.meio2)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/daria mais de R\$ 1\.000\.000,00/) } });
    expect(await descartarContagem(a, OPERADOR(), ids.vp, ids.meio2, 'contei errado', 'Caio')).toMatchObject({ ok: false });
    expect(await descartarContagem(a, GERENTE(), ids.vp, ids.meio2, '', 'Gil')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await descartarContagem(a, GERENTE(), ids.vp, ids.meio2, 'Contou a caixa errada', 'Gil')).toMatchObject({ ok: true });
    expect((await a.contagem.findUnique({ where: { id: ids.meio2 } }))!.status).toBe('CANCELADA');
    // Nota entrando depois de contar: tudo contado e dentro, mas o item mudou depois → o gerente confere.
    const r3 = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar, ids.presunto], titulo: '' }, 'Gil');
    ids.meio3 = (r3 as { id: string }).id;
    expect(await contar(OPERADOR(), 'Caio', ids.meio3, 'Cheddar fatiado', '19')).toMatchObject({ ok: true });
    await lancarNota(a, DONA(), notaDeCheddar('503', '1', '94,90'), 'Marina');
    const ult = await contar(OPERADOR(), 'Caio', ids.meio3, 'Presunto', '4,1');
    expect(ult).toMatchObject({ ok: true });
    expect('fechouSozinha' in ult && ult.fechouSozinha).toBeFalsy();
    const conf3 = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.meio3))!;
    expect(conf3.linhas.find((l) => l.item.nome === 'Cheddar fatiado')!.div).toMatchObject({ diferencaMilesimos: 0, mudouDepoisMilesimos: 5000, ficaEmMilesimos: 24_000 });
    expect(await concluir(GERENTE(), ids.meio3)).toMatchObject({ ok: true });
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(24_000);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('vencida: passou do prazo, fecha SEM aplicar (gravado na próxima escrita); número não entra; aplicar é recusado', async () => {
    const tresDias = new Date(Date.now() - 3 * DIA);
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.pao], titulo: 'Seco antigo' }, 'Gil', tresDias);
    ids.vencida = (r as { id: string }).id;
    const c = (await obterContagem(a, GERENTE(), ids.vp, ids.vencida))!;
    expect(c.estado).toBe('VENCIDA'); // derivado, antes de gravar
    const antes = await a.movimentoEstoque.count();
    expect(await contar(OPERADOR(), 'Caio', ids.vencida, 'Pão brioche', '20')).toMatchObject({ ok: false, fechada: true, erros: { geral: expect.stringMatching(/prazo desta contagem acabou/) } });
    expect(await a.contagem.findUnique({ where: { id: ids.vencida }, select: { status: true, desfecho: true, fechadaPorNome: true } })).toEqual({ status: 'FECHADA', desfecho: 'VENCIDA', fechadaPorNome: 'Prazo' });
    expect(await concluir(GERENTE(), ids.vencida)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/fechou sem aplicar/) } });
    expect(await a.movimentoEstoque.count()).toBe(antes);
    const h = await listarHistorico(a, { de: [{ entidade: 'Contagem', ids: [ids.vencida] }], limite: 10, verPrecos: true });
    expect(h.map((l) => l.acao)).toContain('VENCEU');
  });

  it('período: cobertura × piso; o fechamento não conclui abaixo do piso (nada gravado) e fecha no piso; idempotente', async () => {
    const s = (await situacaoDoPeriodo(a, GERENTE(), ids.vp))!;
    if (!s.aberto) throw new Error('aberto');
    expect(s.periodo.fim).toBe(hoje);
    expect(s.janela.pode).toBe(true);
    // Contados no período: cheddar, presunto, batata, ketchup (pão venceu sem aplicar; a abertura foi antes). Universo: os 6 com saldo.
    expect(s.cobertura.itens).toEqual({ contados: 4, total: 6, bp: 6666 });
    expect(s.cobertura.atingeValor).toBe(false);
    expect(s.cobertura.paraOPiso).toEqual([ids.carne]);
    expect(s.faltam.map((f) => [f.nome, f.paraOPiso])).toEqual([['Carne moída', true], ['Pão brioche', false]]);
    // Ciclo aberto impede começar o fechamento.
    const ciclo = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.pao], titulo: '' }, 'Gil');
    expect(await iniciarFechamento(a, GERENTE(), ids.vp, { inicio: s.periodo.inicio }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Conclua ou descarte/) } });
    expect((await descartarContagem(a, GERENTE(), ids.vp, (ciclo as { id: string }).id, 'Vai no fechamento', 'Gil')).ok).toBe(true);
    // Operador não começa; duas pessoas juntas dão o mesmo fechamento.
    expect(await iniciarFechamento(a, OPERADOR(), ids.vp, { inicio: s.periodo.inicio }, 'Caio')).toMatchObject({ ok: false });
    const [f1, f2] = await Promise.all([iniciarFechamento(a, GERENTE(), ids.vp, { inicio: s.periodo.inicio }, 'Gil'), iniciarFechamento(a, DONA(), ids.vp, { inicio: s.periodo.inicio }, 'Marina')]);
    expect(f1.ok && f2.ok).toBe(true);
    expect((f1 as { id: string }).id).toBe((f2 as { id: string }).id);
    ids.fechamento = (f1 as { id: string }).id;
    const fc = (await obterContagem(a, GERENTE(), ids.vp, ids.fechamento))!;
    expect(fc.contagem).toMatchObject({ tipo: 'FECHAMENTO', titulo: expect.stringMatching(/^Fechamento · Semana de/) });
    // Lista = o que ainda não foi contado no período.
    expect(fc.itens.map((i) => i.nome)).toEqual(['Carne moída', 'Pão brioche']);
    expect(fc.paraOPiso).toEqual([ids.carne]);
    // Com fechamento aberto, ciclo novo não começa.
    expect(await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.pao], titulo: '' }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/fechamento do período está em andamento/) } });
    // Conta só o pão: abaixo do piso → recusado com a frase, nada gravado.
    await contarNaContagem(a, OPERADOR(), ids.vp, ids.fechamento, { itemId: fc.itens.find((i) => i.nome === 'Pão brioche')!.id, embalagens: '', solto: '24', escala: 'base', versao: 0 }, 'Caio');
    const movsAntes = await a.movimentoEstoque.count();
    const abaixo = await concluir(GERENTE(), ids.fechamento, true);
    expect(abaixo).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/O período não fecha abaixo do piso: com esta contagem, a cobertura fica em .* Conte mais 1 insumo/) } });
    expect(await a.movimentoEstoque.count()).toBe(movsAntes);
    expect((await a.contagem.findUnique({ where: { id: ids.fechamento } }))!.status).toBe('ABERTA');
    const conf = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.fechamento))!;
    expect(conf.cobertura!.cobertura.atinge).toBe(false);
    // Conta a carne (19 kg, esperado 20): agora atinge e fecha.
    await contarNaContagem(a, OPERADOR(), ids.vp, ids.fechamento, { itemId: fc.itens.find((i) => i.nome === 'Carne moída')!.id, embalagens: '', solto: '19', escala: 'base', versao: 0 }, 'Caio');
    expect((await conferenciaDaContagem(a, GERENTE(), ids.vp, ids.fechamento))!.cobertura!.cobertura.atinge).toBe(true);
    expect(await concluir(GERENTE(), ids.fechamento)).toMatchObject({ ok: true });
    expect(await concluir(GERENTE(), ids.fechamento)).toMatchObject({ ok: true, jaFeito: true });
    const f = (await a.contagem.findUnique({ where: { id: ids.fechamento } }))!;
    expect(f).toMatchObject({ status: 'FECHADA', desfecho: 'APLICADA' });
    // Estoque final fotografado: cheddar 24 kg × 18,98 + presunto 4,1 × 30 + carne 19 × 42 + pão 24 × 1,50 + ketchup 100 × 0,20 (batata sem preço fora).
    expect(f.valorTotalCentavos).toBe(45552 + 12300 + 79800 + 3600 + 2000);
    expect(await a.movimentoEstoque.findFirst({ where: { tipo: 'CONTAGEM', insumoId: ids.carne }, select: { quantidadeMilesimos: true, valorCentavos: true } })).toEqual({ quantidadeMilesimos: -1000, valorCentavos: -4200 });
    expect(await iniciarFechamento(a, GERENTE(), ids.vp, { inicio: s.periodo.inicio }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi fechado/) } });
    const s2 = (await situacaoDoPeriodo(a, GERENTE(), ids.vp))!;
    if (!s2.aberto) throw new Error('aberto');
    expect(s2.fechamento).toMatchObject({ status: 'FECHADA' });
    expect(s2.cobertura.atinge).toBe(true);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('regras da loja: o gerente não muda o piso; a dona muda (condicional, com histórico); fora da faixa, recusado', async () => {
    const campos = { ...camposDasRegras(REGRAS_PADRAO), pisoValor: '60' };
    expect(await salvarRegras(a, GERENTE(), ids.vp, campos, REGRAS_PADRAO, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(await salvarRegras(a, DONA(), ids.vp, { ...campos, pisoValor: '40' }, REGRAS_PADRAO, 'Marina')).toMatchObject({ ok: false, erros: { pisoValor: expect.any(String) } });
    expect(await salvarRegras(a, DONA(), ids.vp, campos, REGRAS_PADRAO, 'Marina')).toMatchObject({ ok: true });
    // A outra aba ainda tinha as regras de antes: recusa, nada sobrescrito.
    expect(await salvarRegras(a, DONA(), ids.vp, { ...campos, pisoValor: '95' }, REGRAS_PADRAO, 'Marina')).toMatchObject({ ok: false, conflito: true });
    expect((await obterRegras(a, GERENTE(), ids.vp))!.regras.pisoValorBp).toBe(6000);
    // Sem as regras lidas (ou {} pela action), não grava: a trava de edição simultânea é obrigatória.
    expect(await salvarRegras(a, DONA(), ids.vp, { ...campos, pisoValor: '95' }, null, 'Marina')).toMatchObject({ ok: false, conflito: true });
    atual.ctx = () => ({ parceiro: A, alcance: DONA(), cliente: doParceiro(A.id, db), bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome: 'Marina' } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ ...campos, pisoValor: '95' })) f.append(k, v);
    f.append('lidas', '{}');
    expect(await estoqueDaSessao.acaoSalvarRegrasDaContagem(ids.vp, null, f)).toMatchObject({ ok: false, conflito: true });
    expect((await obterRegras(a, GERENTE(), ids.vp))!.regras.pisoValorBp).toBe(6000);
    const h = await listarHistorico(a, { de: [{ entidade: 'Loja', ids: [ids.vp] }], limite: 5, verPrecos: true });
    expect(h[0]).toMatchObject({ acao: 'ALTEROU' });
  });

  it('fotografia no banco: contagem fechada e os itens dela não mudam, nem por SQL cru (gatilho)', async () => {
    await expect(cru(db, perfil, A.id, `UPDATE "Contagem" SET "valorTotalCentavos" = 1 WHERE "id" = $1`, ids.fechamento)).rejects.toThrow(/Contagem_fechada_imutavel/);
    await expect(cru(db, perfil, A.id, `UPDATE "Contagem" SET "desfecho" = 'VENCIDA' WHERE "id" = $1`, ids.ciclo)).rejects.toThrow(/Contagem_fechada_imutavel/);
    await expect(cru(db, perfil, A.id, `UPDATE "ContagemItem" SET "contadoMilesimos" = 1 WHERE "contagemId" = $1`, ids.fechamento)).rejects.toThrow(/ContagemItem_da_fechada_imutavel/);
    expect((await a.contagem.findUnique({ where: { id: ids.fechamento }, select: { valorTotalCentavos: true } }))!.valorTotalCentavos).toBe(45552 + 12300 + 79800 + 3600 + 2000);
  });

  it('livro no banco: CONTAGEM sem o item da contagem é recusado pelo CHECK', async () => {
    await expect(
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "MovimentoEstoque"(id,"parceiroId","lojaId","insumoId",tipo,"quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot") VALUES ('x${sufixo}', $1, $2, $3, 'CONTAGEM', 1, 0, 0, 1, 'x', 'KG')`,
        A.id,
        ids.vp,
        ids.cheddar,
      ),
    ).rejects.toThrow(/MovimentoEstoque_contagem_tem_item/);
  });

  it('pelas actions de verdade: operador não planeja nem aplica; gerente não muda as regras; operador conta (a regra decide)', async () => {
    const ctxDe = (alcance: Alcance, autorNome: string) => () => ({ parceiro: A, alcance, cliente: doParceiro(A.id, db), bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome } });
    const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
      try {
        return await fn();
      } catch (e) {
        const url = (e as { url?: string }).url;
        if (url) return { redirect: url };
        throw e;
      }
    };
    const form = (pares: [string, string][]) => {
      const f = new FormData();
      for (const [k, v] of pares) f.append(k, v);
      return f;
    };
    const antes = await a.contagem.count();
    atual.ctx = ctxDe(OPERADOR(), 'Caio');
    expect(await rodar(() => estoqueDaSessao.acaoIniciarCiclo(ids.vp, null, form([['insumo', ids.pao]])))).toMatchObject({ erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    expect(await rodar(() => estoqueDaSessao.acaoConcluirContagem(ids.vp, ids.ciclo, null, form([['versao', '0']])))).toMatchObject({ erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    expect(await rodar(() => estoqueDaSessao.acaoIniciarFechamento(ids.vp, null, form([])))).toMatchObject({ erros: { geral: expect.stringMatching(/ajustar saldo/) } });
    atual.ctx = ctxDe(GERENTE(), 'Gil');
    expect(await rodar(() => estoqueDaSessao.acaoSalvarRegrasDaContagem(ids.vp, null, form([['pisoValor', '50']])))).toMatchObject({ erros: { geral: expect.any(String) } });
    expect(await a.contagem.count()).toBe(antes);
    // O gerente planeja pela action (vai para a contagem) e o operador conta pela action.
    const r = await rodar(() => estoqueDaSessao.acaoIniciarCiclo(ids.vp, null, form([['insumo', ids.ketchup], ['titulo', 'Sachês']])));
    expect(r).toMatchObject({ redirect: expect.stringMatching(new RegExp(`^/erp/estoque/${ids.vp}/contagens/[a-z0-9]+\\?feito=ciclo$`)) });
    const id = (r as { redirect: string }).redirect.split('/contagens/')[1].split('?')[0];
    const item = (await obterContagem(a, DONA(), ids.vp, id))!.itens[0];
    atual.ctx = ctxDe(OPERADOR(), 'Caio');
    expect(await estoqueDaSessao.acaoContarNaContagem(ids.vp, id, { itemId: item.id, embalagens: '', solto: '100', escala: 'base', versao: item.versao })).toMatchObject({ ok: true, fechouSozinha: true });
  });

  it('decisão 76 (Guardião): rascunho reenviado depois de uma nota NÃO apaga a nota — o esperado é o livro de quando foi digitado, e nada fecha sozinho', async () => {
    const umaHora = new Date(Date.now() - 3_600_000);
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.cheddar], titulo: 'Sem sinal' }, 'Gil', umaHora);
    const ciclo = (r as { id: string }).id;
    const antes = Number((await saldo(ids.cheddar))!.quantidadeMilesimos);
    // O operador conta 100 g a menos, sem sinal (t0); a dona lança 1 caixa (5 kg) depois; o sinal volta e o número é reenviado.
    await new Promise((x) => setTimeout(x, 30));
    const t0 = Date.now();
    await new Promise((x) => setTimeout(x, 30));
    await lancarNota(a, DONA(), notaDeCheddar('601', '1', '94,90'), 'Marina');
    await new Promise((x) => setTimeout(x, 30));
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(antes + 5000);
    const i = await itemDe(ciclo, 'Cheddar fatiado');
    const contado = ((antes - 100) / 1000).toString().replace('.', ',');
    const res = await contarNaContagem(a, OPERADOR(), ids.vp, ciclo, { itemId: i.id, embalagens: '', solto: contado, escala: 'base', versao: i.versao, idadeMs: Date.now() - t0 }, 'Caio');
    // −100 g × R$ 18,98 = R$ 1,90 cabe na tolerância, mas entrou nota depois de contar: o gerente confere.
    expect(res).toMatchObject({ ok: true });
    expect('fechouSozinha' in res && res.fechouSozinha).toBeFalsy();
    const conf = (await conferenciaDaContagem(a, GERENTE(), ids.vp, ciclo))!;
    const ch = conf.linhas[0];
    expect(ch).toMatchObject({ esperadoMilesimos: antes, atualMilesimos: antes + 5000 });
    expect(ch.div).toMatchObject({ diferencaMilesimos: -100, mudouDepoisMilesimos: 5000, ficaEmMilesimos: antes + 4900, dentroDaTolerancia: true });
    expect(ch.depois).toEqual([expect.objectContaining({ tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 5000 })]);
    const item = (await a.contagemItem.findUnique({ where: { id: i.id }, select: { contadoEm: true } }))!;
    expect(Math.abs(item.contadoEm!.getTime() - t0)).toBeLessThan(25);
    expect(await concluir(GERENTE(), ciclo)).toMatchObject({ ok: true });
    // Certo: a nota fica. (O ataque dava saldo = contado, apagando os 5 kg.)
    expect((await saldo(ids.cheddar))!.quantidadeMilesimos).toBe(antes + 4900);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('decisão 76: rascunho de 2 dias vale para o início da contagem (nunca antes); idade negativa ou lixo = agora; corrigir número depois da nota segue a mesma regra', async () => {
    await new Promise((x) => setTimeout(x, 30));
    const r = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [ids.presunto], titulo: 'Dois dias' }, 'Gil');
    const ciclo = (r as { id: string }).id;
    const antes = Number((await saldo(ids.presunto))!.quantidadeMilesimos);
    await new Promise((x) => setTimeout(x, 30));
    await lancarNota(a, DONA(), { ...notaDeCheddar('602', '2', '60,00'), itens: [{ insumoId: ids.presunto, embalagem: 'padrao', quantidade: '2', valor: '60,00' }] }, 'Marina');
    const i = await itemDe(ciclo, 'Presunto');
    const txt = (m: number) => (m / 1000).toString().replace('.', ',');
    const r1 = await contarNaContagem(a, OPERADOR(), ids.vp, ciclo, { itemId: i.id, embalagens: '', solto: txt(antes), escala: 'base', versao: i.versao, idadeMs: 2 * 86_400_000 }, 'Caio');
    expect(r1).toMatchObject({ ok: true });
    expect('fechouSozinha' in r1 && r1.fechouSozinha).toBeFalsy();
    const c1 = (await a.contagemItem.findUnique({ where: { id: i.id }, select: { contadoEm: true, saldoSistemaMilesimos: true, versao: true } }))!;
    const criada = (await a.contagem.findUnique({ where: { id: ciclo }, select: { criadoEm: true } }))!.criadoEm;
    expect(c1.contadoEm!.getTime()).toBe(criada.getTime());
    expect(c1.saldoSistemaMilesimos).toBe(antes);
    // A pessoa recontou AGORA (idade 0, ou lixo, ou negativa): o esperado já inclui a nota — e o número novo também.
    const r2 = await contarNaContagem(a, OPERADOR(), ids.vp, ciclo, { itemId: i.id, embalagens: '', solto: txt(antes + 2000), escala: 'base', versao: c1.versao, idadeMs: -5000 }, 'Caio');
    expect(r2).toMatchObject({ ok: true, fechouSozinha: true });
    expect((await saldo(ids.presunto))!.quantidadeMilesimos).toBe(antes + 2000);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('isolamento: o parceiro B não enxerga as contagens, o período nem as regras de A', async () => {
    expect(await b.contagem.count()).toBe(0);
    expect(await obterContagem(b, DONA(), ids.vp, ids.ciclo)).toBeNull();
    expect(await conferenciaDaContagem(b, DONA(), ids.vp, ids.ciclo)).toBeNull();
    expect(await situacaoDoPeriodo(b, DONA(), ids.vp)).toBeNull();
    expect(await iniciarCiclo(b, DONA(), ids.vp, { insumoIds: [ids.cheddar], titulo: '' }, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await concluirContagem(b, DONA(), ids.vp, ids.ciclo, { versao: 0, confirmarNaoContados: true }, 'Bia')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await contarNaContagem(b, DONA(), ids.vp, ids.ciclo, { itemId: 'x', embalagens: '', solto: '1', escala: 'base', versao: 0 }, 'Bia')).toMatchObject({ ok: false });
  });
});
