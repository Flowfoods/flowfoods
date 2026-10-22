/**
 * ERP 3.1 · Produção do pré-preparo no Postgres de verdade (a análise 3.1, critérios 1 a 18):
 * - planejar: a ordem PLANEJADA e a requisição dela nascem juntas (Cheddar 2,5 kg · Leite 2,5 L · Cebola 885 g), nada no
 *   livro; o mesmo formulário duas vezes = uma ordem; 10 planejamentos juntos = 10 lotes diferentes;
 * - concluir só com a requisição atendida; o custo do lote são as baixas reais (R$ 117,81), o lote entra no insumo
 *   produzido da loja (UM `PRODUCAO_ENTRADA`), rendimento e diferença em R$, validade pela conservação escolhida;
 * - fora de ±10% pede o motivo; 0 = lote perdido; leite sem preço = custo incompleto, nunca R$ 0,00;
 * - concluir duas vezes (em paralelo) = uma entrada;
 * - cancelar só com a saída líquida zero; estornar exige `estoque.ajustar`;
 * - devolver depois de concluído é recusado; período fechado: concluir e entregar ESPERAM o fechamento (trava mutante);
 * - alcance: o gerente da Delivery não vê a Penha; outro parceiro não existe; custo só para quem vê custos;
 * - o banco: o lote só entra no insumo produzido da loja da ordem, e a ordem concluída não muda por SQL cru.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { editarInsumo, obterInsumo } from '@/lib/erp/insumos';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha, editarFicha, obterFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, cancelarRequisicao, devolverItem, obterRequisicao, quadroDeRequisicoes } from '@/lib/erp/requisicao';
import { cancelarProducao, concluirProducao, estornarProducao, iniciarProducao, listaDaProducao, lojasDaProducao, obterOrdem, opcoesDaProducao, planejarProducao, quadroDaProducao } from '@/lib/erp/producao';
import { listarHistorico } from '@/lib/erp/historico';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { centavosDaFracao, formatarFracao } from '@/lib/erp/unidades';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;
/** O Intl põe um espaço sem quebra depois do R$: a prova compara com espaço comum. */
const reais = (f: Parameters<typeof formatarFracao>[0]) => formatarFracao(f).replace(/\u00a0/g, ' ');
const AUTOR_COZINHA = { nome: 'Caio Cozinha', userId: 'u-caio' };
const AUTOR_GERENTE = { nome: 'Gil Gerente', userId: 'u-gil' };

describe.skipIf(!URL_TESTE)('ERP 3.1 · produção do pré-preparo pela ficha (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Perfil próprio "Cozinha": produz, mas não vê custos nem estoque.
  const COZINHA_SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);

  let envio = 0;
  const novoEnvio = () => `envio-${sufixo}-${++envio}`.padEnd(12, 'x');
  /** Planeja `qtd` kg do molho para o dia (hoje por padrão), com a lista que a ficha pede. */
  const planejar = async (alcance: Alcance, qtd = '5', extra: { paraDia?: string; agora?: Date; envio?: string; loja?: string; linhas?: { insumoId: string; quantidade: string; escala: string }[] } = {}) => {
    const lista = await listaDaProducao(a, alcance, extra.loja ?? ids.vp, ids.molho, qtd);
    if (!lista.ok) return lista;
    return planejarProducao(
      a,
      alcance,
      extra.loja ?? ids.vp,
      { fichaId: ids.molho, quantidade: qtd, paraDia: extra.paraDia ?? 'hoje', observacao: '', linhas: extra.linhas ?? lista.linhas, envio: extra.envio ?? novoEnvio() },
      AUTOR_COZINHA,
      extra.agora,
    );
  };
  const lote = async (id: string, alcance: Alcance = DONA()) => (await obterOrdem(a, alcance, ids.vp, id))!;
  const entregarTudo = async (id: string, agora?: Date) => {
    const l = await lote(id);
    const r = await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id);
    return atenderRequisicao(
      a,
      GERENTE(),
      ids.vp,
      r!.requisicao.id,
      { versao: r!.requisicao.versao, linhas: r!.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false },
      'Edu Estoque',
      agora,
    );
  };
  const concluir = async (id: string, produzido: string, extra: { motivo?: string; conservacao?: string; agora?: Date; alcance?: Alcance; escala?: string } = {}) => {
    const l = await lote(id);
    return concluirProducao(a, extra.alcance ?? OPERADOR(), ids.vp, id, { versao: l.ordem.versao, produzido, escala: extra.escala ?? 'base', motivo: extra.motivo ?? '', conservacao: extra.conservacao ?? '' }, AUTOR_COZINHA, extra.agora);
  };
  const saldo = async (insumoId: string) => (await a.saldoEstoque.findFirst({ where: { lojaId: ids.vp, insumoId }, select: { quantidadeMilesimos: true, valorCentavos: true } })) ?? { quantidadeMilesimos: 0, valorCentavos: 0 };
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

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Produção A', slug: `producao-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Produção B', slug: `producao-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    // Pelo portão (como o app): com FORCE RLS, escrever pelo cliente cru em tabela de tenant falha.
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    // A Penha abriu o estoque há 10 dias: cheddar 20 kg, leite 20 L, cebola 10 kg. O molho (insumo produzido) nasce depois: zero.
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '20', Leite: '20', Cebola: '10' };
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    // Molho cheddar: rende 2 kg. Cheddar 1 kg (R$ 40,00) + leite 1 L (R$ 5,00) + cebola 300 g limpos, fator 1,18 (354 g a R$ 6,00/kg).
    // Previsto pela ficha: R$ 47,124 ÷ 2 kg = R$ 23,562/kg. Refrigerado 3 dias (principal), congelado 30.
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
          { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' },
        ],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } } },
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
    ids.insumoMolho = (await a.insumo.findFirst({ where: { nome: 'Molho cheddar' } }))!.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('a lista e as opções só trazem pré-preparo que vira insumo; quem não registra produção não recebe', async () => {
    const o = (await opcoesDaProducao(a, OPERADOR(), ids.vp))!;
    expect(o.fichas.map((f) => [f.nome, f.unidade, f.validade])).toEqual([['Molho cheddar', 'KG', 'Refrigerado 3 dias · Congelado 30 dias']]);
    expect(o.aberto).toBe(true);
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '5');
    expect(lista).toMatchObject({ ok: true, ficha: { nome: 'Molho cheddar', quantidadeMilesimos: 5000 } });
    if (lista.ok) expect(Object.fromEntries(lista.linhas.map((l) => [l.insumoId, l.quantidade]))).toEqual({ [ids.cebola]: '0,885', [ids.cheddar]: '2,5', [ids.leite]: '2,5' });
    // Prato não se produz; ficha de outro parceiro não existe; quantidade absurda é frase.
    const prato = await a.fichaTecnica.create({ data: { parceiroId: A.id, nome: 'Burger', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' } });
    expect(await listaDaProducao(a, OPERADOR(), ids.vp, prato.id, '1')).toMatchObject({ ok: false, erros: { ficha: expect.stringMatching(/Só se produz pré-preparo/) } });
    expect(await listaDaProducao(b, alcanceDe('DONO', 'rede'), ids.lojaB, ids.molho, '1')).toMatchObject({ ok: false, erros: { ficha: 'Escolha a ficha técnica.' } });
    expect(await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '10001')).toMatchObject({ ok: false, erros: { quantidade: expect.any(String) } });
    expect(await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '0')).toMatchObject({ ok: false });
    // Quem só VÊ produção (perfil sem registrar) não planeja.
    const soVe = alcanceDe(null, [ids.vp], ['producao.ver']);
    expect(await listaDaProducao(a, soVe, ids.vp, ids.molho, '5')).toMatchObject({ ok: false });
    expect(await opcoesDaProducao(a, soVe, ids.vp)).toBeNull();
  });

  let L1: string; // 5 kg, concluído com 4,6 kg
  let REQ1: string;

  it('critério 1: o cozinheiro planeja 5 kg para hoje: ordem PLANEJADA com lote AAMMDD-01 e a requisição #N da COZINHA (Cheddar 2,5 kg · Leite 2,5 L · Cebola 885 g); nada no livro', async () => {
    const movsAntes = await a.movimentoEstoque.count();
    const r = await planejar(OPERADOR(), '5');
    expect(r).toMatchObject({ ok: true });
    L1 = (r as { id: string }).id;
    const l = await lote(L1);
    const codigoDeHoje = `${hoje.slice(2, 4)}${hoje.slice(5, 7)}${hoje.slice(8, 10)}-01`;
    expect(l.ordem).toMatchObject({ status: 'PLANEJADA', codigoLote: codigoDeHoje, fichaNome: 'Molho cheddar', planejadoMilesimos: 5000, unidade: 'KG', dataPlanejada: hoje, planejadaPorNome: 'Caio Cozinha', versao: 0 });
    expect(l.requisicao).toMatchObject({ status: 'ABERTA', numero: 1 });
    REQ1 = l.requisicao!.id;
    const req = (await obterRequisicao(a, DONA(), ids.vp, REQ1))!;
    expect(req.requisicao).toMatchObject({ setor: 'COZINHA', paraDia: hoje, pedidaPorNome: 'Caio Cozinha', fichaNomeSnapshot: 'Molho cheddar', fichaQuantidadeMilesimos: 5000 });
    expect(req.itens.map((i) => [i.nome, i.solicitadoMilesimos]).sort()).toEqual([['Cebola', 885], ['Leite', 2500], ['Queijo cheddar', 2500]].sort());
    expect(req.producao).toMatchObject({ id: L1, codigoLote: codigoDeHoje });
    expect(await a.movimentoEstoque.count()).toBe(movsAntes);
    expect(await a.movimentoEstoque.count({ where: { tipo: { in: ['PRODUCAO_ENTRADA', 'PRODUCAO_CONSUMO'] } } })).toBe(0);
    const h = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [L1] }], limite: 5, verPrecos: false, verCustos: true });
    expect(h[0]).toMatchObject({ acao: 'PLANEJOU', autorNome: 'Caio Cozinha' });
    // A requisição de produção entra no quadro de requisições com o lote dela.
    const q = (await quadroDeRequisicoes(a, DONA(), ids.vp))!;
    expect(q.colunas.ABERTA.find((c) => c.id === REQ1)?.lote).toBe(codigoDeHoje);
  });

  it('critério 2: planejar duas vezes com o mesmo formulário = 1 ordem; 10 planejamentos juntos no mesmo dia = lotes -01 a -10 sem repetição', async () => {
    const mesmo = novoEnvio();
    const x = await planejar(OPERADOR(), '1', { envio: mesmo });
    const y = await planejar(OPERADOR(), '1', { envio: mesmo });
    expect(x).toMatchObject({ ok: true });
    expect(y).toMatchObject({ ok: true, jaFeito: true, id: (x as { id: string }).id });
    // A chave de uma loja não serve a outra (nem entrega o id de lá).
    expect(await planejar(DONA(), '1', { envio: mesmo, loja: ids.delivery })).toMatchObject({ ok: false });
    expect(await a.ordemProducao.count({ where: { chaveIdempotencia: mesmo } })).toBe(1);
    // Cancela o de teste (sai da frente) e dispara 10 de uma vez, em outro dia (hoje + 2) para os números começarem em 01.
    const dia = new Date(Date.now() + 2 * DIA);
    const diaIso = hojeNoRio(dia);
    const resultados = await Promise.all(Array.from({ length: 10 }, () => planejar(OPERADOR(), '1', { paraDia: diaIso })));
    expect(resultados.every((r) => r.ok)).toBe(true);
    const codigos = (await a.ordemProducao.findMany({ where: { dataPlanejada: new Date(`${diaIso}T00:00:00Z`) }, select: { codigoLote: true } })).map((o) => o.codigoLote).sort();
    const prefixo = `${diaIso.slice(2, 4)}${diaIso.slice(5, 7)}${diaIso.slice(8, 10)}`;
    expect(codigos).toEqual(Array.from({ length: 10 }, (_, i) => `${prefixo}-${String(i + 1).padStart(2, '0')}`));
    // Os números das requisições também não repetem (uma por ordem).
    const nums = (await a.requisicao.findMany({ where: { lojaId: ids.vp }, select: { numero: true } })).map((r) => r.numero);
    expect(new Set(nums).size).toBe(nums.length);
    // Limpa o ruído para os próximos testes.
    for (const r of resultados) {
      const l = await lote((r as { id: string }).id);
      expect(await cancelarProducao(a, OPERADOR(), ids.vp, l.ordem.id, { versao: l.ordem.versao, motivo: 'teste de corrida' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
    }
    const outro = await lote((x as { id: string }).id);
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, outro.ordem.id, { versao: outro.ordem.versao, motivo: 'teste do mesmo envio' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
  });

  it('planejar: dia fora de hoje a 14 dias, loja sem estoque aberto, observação longa e item de outro parceiro são recusados (nada gravado)', async () => {
    const ordens = await a.ordemProducao.count();
    const reqs = await a.requisicao.count();
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '2');
    if (!lista.ok) throw new Error('lista');
    const base = { fichaId: ids.molho, quantidade: '2', observacao: '', linhas: lista.linhas, envio: novoEnvio() };
    const ontem = hojeNoRio(new Date(Date.now() - DIA));
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { ...base, paraDia: ontem }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { paraDia: expect.stringMatching(/de hoje em diante/) } });
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { ...base, paraDia: hojeNoRio(new Date(Date.now() + 15 * DIA)) }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { paraDia: expect.stringMatching(/até 14 dias/) } });
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { ...base, paraDia: 'hoje', observacao: 'x'.repeat(281) }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { observacao: expect.any(String) } });
    expect(await planejarProducao(a, DONA(), ids.delivery, { ...base, paraDia: 'hoje' }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi aberto/) } });
    const deB = await cadastrarInsumo(b, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo de B', unidade: 'KG', conteudo: '1', preco: '1,00', conservacao: 'SECO' });
    expect(deB.ok).toBe(true);
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { ...base, paraDia: 'hoje', linhas: [{ insumoId: (deB as { id: string }).id, quantidade: '1', escala: 'base' }] }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { 'item:0': 'Escolha o insumo.' } });
    expect(await planejarProducao(a, OPERADOR(), ids.vp, { ...base, paraDia: 'hoje', linhas: [] }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { itens: expect.any(String) } });
    // Gerente da Delivery não registra produção na Penha: a loja nem existe para ele.
    expect(await planejarProducao(a, GERENTE_DELIVERY(), ids.vp, { ...base, paraDia: 'hoje' }, AUTOR_COZINHA)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await a.ordemProducao.count()).toBe(ordens);
    expect(await a.requisicao.count()).toBe(reqs);
  });

  it('critério 3: o operador tenta concluir antes da entrega: "Faltam sair…", nada gravado', async () => {
    const r = await concluir(L1, '4,6');
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/^Faltam sair .*885 g de Cebola.* pela requisição #1: entregue ou encerre o resto\.$/) } });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA' } })).toBe(0);
    expect((await lote(L1)).ordem.status).toBe('PLANEJADA');
  });

  it('o operador não entrega: a baixa é do estoque (separação de funções)', async () => {
    const r = await obterRequisicao(a, DONA(), ids.vp, REQ1);
    expect(await atenderRequisicao(a, OPERADOR(), ids.vp, REQ1, { versao: r!.requisicao.versao, linhas: [], encerrar: true, confirmarNegativo: false }, 'Caio')).toMatchObject({ ok: false });
  });

  it('iniciar (opcional): vai para EM_EXECUCAO; iniciar de novo é "já feito"', async () => {
    const l = await lote(L1);
    // 3.3: começar é pegar; a conclusão (critério 5, relógio fixo em 17/10 10:00) não pode vir antes de pegar: pega às 09:00.
    const pegouEm = new Date('2026-10-17T12:00:00Z');
    expect(await iniciarProducao(a, OPERADOR(), ids.vp, L1, { versao: l.ordem.versao }, AUTOR_COZINHA, pegouEm)).toMatchObject({ ok: true });
    expect(await iniciarProducao(a, OPERADOR(), ids.vp, L1, { versao: l.ordem.versao }, AUTOR_COZINHA, pegouEm)).toMatchObject({ ok: true, jaFeito: true });
    const depois = await lote(L1);
    expect(depois.ordem).toMatchObject({ status: 'EM_EXECUCAO', iniciadaPorNome: 'Caio Cozinha' });
    expect(depois.ordem.iniciadaEm).toBeInstanceOf(Date);
  });

  it('critério 4: o gerente entrega tudo: 3 REQUISICAO somando −R$ 117,81 (100,00 + 12,50 + 5,31)', async () => {
    expect(await entregarTudo(L1)).toMatchObject({ ok: true });
    const movs = await a.movimentoEstoque.findMany({ where: { tipo: 'REQUISICAO' }, select: { insumoNomeSnapshot: true, quantidadeMilesimos: true, valorCentavos: true }, orderBy: { insumoNomeSnapshot: 'asc' } });
    expect(movs.map((m) => [m.insumoNomeSnapshot, m.quantidadeMilesimos, m.valorCentavos])).toEqual([
      ['Cebola', -885, -531],
      ['Leite', -2500, -1250],
      ['Queijo cheddar', -2500, -10000],
    ]);
    expect(movs.reduce((s, m) => s + m.valorCentavos, 0)).toBe(-11781);
    expect((await lote(L1)).requisicao?.status).toBe('ATENDIDA');
    // Só quem vê custos recebe o R$ do lote (o operador do perfil próprio não).
    expect((await lote(L1, COZINHA_SEM_CUSTO())).custo).toBeNull();
    expect((await lote(L1, COZINHA_SEM_CUSTO())).itensDoLote.every((i) => i.valorCentavos === null)).toBe(true);
    expect((await lote(L1)).custo).toMatchObject({ totalCentavos: 11781, semPreco: [] });
  });

  it('critério 5: o operador conclui 4,6 kg (8% abaixo, sem motivo obrigatório): 1 PRODUCAO_ENTRADA +4,600 kg / +R$ 117,81 no insumo da Penha; R$ 25,61/kg; previsto R$ 23,56/kg; rendimento 92%; diferença 400 g = R$ 9,42; validade pelo refrigerado', async () => {
    const agora = new Date('2026-10-17T13:00:00Z'); // 10:00 no Rio
    const r = await concluir(L1, '4,6', { agora });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    const l = await lote(L1);
    expect(l.ordem).toMatchObject({ status: 'CONCLUIDA', produzidoMilesimos: 4600, concluidaPorNome: 'Caio Cozinha', conservacao: 'REFRIGERADO', validadeMin: 4320, motivoRendimento: null, estornado: false });
    expect(l.ordem.validadeEm!.toISOString()).toBe('2026-10-20T13:00:00.000Z'); // 20/10 às 10:00 no Rio
    const ordem = await a.ordemProducao.findUnique({ where: { id: L1 } });
    expect(ordem).toMatchObject({ custoTotalCentavos: 11781, insumosSemPreco: 0, responsavelUsuarioId: 'u-caio', responsavelNomeSnapshot: 'Caio Cozinha' });
    const entrada = await a.movimentoEstoque.findMany({ where: { tipo: 'PRODUCAO_ENTRADA' } });
    expect(entrada).toHaveLength(1);
    expect(entrada[0]).toMatchObject({ lojaId: ids.vp, insumoId: ids.insumoMolho, quantidadeMilesimos: 4600, valorCentavos: 11781, ordemProducaoId: L1, chaveIdempotencia: `producao:${L1}`, saldoAntesMilesimos: 0, saldoDepoisMilesimos: 4600 });
    expect(await saldo(ids.insumoMolho)).toEqual({ quantidadeMilesimos: 4600, valorCentavos: 11781 });
    // O custo do lote: baixas ÷ produzido, exato; o previsto vem da cascata da ficha.
    expect(l.custo!.totalCentavos).toBe(11781);
    expect(reais(l.custo!.porUnidade!)).toBe('R$ 25,61');
    expect(reais(l.custo!.previstoPorUnidade!)).toBe('R$ 23,56');
    expect(l.rendimento).toMatchObject({ rendimentoBp: 9200, diferencaMilesimos: 400, foraDaFaixa: false });
    expect(centavosDaFracao(l.custo!.perda!)).toBe(942n);
    expect(l.saldoNaLoja).toBe(4600);
    expect(l.movimentos.map((m) => [m.tipo, m.quantidadeMilesimos, m.valorCentavos])).toEqual([['PRODUCAO_ENTRADA', 4600, 11781]]);
    // O custo de referência do molho NÃO muda com o lote (continua a cascata da ficha).
    const ins = (await obterInsumo(a, ids.insumoMolho, DONA()))!;
    expect(reais(ins.preparo!.porUnidade)).toBe('R$ 23,56');
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    const h = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [L1] }], limite: 5, verPrecos: false, verCustos: true });
    expect(h[0]).toMatchObject({ acao: 'CONCLUIU' });
    expect(h[0].mudancas.map((m) => [m.campo, m.depois.replace(/\u00a0/g, ' ')])).toEqual(
      expect.arrayContaining([['saiu', '4,6 kg'], ['rendimento', '92%'], ['custo do lote', 'R$ 117,81 (R$ 25,61/kg)']]),
    );
    // Sem custos, o histórico do mesmo lote não leva o R$.
    const sem = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [L1] }], limite: 5, verPrecos: false });
    expect(sem[0].mudancas.map((m) => m.campo)).not.toEqual(expect.arrayContaining(['custo do lote']));
    expect(JSON.stringify(sem)).not.toMatch(/117,81|25,61/);
  });

  it('critério 8: concluir de novo (2 abas, em paralelo) = 1 entrada só; a segunda vê "já concluído"', async () => {
    const l = await lote(L1);
    const dados = { versao: l.ordem.versao, produzido: '4,6', escala: 'base', motivo: '', conservacao: '' };
    const r = await Promise.all([concluirProducao(a, OPERADOR(), ids.vp, L1, dados, AUTOR_COZINHA), concluirProducao(a, OPERADOR(), ids.vp, L1, dados, AUTOR_COZINHA)]);
    expect(r.every((x) => x.ok && x.jaFeito === true)).toBe(true);
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA' } })).toBe(1);
  });

  it('critério 13: devolver item da requisição de um lote concluído é recusado, e cancelar a requisição solta também', async () => {
    const r = (await obterRequisicao(a, DONA(), ids.vp, REQ1))!;
    const item = r.itens.find((i) => i.nome === 'Leite')!;
    const rec = await devolverItem(a, GERENTE(), ids.vp, REQ1, { versao: r.requisicao.versao, itemId: item.id, quantidade: '1', escala: 'base', motivo: '' }, 'Gil');
    expect(rec).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/lote \d{6}-01 já foi concluído/) } });
    // Entregar também: o custo do lote já fechou (sem a conferência, a requisição ATENDIDA responderia "já feito").
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, REQ1, { versao: r.requisicao.versao, linhas: [], encerrar: true, confirmarNegativo: false }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/lote \d{6}-01 já foi concluído.*não recebe mais entrega/) } });
    expect(await cancelarRequisicao(a, GERENTE(), ids.vp, REQ1, { motivo: 'quero cancelar' }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/é do lote/) } });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } })).toBe(3);
  });

  it('critério 6 e 7: 4,4 kg (12% abaixo) pede motivo; com motivo grava e mostra; congelado vence 30 dias depois; mudar a ficha depois não muda o lote', async () => {
    const r = await planejar(OPERADOR(), '5');
    const id = (r as { id: string }).id;
    expect(await entregarTudo(id)).toMatchObject({ ok: true });
    const agora = new Date('2026-10-17T13:00:00Z');
    expect(await concluir(id, '4,4')).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/4,4 kg de 5 kg planejados \(88%\): diga o motivo/) } });
    expect((await lote(id)).ordem.status).toBe('PLANEJADA');
    // 10% exatos (4,5 kg) ainda é dentro da faixa.
    expect(await concluir(id, '5,6')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await concluir(id, '4,4', { motivo: 'Evaporou mais do que o normal', conservacao: 'CONGELADO', agora })).toMatchObject({ ok: true });
    const l = await lote(id);
    expect(l.ordem).toMatchObject({ produzidoMilesimos: 4400, motivoRendimento: 'Evaporou mais do que o normal', conservacao: 'CONGELADO', validadeMin: 43200 });
    expect(l.ordem.validadeEm!.toISOString()).toBe('2026-11-16T13:00:00.000Z'); // 16/11 às 10:00
    expect(l.rendimento).toMatchObject({ rendimentoBp: 8800, foraDaFaixa: true });
    // Mudar a ficha (nova validade) não mexe no lote já concluído.
    const ficha = (await obterFicha(a, ids.molho))!;
    const ed = await editarFicha(a, ids.molho, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }], versao: ficha.versao, validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '5', em: 'dias' } } } }, { tipo: 'manter' }, 'Marina');
    expect(ed, JSON.stringify(ed)).toMatchObject({ ok: true });
    const depois = await lote(id);
    expect(depois.ordem).toMatchObject({ conservacao: 'CONGELADO', validadeMin: 43200 });
    expect(depois.ordem.validadeEm!.toISOString()).toBe('2026-11-16T13:00:00.000Z');
    // Devolve a validade original da ficha para os testes seguintes.
    const f2 = (await obterFicha(a, ids.molho))!;
    expect(await editarFicha(a, ids.molho, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }], versao: f2.versao, validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } } } }, { tipo: 'manter' }, 'Marina')).toMatchObject({ ok: true });
    // Conservação que a ficha não aceita é recusada.
    const r2 = await planejar(OPERADOR(), '2');
    const id2 = (r2 as { id: string }).id;
    expect(await entregarTudo(id2)).toMatchObject({ ok: true });
    expect(await concluir(id2, '2', { conservacao: 'SECO' })).toMatchObject({ ok: false, erros: { conservacao: expect.stringMatching(/não aceita/) } });
    expect(await concluir(id2, '3,000001', {})).toMatchObject({ ok: false, erros: { produzido: expect.any(String) } });
    expect(await concluir(id2, '4,1')).toMatchObject({ ok: false, erros: { produzido: expect.stringMatching(/passa do dobro/) } });
    expect(await concluir(id2, '', {})).toMatchObject({ ok: false, erros: { produzido: expect.any(String) } });
    expect(await concluir(id2, '2')).toMatchObject({ ok: true });
  });

  it('critério 10: concluir com 0 kg exige motivo; nenhum PRODUCAO_ENTRADA novo; rendimento 0%; diferença = o custo todo', async () => {
    const entradas = await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA' } });
    const id = ((await planejar(OPERADOR(), '5')) as { id: string }).id;
    expect(await entregarTudo(id)).toMatchObject({ ok: true });
    expect(await concluir(id, '0')).toMatchObject({ ok: false, erros: { motivo: expect.stringMatching(/Lote perdido/) } });
    expect(await concluir(id, '0', { motivo: 'Queimou no fundo da panela' })).toMatchObject({ ok: true });
    const l = await lote(id);
    expect(l.ordem).toMatchObject({ status: 'CONCLUIDA', produzidoMilesimos: 0, motivoRendimento: 'Queimou no fundo da panela', conservacao: null, validadeEm: null });
    expect(l.rendimento).toMatchObject({ rendimentoBp: 0, diferencaMilesimos: 5000 });
    expect(centavosDaFracao(l.custo!.perda!)).toBe(11781n);
    expect(l.custo!.porUnidade).toBeNull();
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA' } })).toBe(entradas); // o lote perdido não entra no estoque
  });

  it('critério 9: leite sem preço: custo "incompleto (sem contar Leite)", nunca R$ 0,00; insumosSemPreco = 1', async () => {
    const leite = (await obterInsumo(a, ids.leite, DONA()))!;
    const sem = await editarInsumo(a, ids.leite, { nome: 'Leite', tipo: 'INGREDIENTE', unidade: 'L', conservacao: 'REFRIGERADO', conteudo: '1', escala: 'base', semPreco: 'on', versao: leite.versao });
    expect(sem, JSON.stringify(sem)).toMatchObject({ ok: true });
    const id = ((await planejar(OPERADOR(), '5')) as { id: string }).id;
    expect(await entregarTudo(id)).toMatchObject({ ok: true });
    const antes = await lote(id);
    expect(antes.custo).toMatchObject({ totalCentavos: 10531, semPreco: ['Leite'] });
    expect(await concluir(id, '4,8')).toMatchObject({ ok: true });
    const l = await lote(id);
    expect(l.ordem.insumosSemPreco).toBe(1);
    expect(l.custo).toMatchObject({ totalCentavos: 10531, semPreco: ['Leite'] });
    expect(l.itensDoLote.find((i) => i.nome === 'Leite')).toMatchObject({ semPreco: true, saiuMilesimos: 2500 });
    // Volta o preço do leite para o resto do roteiro.
    const l2 = (await obterInsumo(a, ids.leite, DONA()))!;
    expect(await editarInsumo(a, ids.leite, { nome: 'Leite', tipo: 'INGREDIENTE', unidade: 'L', conservacao: 'REFRIGERADO', conteudo: '1', escala: 'base', preco: '5,00', versao: l2.versao })).toMatchObject({ ok: true });
  });

  it('critério 11: cancelar planejada sem entrega cancela a ordem e a requisição; com 2,5 kg de cheddar entregue, recusa até devolver (e a requisição solta não se cancela)', async () => {
    const id = ((await planejar(OPERADOR(), '5')) as { id: string }).id;
    const l = await lote(id);
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: l.ordem.versao, motivo: 'a' }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: l.ordem.versao, motivo: 'Mudou o cardápio' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: l.ordem.versao, motivo: 'Mudou o cardápio' }, AUTOR_COZINHA)).toMatchObject({ ok: true, jaFeito: true });
    const c = await lote(id);
    expect(c.ordem).toMatchObject({ status: 'CANCELADA', motivoCancelamento: 'Mudou o cardápio', canceladaPorNome: 'Caio Cozinha' });
    expect(c.requisicao?.status).toBe('CANCELADA');
    // O código do lote cancelado nunca é reaproveitado: o próximo é o seguinte.
    const prox = (await planejar(OPERADOR(), '1')) as { id: string };
    const codigos = [c.ordem.codigoLote, (await lote(prox.id)).ordem.codigoLote];
    expect(new Set(codigos).size).toBe(2);
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, prox.id, { versao: 0, motivo: 'só para limpar' }, AUTOR_COZINHA)).toMatchObject({ ok: true });

    // Entrega parcial: só o cheddar (2,5 kg); cancelar o lote é recusado até devolver.
    const id2 = ((await planejar(OPERADOR(), '5')) as { id: string }).id;
    const l2 = await lote(id2);
    const rq = (await obterRequisicao(a, DONA(), ids.vp, l2.requisicao!.id))!;
    const cheddar = rq.itens.find((i) => i.nome === 'Queijo cheddar')!;
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, rq.requisicao.id, { versao: rq.requisicao.versao, linhas: [{ itemId: cheddar.id, quantidade: '2,5', escala: 'base' }], encerrar: false, confirmarNegativo: false }, 'Edu')).toMatchObject({ ok: true });
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id2, { versao: l2.ordem.versao, motivo: 'Não vai mais' }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Já saiu estoque pela requisição.*Queijo cheddar 2,5 kg/) } });
    const rq2 = (await obterRequisicao(a, DONA(), ids.vp, l2.requisicao!.id))!;
    expect(await devolverItem(a, GERENTE(), ids.vp, rq2.requisicao.id, { versao: rq2.requisicao.versao, itemId: cheddar.id, quantidade: '2,5', escala: 'base', motivo: 'não usou' }, 'Edu')).toMatchObject({ ok: true });
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id2, { versao: l2.ordem.versao, motivo: 'Não vai mais' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
    const c2 = await lote(id2);
    expect(c2.ordem.status).toBe('CANCELADA');
    expect(c2.requisicao?.status).toBe('CANCELADA');
    // Cancelada a ordem, a requisição dela não recebe mais entrega.
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, l2.requisicao!.id, { versao: 99, linhas: [], encerrar: true, confirmarNegativo: false }, 'Edu')).toMatchObject({ ok: false });
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('critério 12: o gerente estorna a concluída com motivo (espelho −4,6 kg / −R$ 117,81; CANCELADA que guarda concluidaEm); o operador recebe recusa', async () => {
    const l = await lote(L1);
    expect(await estornarProducao(a, OPERADOR(), ids.vp, L1, { versao: l.ordem.versao, motivo: 'Lote contaminado', confirmarNegativo: false }, AUTOR_COZINHA)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/mexe no saldo/) } });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'PRODUCAO_ENTRADA', estornoDeId: { not: null } } })).toBe(0);
    expect(await estornarProducao(a, GERENTE(), ids.vp, L1, { versao: l.ordem.versao, motivo: '', confirmarNegativo: false }, AUTOR_GERENTE)).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    // O saldo do molho é de 4,6 + 4,4 + 2 + 4,8 − …: tem de sobra, então não pede confirmação.
    expect(await estornarProducao(a, GERENTE(), ids.vp, L1, { versao: l.ordem.versao, motivo: 'Lote contaminado', confirmarNegativo: false }, AUTOR_GERENTE)).toMatchObject({ ok: true });
    expect(await estornarProducao(a, GERENTE(), ids.vp, L1, { versao: l.ordem.versao, motivo: 'Lote contaminado', confirmarNegativo: false }, AUTOR_GERENTE)).toMatchObject({ ok: true, jaFeito: true });
    const e = await a.movimentoEstoque.findFirst({ where: { tipo: 'PRODUCAO_ENTRADA', estornoDeId: { not: null }, ordemProducaoId: L1 } });
    expect(e).toMatchObject({ quantidadeMilesimos: -4600, valorCentavos: -11781, ordemProducaoId: L1 });
    const depois = await lote(L1);
    expect(depois.ordem).toMatchObject({ status: 'CANCELADA', estornado: true, motivoCancelamento: 'Lote contaminado', canceladaPorNome: 'Gil Gerente', produzidoMilesimos: 4600 });
    expect(depois.ordem.concluidaEm).toBeInstanceOf(Date);
    expect(depois.movimentos.map((m) => [m.quantidadeMilesimos, m.estorno])).toEqual([[4600, false], [-4600, true]]);
    const h = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [L1] }], limite: 3, verPrecos: false, verCustos: true });
    expect(h[0]).toMatchObject({ acao: 'ESTORNOU', autorNome: 'Gil Gerente', motivo: 'Lote contaminado' });
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    // A requisição do lote estornado continua fechada para entrega e devolução.
    const r = (await obterRequisicao(a, DONA(), ids.vp, REQ1))!;
    expect(await devolverItem(a, GERENTE(), ids.vp, REQ1, { versao: r.requisicao.versao, itemId: r.itens[0].id, quantidade: '0,1', escala: 'base', motivo: '' }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi cancelado/) } });
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, REQ1, { versao: r.requisicao.versao, linhas: [], encerrar: true, confirmarNegativo: false }, 'Gil')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já foi cancelado.*não recebe mais entrega/) } });
  });

  it('estornar quando o lote já foi usado (saldo ficaria abaixo de zero) só com a confirmação; o saldo negativo vira alarme', async () => {
    const id = ((await planejar(OPERADOR(), '5')) as { id: string }).id;
    expect(await entregarTudo(id)).toMatchObject({ ok: true });
    expect(await concluir(id, '4,7')).toMatchObject({ ok: true });
    // Gasta quase todo o molho do estoque numa requisição (a cozinha usou o lote).
    const total = (await saldo(ids.insumoMolho)).quantidadeMilesimos;
    const g = await obterOrdem(a, DONA(), ids.vp, id);
    expect(g).not.toBeNull();
    const { criarRequisicao } = await import('@/lib/erp/requisicao');
    const pedido = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.insumoMolho, quantidade: String(total / 1000).replace('.', ','), escala: 'base' }] }, 'Gil');
    expect(pedido.ok).toBe(true);
    const rq = (await obterRequisicao(a, DONA(), ids.vp, (pedido as { id: string }).id))!;
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, rq.requisicao.id, { versao: rq.requisicao.versao, linhas: rq.itens.map((i) => ({ itemId: i.id, quantidade: String(total / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false }, 'Edu')).toMatchObject({ ok: true });
    expect((await saldo(ids.insumoMolho)).quantidadeMilesimos).toBe(0);
    const l = await lote(id);
    const sem = await estornarProducao(a, GERENTE(), ids.vp, id, { versao: l.ordem.versao, motivo: 'Erro de lançamento', confirmarNegativo: false }, AUTOR_GERENTE);
    expect(sem).toMatchObject({ ok: false, erros: { confirmarNegativo: expect.stringMatching(/abaixo de zero/) } });
    expect((await lote(id)).ordem.status).toBe('CONCLUIDA');
    expect(await estornarProducao(a, GERENTE(), ids.vp, id, { versao: l.ordem.versao, motivo: 'Erro de lançamento', confirmarNegativo: true }, AUTOR_GERENTE)).toMatchObject({ ok: true });
    expect((await saldo(ids.insumoMolho)).quantidadeMilesimos).toBe(-4700);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('critério 14: período fechado — concluir ESPERA o fechamento (trava mutante) e depois é recusado; entregar a requisição também', async () => {
    const agora = new Date('2026-12-15T15:00:00Z');
    const id = ((await planejar(OPERADOR(), '5', { agora })) as { id: string }).id;
    expect(await entregarTudo(id, agora)).toMatchObject({ ok: true });
    // Segura a trava EXCLUSIVA do fechamento e dispara o concluir: ele tem de ESPERAR.
    let terminou = false;
    let concluindo!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      const l = await lote(id);
      concluindo = concluirProducao(a, OPERADOR(), ids.vp, id, { versao: l.ordem.versao, produzido: '4,8', escala: 'base', motivo: '', conservacao: '' }, AUTOR_COZINHA, agora).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou, 'concluirProducao terminou sem esperar o fechamento (falta travarParaEscrever)').toBe(false);
      await criarPeriodoFechadoDeTeste(tx, { nome: 'Dezembro de 2026', inicio: '2026-12-01', fim: '2026-12-31' });
    });
    expect(await concluindo).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Dezembro de 2026 já foi fechado no DRE/) } });
    expect((await lote(id)).ordem.status).toBe('PLANEJADA');
    expect(await a.movimentoEstoque.count({ where: { ordemProducaoId: id } })).toBe(0);
    // Estornar também: recusado no período fechado (a data do estorno é hoje, em dezembro).
    // Entregar a requisição dele: também ESPERA e é recusada. Planeja outro lote com a data dentro do período fechado.
    const id2 = ((await planejar(OPERADOR(), '2', { agora: new Date('2026-12-16T15:00:00Z') })) as { id: string }).id;
    const l2 = await lote(id2);
    const rq = (await obterRequisicao(a, DONA(), ids.vp, l2.requisicao!.id))!;
    expect(
      await atenderRequisicao(a, GERENTE(), ids.vp, rq.requisicao.id, { versao: rq.requisicao.versao, linhas: rq.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false }, 'Edu', new Date('2026-12-16T15:00:00Z')),
    ).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Dezembro de 2026 já foi fechado no DRE/) } });
    expect(await a.movimentoEstoque.count({ where: { requisicaoItem: { requisicaoId: l2.requisicao!.id } } })).toBe(0);
    // Um dia FORA do período fechado segue normal.
    expect(await entregarTudo(id2, new Date('2027-01-05T15:00:00Z'))).toMatchObject({ ok: true });
  });

  it('critério 14 (mutante): entregar a requisição ESPERA o fechamento do período (a trava está na entrega e na devolução)', async () => {
    const agora = new Date('2027-03-10T15:00:00Z');
    const id = ((await planejar(OPERADOR(), '2', { agora })) as { id: string }).id;
    const l = await lote(id);
    const rq = (await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id))!;
    let terminou = false;
    let entrega!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      entrega = atenderRequisicao(a, GERENTE(), ids.vp, rq.requisicao.id, { versao: rq.requisicao.versao, linhas: rq.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false }, 'Edu', agora).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou, 'atenderRequisicao terminou sem esperar o fechamento (falta travarParaEscrever)').toBe(false);
    });
    expect(await entrega).toMatchObject({ ok: true });
    // A devolução também espera.
    const r2 = (await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id))!;
    let devolveu = false;
    let devolucao!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      devolucao = devolverItem(a, GERENTE(), ids.vp, l.requisicao!.id, { versao: r2.requisicao.versao, itemId: r2.itens[0].id, quantidade: '0,1', escala: 'base', motivo: '' }, 'Edu', agora).then((x) => ((devolveu = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(devolveu, 'devolverItem terminou sem esperar o fechamento (falta travarParaEscrever)').toBe(false);
    });
    expect(await devolucao).toMatchObject({ ok: true });
    // O estorno do lote concluído também espera (e usa a mesma trava).
    const r3 = (await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id))!;
    expect(r3.requisicao.status).toBe('ATENDIDA');
  });

  it('critério 14 (mutante): estornar o lote concluído ESPERA o fechamento do período e, depois dele, é recusado', async () => {
    const agora = new Date('2027-05-10T15:00:00Z');
    const id = ((await planejar(OPERADOR(), '2', { agora })) as { id: string }).id;
    expect(await entregarTudo(id, agora)).toMatchObject({ ok: true });
    expect(await concluir(id, '2', { agora })).toMatchObject({ ok: true });
    const l = await lote(id);
    let terminou = false;
    let estornando!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx);
      estornando = estornarProducao(a, GERENTE(), ids.vp, id, { versao: l.ordem.versao, motivo: 'Erro de lançamento', confirmarNegativo: false }, AUTOR_GERENTE, agora).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou, 'estornarProducao terminou sem esperar o fechamento (falta travarParaEscrever)').toBe(false);
      await criarPeriodoFechadoDeTeste(tx, { nome: 'Maio de 2027', inicio: '2027-05-01', fim: '2027-05-31' });
    });
    expect(await estornando).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Maio de 2027 já foi fechado no DRE/) } });
    expect((await lote(id)).ordem.status).toBe('CONCLUIDA');
    expect(await a.movimentoEstoque.count({ where: { ordemProducaoId: id, estornoDeId: { not: null } } })).toBe(0);
  });

  it('critério 15: o gerente da Delivery não abre lote da Penha (404); outro parceiro não existe; o operador vê o quadro, planeja, conclui e vê o R$', async () => {
    expect(await obterOrdem(a, GERENTE_DELIVERY(), ids.vp, L1)).toBeNull();
    expect(await quadroDaProducao(a, GERENTE_DELIVERY(), ids.vp)).toBeNull();
    expect(await obterOrdem(b, DONA(), ids.lojaB, L1)).toBeNull();
    expect(await obterOrdem(a, DONA(), ids.delivery, L1)).toBeNull();
    expect(await obterOrdem(a, DONA(), ids.vp, 'não-existe')).toBeNull();
    // O operador vê o R$ do lote (tem "ver insumos e custos"); a cozinha sem custos não.
    expect((await lote(L1, OPERADOR())).custo).not.toBeNull();
    expect((await lote(L1, COZINHA_SEM_CUSTO())).custo).toBeNull();
    // A lista de lojas só traz a Penha para o gerente dela.
    expect((await lojasDaProducao(a, GERENTE())).map((l) => l.nome)).toEqual(['Vila da Penha']);
    expect((await lojasDaProducao(a, DONA())).map((l) => l.nome)).toEqual(['Delivery', 'Vila da Penha']);
    // O histórico do lote também fecha o custo.
    const h = await listarHistorico(a, { de: [{ entidade: 'OrdemProducao', ids: [L1] }], limite: 20, verPrecos: false });
    expect(JSON.stringify(h)).not.toMatch(/R\$ 117,81/);
  });

  it('critério 16: o quadro — planejada de anteontem com atraso de 2 dias; concluídas e canceladas de hoje; só as da loja', async () => {
    const anteontem = new Date(Date.now() - 2 * DIA);
    const atrasada = await planejar(DONA(), '3', { agora: anteontem });
    expect(atrasada, JSON.stringify(atrasada)).toMatchObject({ ok: true });
    const q = (await quadroDaProducao(a, OPERADOR(), ids.vp))!;
    const cartao = q.colunas.PLANEJADA.find((c) => c.id === (atrasada as { id: string }).id)!;
    expect(cartao.atrasoDias).toBe(2);
    expect(q.colunas.PLANEJADA[0].id).toBe(cartao.id); // as mais atrasadas primeiro
    expect(cartao.requisicao).toMatchObject({ status: 'ABERTA' });
    expect(q.colunas.CONCLUIDA.every((c) => c.status === 'CONCLUIDA')).toBe(true);
    expect(q.colunas.CANCELADA.some((c) => c.id === L1 && c.estornado)).toBe(true);
    expect(q.aberto).toBe(true);
    const cancelada = (await lote((atrasada as { id: string }).id)).ordem;
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, cancelada.id, { versao: cancelada.versao, motivo: 'limpando o teste' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
  });

  it('critério 17: o cheddar baixado pela requisição de produção conta como requisitado (e o molho conta a entrada) no cruzamento', async () => {
    const { divergenciasDaLoja } = await import('@/lib/erp/requisicao');
    // O cruzamento só julga insumo que tem trecho entre contagens; aqui basta provar que os tipos entram no fluxo:
    // Σ REQUISICAO (líquido) por insumo é o "requisitado", e PRODUCAO_ENTRADA entra como entrada.
    // Pelo portão (a leitura crua não vê nada sob RLS forçada).
    const somar = async (insumoId: string, tipo: 'REQUISICAO' | 'PRODUCAO_ENTRADA') =>
      Math.abs((await a.movimentoEstoque.aggregate({ _sum: { quantidadeMilesimos: true }, where: { insumoId, tipo } }))._sum.quantidadeMilesimos ?? 0);
    const r = { cheddar: await somar(ids.cheddar, 'REQUISICAO'), molho: await somar(ids.insumoMolho, 'PRODUCAO_ENTRADA') };
    expect(r.cheddar).toBeGreaterThan(0);
    expect(r.molho).toBeGreaterThan(0);
    const d = await divergenciasDaLoja(a, DONA(), ids.vp, {});
    expect(d).not.toBeNull();
  });

  it('o banco: o lote só entra no insumo produzido da loja da ordem; a ordem concluída não muda por SQL cru; o estorno só como espelho', async () => {
    // Uma ordem concluída (a do teste 7 com 4,4 kg) — procura uma CONCLUIDA qualquer.
    const concluida = (await a.ordemProducao.findFirst({ where: { status: 'CONCLUIDA' } }))!;
    expect(concluida).not.toBeNull();
    const sqlCru = (sql: string, ...v: unknown[]) => cru(db, perfil, A.id, sql, ...v);
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "produzidoMilesimos" = 9999 WHERE id = $1`, concluida.id)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "custoTotalCentavos" = 1 WHERE id = $1`, concluida.id)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "status" = 'PLANEJADA' WHERE id = $1`, concluida.id)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "validadeEm" = now() WHERE id = $1`, concluida.id)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    // A cancelada (estornada ou não) não muda mais.
    const cancelada = (await a.ordemProducao.findFirst({ where: { status: 'CANCELADA' } }))!;
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "observacao" = 'x' WHERE id = $1`, cancelada.id)).rejects.toThrow(/OrdemProducao_concluida_imutavel/);
    // PRODUCAO_ENTRADA em outra loja que não a da ordem, ou em outro insumo: recusado pelo banco (até com SQL cru).
    const saldoDelivery = `INSERT INTO "MovimentoEstoque"(id,"parceiroId","lojaId","insumoId",tipo,"quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","ordemProducaoId","chaveIdempotencia") VALUES ($1,$2,$3,$4,'PRODUCAO_ENTRADA',1000,100,0,1000,'Molho cheddar','KG',$5,$6)`;
    await expect(sqlCru(saldoDelivery, 'mx1', A.id, ids.delivery, ids.insumoMolho, concluida.id, 'k-loja-errada')).rejects.toThrow(/MovimentoEstoque_producao_confere/);
    await expect(sqlCru(saldoDelivery, 'mx2', A.id, ids.vp, ids.cheddar, concluida.id, 'k-insumo-errado')).rejects.toThrow(/MovimentoEstoque_producao_confere/);
    // Sem a ordem: o gatilho recusa antes (o CHECK da migration é o cinto de reserva, conferido pelo `erp:conferir-migracao`).
    await expect(
      sqlCru(`INSERT INTO "MovimentoEstoque"(id,"parceiroId","lojaId","insumoId",tipo,"quantidadeMilesimos","valorCentavos","saldoAntesMilesimos","saldoDepoisMilesimos","insumoNomeSnapshot","unidadeSnapshot","chaveIdempotencia") VALUES ('mx3',$1,$2,$3,'PRODUCAO_ENTRADA',1000,100,0,1000,'Molho cheddar','KG','k-sem-ordem')`, A.id, ids.vp, ids.insumoMolho),
    ).rejects.toThrow(/MovimentoEstoque_producao_confere/);
    // Código de lote fora do formato e duas ordens na mesma requisição.
    await expect(sqlCru(`UPDATE "OrdemProducao" SET "codigoLote" = 'abc' WHERE id = $1`, (await a.ordemProducao.findFirst({ where: { status: 'PLANEJADA' } }))?.id ?? 'x')).rejects.toThrow();
    // Outro parceiro: o lote de A não existe para B (RLS/portão) e a FK composta recusa apontar.
    expect(await b.ordemProducao.findFirst({ where: { id: concluida.id } })).toBeNull();
    await expect(
      b.ordemProducao.create({ data: { parceiroId: B.id, lojaId: ids.lojaB, fichaId: ids.molho, codigoLote: '261017-90', dataPlanejada: new Date(), planejadoMilesimos: 1000, fichaNomeSnapshot: 'x' } }),
    ).rejects.toThrow();
  });

  it('concluir sem nenhuma saída pela requisição não fecha custo: recusa (nada gravado)', async () => {
    const id = ((await planejar(OPERADOR(), '2')) as { id: string }).id;
    const l = await lote(id);
    // Encerra o resto sem entregar nada: a requisição fica ATENDIDA (corte), mas nada saiu.
    const rq = (await obterRequisicao(a, DONA(), ids.vp, l.requisicao!.id))!;
    expect(await atenderRequisicao(a, GERENTE(), ids.vp, rq.requisicao.id, { versao: rq.requisicao.versao, linhas: [], encerrar: true, confirmarNegativo: false }, 'Edu')).toMatchObject({ ok: true });
    expect(await concluir(id, '2')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Nenhum insumo saiu/) } });
    expect((await lote(id)).ordem.status).toBe('PLANEJADA');
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, id, { versao: l.ordem.versao, motivo: 'nada saiu' }, AUTOR_COZINHA)).toMatchObject({ ok: true });
  });

  it('parceiro suspenso: o portão recusa planejar (somente leitura)', async () => {
    const lerSo = doParceiro(A.id, db, { somenteLeitura: true });
    await expect(planejar(OPERADOR(), '1').then(() => 0)).resolves.toBeDefined();
    const lista = await listaDaProducao(lerSo, OPERADOR(), ids.vp, ids.molho, '1');
    expect(lista.ok).toBe(true);
    await expect(planejarProducao(lerSo, OPERADOR(), ids.vp, { fichaId: ids.molho, quantidade: '1', paraDia: 'hoje', observacao: '', linhas: lista.ok ? lista.linhas : [], envio: novoEnvio() }, AUTOR_COZINHA)).rejects.toThrow();
  });
});
