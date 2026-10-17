/**
 * ERP 3.2 · Lista do dia no Postgres de verdade (a análise 3.2, critérios 1 a 12, Casa Alfa):
 * - a prévia (rascunho) não grava nada; vai usar · tem · comprar com os números da análise;
 * - confirmar grava os lotes (`daLista`) e as requisições numa transação só; duplo clique e abas em paralelo = N lotes, nunca 2N;
 * - o pedido do salão entra em "outros pedidos"; entrega parcial não conta duas vezes; amanhã inclui o que segue aberto de hoje;
 * - só quem tem `producao.planejar` confirma e tira o lote da lista; o cozinheiro segue com o lote avulso;
 * - R$ só com `insumos.ver`; fornecedor só com `compras.ver` na loja da nota; loja de outro parceiro/fora do acesso não existe;
 * - ataques: 31 linhas, quantidade 0/negativa/"1e9", dia +15 ou passado, ficha de outro parceiro ou prato: recusa e nada gravado;
 * - a trava do dia: confirmar ESPERA quem segura a trava (teste mutante).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-lista-do-dia.db.test.ts
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
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, cancelarRequisicao, criarRequisicao, devolverItem, obterRequisicao } from '@/lib/erp/requisicao';
import { cancelarProducao, obterOrdem, planejarProducao, listaDaProducao } from '@/lib/erp/producao';
import { confirmarLista, obterListaDoDia, type LinhaDaConta } from '@/lib/erp/lista-do-dia';
import { codigoDoLote } from '@/lib/erp/producao-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA_MS = 86_400_000;
const GIL = { nome: 'Gil Gerente', userId: 'u-gil' };
const CAIO = { nome: 'Caio Cozinha', userId: 'u-caio' };

describe.skipIf(!URL_TESTE)('ERP 3.2 · lista do dia (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `l${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const amanha = somarDias(hoje, 1);

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Perfil próprio "Cozinha": produz, mas não vê custos, estoque nem compras.
  const COZINHA = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);
  // O operador do perfil base não vê custos? Vê (insumos.ver); o perfil "sem custo" é este: estoque sim, R$ não.
  const SEM_CUSTO = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar', 'estoque.ver', 'requisicao.pedir']);

  let envio = 0;
  const novoEnvio = () => `lista-${sufixo}-${++envio}`.padEnd(12, 'x');
  const rasc = (...pares: [string, string][]) => pares.map(([fichaId, quantidade]) => ({ fichaId, quantidade }));
  const TRES = () => rasc([ids.molho, '5'], [ids.caramelo, '2'], [ids.especial, '2']);
  const ver = async (alcance: Alcance, linhas: { fichaId: string; quantidade: string }[] = [], dia?: string, loja = ids.vp, cliente = a) => obterListaDoDia(cliente, alcance, loja, { dia, linhas });
  const conta = async (alcance: Alcance, linhas: { fichaId: string; quantidade: string }[] = [], dia?: string) => (await ver(alcance, linhas, dia))!.conta!;
  const linha = (c: { linhas: LinhaDaConta[] }, nome: string) => c.linhas.find((l) => l.nome === nome)!;
  const resumo = (c: { linhas: LinhaDaConta[] }) => Object.fromEntries(c.linhas.map((l) => [l.nome, [l.vaiUsarMilesimos, l.temMilesimos, l.comprar?.texto ?? null]]));
  const contagens = async () => ({ ordens: await a.ordemProducao.count(), reqs: await a.requisicao.count(), movs: await a.movimentoEstoque.count(), historico: await a.historicoAlteracao.count() });
  const confirmar = (linhas: { fichaId: string; quantidade: string }[], extra: { dia?: string; envio?: string | null; alcance?: Alcance; loja?: string; agora?: Date } = {}) =>
    confirmarLista(a, extra.alcance ?? GERENTE(), extra.loja ?? ids.vp, { dia: extra.dia ?? hoje, linhas, envio: extra.envio === null ? undefined : (extra.envio ?? novoEnvio()) }, GIL, extra.agora);
  /** Tira da lista (cancela) tudo o que está pendente na Penha, para o próximo teste partir do zero. */
  const limpar = async () => {
    for (const o of await a.ordemProducao.findMany({ where: { lojaId: ids.vp, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] } }, select: { id: true, versao: true } })) {
      const r = await cancelarProducao(a, DONA(), ids.vp, o.id, { versao: o.versao, motivo: 'limpeza do teste' }, GIL);
      if (!r.ok) throw new Error(JSON.stringify(r));
    }
    for (const q of await a.requisicao.findMany({ where: { lojaId: ids.vp, status: { in: ['ABERTA', 'PARCIAL'] } }, select: { id: true } })) {
      const r = await cancelarRequisicao(a, DONA(), ids.vp, q.id, { motivo: 'limpeza do teste' }, 'Gil');
      if (!r.ok) throw new Error(JSON.stringify(r));
    }
  };
  const entregar = async (reqId: string, itens?: Record<string, string>) => {
    const r = (await obterRequisicao(a, DONA(), ids.vp, reqId))!;
    return atenderRequisicao(
      a,
      GERENTE(),
      ids.vp,
      reqId,
      { versao: r.requisicao.versao, linhas: r.itens.filter((i) => i.faltaMilesimos > 0 && (!itens || itens[i.nome])).map((i) => ({ itemId: i.id, quantidade: itens?.[i.nome] ?? String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: false },
      'Edu Estoque',
    );
  };

  /** O estoque recebe de volta o que saiu pela requisição (para o lote poder ser tirado da lista). */
  const devolverTudo = async (reqId: string) => {
    const r = (await obterRequisicao(a, DONA(), ids.vp, reqId))!;
    for (const i of r.itens.filter((x) => x.atendidoMilesimos - x.devolvidoMilesimos > 0)) {
      const atual = (await obterRequisicao(a, DONA(), ids.vp, reqId))!;
      const d = await devolverItem(a, GERENTE(), ids.vp, reqId, { versao: atual.requisicao.versao, itemId: i.id, quantidade: String((i.atendidoMilesimos - i.devolvidoMilesimos) / 1000).replace('.', ','), escala: 'base', motivo: 'voltou' }, 'Edu Estoque');
      if (!d.ok) throw new Error(JSON.stringify(d));
    }
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Lista A', slug: `lista-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Lista B', slug: `lista-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    // Embalagens: cheddar 5 kg R$ 94,90; leite 1 L; cebola saco de 3 kg R$ 15,00; maionese 3 kg. (Açúcar de 1 kg a R$ 5,00 nasce depois da abertura: sem linha de saldo.)
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '5', preco: '94,90', conservacao: 'REFRIGERADO' },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO' },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '3', preco: '15,00', conservacao: 'SECO' },
      maionese: { nome: 'Maionese', unidade: 'KG', conteudo: '3', preco: '21,00', conservacao: 'REFRIGERADO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    // Molho cheddar (rende 2 kg): cheddar 1 kg, leite 1 L, cebola 300 g com fator 1,18.
    const molho = await cadastrarFicha(
      a,
      { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '1', unidade: 'kg' }, { insumoId: ids.leite, quantidade: '1', unidade: 'L' }, { insumoId: ids.cebola, quantidade: '300', unidade: 'g', fator: '1,18' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!molho.ok) throw new Error(JSON.stringify(molho));
    ids.molho = molho.id;
    ids.insumoMolho = (await a.insumo.findFirst({ where: { nome: 'Molho cheddar' } }))!.id;
    // Abertura há 10 dias: cheddar 3 kg, leite 4 L, cebola 1,2 kg, maionese 3 kg, molho 0,3 kg.
    const antes = new Date(Date.now() - 10 * DIA_MS);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Queijo cheddar': '3', Leite: '4', Cebola: '1,2', Maionese: '3', 'Molho cheddar': '0,3' };
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome] ?? '0', escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
    // Depois da abertura: açúcar (1 kg, R$ 5,00; sem linha de saldo) e as duas fichas que usam o molho e o açúcar.
    const acucar = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Açúcar', unidade: 'KG', conteudo: '1', preco: '5,00', conservacao: 'SECO' });
    if (!acucar.ok) throw new Error(JSON.stringify(acucar));
    ids.acucar = acucar.id;
    const caramelo = await cadastrarFicha(
      a,
      { nome: 'Cebola caramelizada', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1,5', unidade: 'kg', fator: '1,18' }, { insumoId: ids.acucar, quantidade: '100', unidade: 'g' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!caramelo.ok) throw new Error(JSON.stringify(caramelo));
    ids.caramelo = caramelo.id;
    const especial = await cadastrarFicha(
      a,
      { nome: 'Molho especial', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ subfichaId: ids.molho, quantidade: '400', unidade: 'g' }, { insumoId: ids.maionese, quantidade: '600', unidade: 'g' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!especial.ok) throw new Error(JSON.stringify(especial));
    ids.especial = especial.id;
    ids.prato = (await a.fichaTecnica.create({ data: { parceiroId: A.id, nome: 'Burger', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' } })).id;
    // Ficha de outro parceiro.
    const fb = await cadastrarFicha(b, { nome: 'Molho B', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [] }, { tipo: 'manter' }, 'Bia');
    ids.fichaB = fb.ok ? fb.id : (await b.fichaTecnica.create({ data: { parceiroId: B.id, nome: 'Molho B', tipo: 'PRE_PREPARO', rendimentoMilesimos: 1000, unidadeRendimento: 'KG' } })).id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('critérios 1 e 2 · o rascunho de 3 fichas: vai usar consolidado, tem do livro, comprar em embalagens — e NADA é gravado', async () => {
    const antes = await contagens();
    const c = await conta(GERENTE(), TRES());
    expect(resumo(c)).toEqual({
      'Queijo cheddar': [2500, 3000, null],
      Leite: [2500, 4000, null],
      Cebola: [4425, 1200, '2 × 3 kg (6 kg)'],
      Açúcar: [200, 0, '1 kg'],
      Maionese: [1200, 3000, null],
      'Molho cheddar': [800, 300, null],
    });
    expect(linha(c, 'Cebola').comprar).toMatchObject({ faltaMilesimos: 3225, embalagens: 2, totalMilesimos: 6000 });
    expect(linha(c, 'Cebola').origens.map((o) => [o.grupo, o.de, o.quantidadeMilesimos])).toEqual([['LISTA', 'Cebola caramelizada', 3540], ['LISTA', 'Molho cheddar', 885]]);
    expect(await contagens()).toEqual(antes);
  });

  it('critério 3 · o Molho cheddar vai para "Falta produzir": 0 com o lote no rascunho ("produza antes de Molho especial"); sem ele falta 0,5 kg e o botão traz a ficha', async () => {
    const com = linha(await conta(GERENTE(), TRES()), 'Molho cheddar');
    expect(com.comprar).toBeNull();
    expect(com.produzir).toMatchObject({ situacao: 'COBERTO', faltaMilesimos: 0, produzMilesimos: 5000, paraFichas: ['Molho especial'] });
    const sem = await conta(GERENTE(), rasc([ids.caramelo, '2'], [ids.especial, '2']));
    const m = linha(sem, 'Molho cheddar');
    expect(m.produzir).toMatchObject({ situacao: 'FALTA', faltaMilesimos: 500 });
    expect(m.ficha).toEqual({ id: ids.molho, nome: 'Molho cheddar' });
    // Põe "Molho cheddar 0,5 kg": entram cheddar 250 g, leite 250 ml e cebola 89 g; a cebola vai a 3,629 kg e compra 1 saco.
    const posto = await conta(GERENTE(), rasc([ids.caramelo, '2'], [ids.especial, '2'], [ids.molho, '0,5']));
    expect(resumo(posto)).toMatchObject({ Cebola: [3629, 1200, '1 × 3 kg'], 'Queijo cheddar': [250, 3000, null], Leite: [250, 4000, null] });
    expect(linha(posto, 'Molho cheddar').produzir).toMatchObject({ situacao: 'COBERTO', faltaMilesimos: 0 });
  });

  it('critério 4 · o R$ da compra só vai para quem tem insumos.ver: cebola R$ 30,00 + açúcar R$ 5,00 = R$ 35,00; sem a permissão, nenhum valor sai do servidor', async () => {
    const dona = await conta(GERENTE(), TRES());
    expect(dona.compra).toEqual({ totalCentavos: 3500, semPreco: [] });
    expect(linha(dona, 'Cebola').valorCentavos).toBe(3000);
    expect(linha(dona, 'Açúcar').valorCentavos).toBe(500);
    const sem = await conta(alcanceDe(null, [ids.vp], ['producao.ver', 'producao.planejar', 'estoque.ver', 'compras.ver']), TRES());
    expect(sem.compra).toBeNull();
    expect(sem.linhas.every((l) => l.valorCentavos === null && !l.semPreco)).toBe(true);
    expect(JSON.stringify(sem)).not.toMatch(/valorCentavos":\d|totalCentavos/);
    // Comprar continua nas quantidades.
    expect(linha(sem, 'Cebola').comprar?.texto).toBe('2 × 3 kg (6 kg)');
  });

  it('insumo sem preço: o total é incompleto e a tela diz qual, nunca R$ 0,00', async () => {
    const sp = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Sal grosso', unidade: 'KG', conteudo: '1', preco: '', semPreco: 'sim', conservacao: 'SECO' });
    if (!sp.ok) throw new Error(JSON.stringify(sp));
    const f = await cadastrarFicha(a, { nome: 'Sal temperado', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: sp.id, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
    const c = await conta(GERENTE(), rasc([f.id, '1']));
    expect(linha(c, 'Sal grosso')).toMatchObject({ semPreco: true, valorCentavos: null });
    expect(c.compra).toEqual({ totalCentavos: 0, semPreco: ['Sal grosso'] });
  });

  it('critério 5 · confirmar grava 3 lotes (daLista, 01 a 03) e 3 requisições da Cozinha para o dia, nada no livro; duplo clique = 3', async () => {
    const dia = somarDias(hoje, 2);
    const antes = await contagens();
    const chave = novoEnvio();
    const r = await confirmar(TRES(), { dia, envio: chave });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, lotes: 3 });
    const lotes = await a.ordemProducao.findMany({ where: { lojaId: ids.vp, dataPlanejada: new Date(`${dia}T00:00:00.000Z`) }, orderBy: { codigoLote: 'asc' } });
    expect(lotes.map((l) => [l.codigoLote, l.fichaNomeSnapshot, l.planejadoMilesimos, l.daLista, l.status, l.planejadaPorNome])).toEqual([
      [codigoDoLote(dia, 1), 'Molho cheddar', 5000, true, 'PLANEJADA', 'Gil Gerente'],
      [codigoDoLote(dia, 2), 'Cebola caramelizada', 2000, true, 'PLANEJADA', 'Gil Gerente'],
      [codigoDoLote(dia, 3), 'Molho especial', 2000, true, 'PLANEJADA', 'Gil Gerente'],
    ]);
    const reqs = await a.requisicao.findMany({ where: { id: { in: lotes.map((l) => l.requisicaoId!) } }, include: { itens: true } });
    expect(reqs).toHaveLength(3);
    expect(reqs.every((q) => q.setor === 'COZINHA' && q.paraDia!.toISOString().slice(0, 10) === dia && q.status === 'ABERTA')).toBe(true);
    const depois = await contagens();
    expect(depois.ordens - antes.ordens).toBe(3);
    expect(depois.reqs - antes.reqs).toBe(3);
    expect(depois.movs).toBe(antes.movs);
    // O histórico diz de onde veio.
    const h = await a.historicoAlteracao.findMany({ where: { entidade: 'OrdemProducao', entidadeId: lotes[0].id, acao: 'PLANEJOU' } });
    expect((h[0].depois as Record<string, string>).origem).toBe(`Lista do dia ${dia.slice(8, 10)}/${dia.slice(5, 7)}`);
    // Duplo clique (mesmo envio): os mesmos lotes, nada novo.
    const de_novo = await confirmar(TRES(), { dia, envio: chave });
    expect(de_novo).toMatchObject({ ok: true, jaFeito: true, lotes: 3, id: lotes[0].id });
    expect((await contagens()).ordens).toBe(depois.ordens);
    // A prévia sem rascunho (agora pelos lotes e requisições) dá a MESMA conta do rascunho.
    const pelaLista = await conta(GERENTE(), [], dia);
    expect(resumo(pelaLista)).toMatchObject({ Cebola: [4425, 1200, '2 × 3 kg (6 kg)'], Açúcar: [200, 0, '1 kg'], 'Queijo cheddar': [2500, 3000, null], Maionese: [1200, 3000, null] });
    expect(linha(pelaLista, 'Molho cheddar').produzir).toMatchObject({ situacao: 'COBERTO', produzMilesimos: 5000 });
    await limpar();
  });

  it('o envio repetido em paralelo (5 cliques) dá 3 lotes, nunca 15; sem a chave cada envio vale (2 envios = 6 lotes) — a chave é o que protege', async () => {
    const dia = somarDias(hoje, 3);
    const chave = novoEnvio();
    const rs = await Promise.all(Array.from({ length: 5 }, () => confirmar(rasc([ids.molho, '2'], [ids.caramelo, '1'], [ids.especial, '1']), { dia, envio: chave })));
    expect(rs.every((r) => r.ok), JSON.stringify(rs)).toBe(true);
    expect(rs.filter((r) => r.ok && r.jaFeito)).toHaveLength(4);
    const doDia = () => a.ordemProducao.count({ where: { lojaId: ids.vp, dataPlanejada: new Date(`${dia}T00:00:00.000Z`) } });
    expect(await doDia()).toBe(3);
    // Sem chave (mutante: o que a chave faz): dois envios iguais gravam duas listas.
    const sem1 = await confirmar(rasc([ids.molho, '1']), { dia, envio: null });
    const sem2 = await confirmar(rasc([ids.molho, '1']), { dia, envio: null });
    expect(sem1.ok && sem2.ok).toBe(true);
    expect(await doDia()).toBe(5);
    // Duas listas diferentes ao mesmo tempo: os códigos nunca se repetem.
    const juntas = await Promise.all([confirmar(rasc([ids.molho, '1'], [ids.caramelo, '1']), { dia }), confirmar(rasc([ids.molho, '1'], [ids.caramelo, '1']), { dia })]);
    expect(juntas.every((r) => r.ok)).toBe(true);
    const codigos = (await a.ordemProducao.findMany({ where: { lojaId: ids.vp, dataPlanejada: new Date(`${dia}T00:00:00.000Z`) }, select: { codigoLote: true } })).map((o) => o.codigoLote);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos).toHaveLength(9);
    // A mesma chave em outra loja é recusada.
    expect(await confirmar(rasc([ids.molho, '1']), { dia, envio: chave, alcance: alcanceDe('GERENTE', [ids.vp, ids.delivery]), loja: ids.delivery })).toMatchObject({ ok: false });
    await limpar();
  });

  it('mutante da trava do dia: confirmar ESPERA quem segura a trava do dia (sem ela dois envios disputam o mesmo código)', async () => {
    const dia = somarDias(hoje, 4);
    let solta!: () => void;
    const segurando = new Promise<void>((resolve) => (solta = resolve));
    let travou!: () => void;
    const travada = new Promise<void>((resolve) => (travou = resolve));
    const dona = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${A.id}, true)`;
        await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text`, `erp:lote:${A.id}:${dia}`);
        travou();
        await segurando;
      },
      { timeout: 20_000 },
    );
    await travada;
    const inicio = Date.now();
    const pendente = confirmar(rasc([ids.molho, '1']), { dia });
    await new Promise((r) => setTimeout(r, 900));
    solta();
    await dona;
    const r = await pendente;
    expect(r.ok).toBe(true);
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(850);
    await limpar();
  });

  it('critério 6 · o pedido do salão entra em "outros pedidos": cheddar 5 kg soma 7,5 e pede 1 × 5 kg; com 6 kg, 2 × 5 kg', async () => {
    const q = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cheddar, quantidade: '5', escala: 'base' }] }, 'Gil');
    if (!q.ok) throw new Error(JSON.stringify(q));
    const num = (await a.requisicao.findUnique({ where: { id: q.id } }))!.numero;
    const c = await conta(GERENTE(), TRES());
    const cheddar = linha(c, 'Queijo cheddar');
    expect(cheddar).toMatchObject({ vaiUsarMilesimos: 7500, daListaMilesimos: 2500, deOutrosMilesimos: 5000 });
    expect(cheddar.comprar?.texto).toBe('1 × 5 kg');
    expect(cheddar.origens.find((o) => o.grupo === 'OUTROS')).toMatchObject({ de: `Salão #${num}`, quantidadeMilesimos: 5000 });
    await cancelarRequisicao(a, DONA(), ids.vp, q.id, { motivo: 'trocar para 6 kg' }, 'Gil');
    const q2 = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cheddar, quantidade: '6', escala: 'base' }] }, 'Gil');
    expect(q2.ok).toBe(true);
    expect(linha(await conta(GERENTE(), TRES()), 'Queijo cheddar').comprar).toMatchObject({ faltaMilesimos: 5500, texto: '2 × 5 kg (10 kg)' });
    await limpar();
  });

  it('critério 7 · entrega parcial: o estoquista entrega 885 g de cebola do lote e comprar continua 3,225 kg (2 sacos), sem contar duas vezes', async () => {
    const dia = hoje;
    const r = await confirmar(TRES(), { dia });
    expect(r.ok).toBe(true);
    const lote1 = await a.ordemProducao.findFirst({ where: { lojaId: ids.vp, fichaId: ids.molho, status: 'PLANEJADA' } });
    expect(await entregar(lote1!.requisicaoId!, { Cebola: '0,885' })).toMatchObject({ ok: true });
    const c = await conta(GERENTE());
    expect(linha(c, 'Cebola')).toMatchObject({ vaiUsarMilesimos: 4425 - 885, temMilesimos: 1200 - 885 });
    expect(linha(c, 'Cebola').comprar).toMatchObject({ faltaMilesimos: 3225, texto: '2 × 3 kg (6 kg)' });
    // Confirmar uma lista para amanhã inclui o que segue aberto de hoje (paraDia ≤ dia).
    const amanhaC = await conta(GERENTE(), [], amanha);
    expect(linha(amanhaC, 'Açúcar').vaiUsarMilesimos).toBe(200);
    expect(linha(amanhaC, 'Cebola').origens.every((o) => o.grupo === 'OUTROS')).toBe(true);
    await devolverTudo(lote1!.requisicaoId!);
    await limpar();
  });

  it('critério 8 · o dia de ontem é só leitura: os lotes, sem tem/comprar, sem pré-preparos para pôr; lixo no ?dia= volta para hoje', async () => {
    const ontem = somarDias(hoje, -1);
    const agoraOntem = new Date(Date.now() - DIA_MS);
    const l = await listaDaProducao(a, GERENTE(), ids.vp, ids.molho, '2');
    if (!l.ok) throw new Error(JSON.stringify(l));
    const p = await planejarProducao(a, GERENTE(), ids.vp, { fichaId: ids.molho, quantidade: '2', paraDia: 'hoje', observacao: '', linhas: l.linhas, envio: novoEnvio() }, GIL, agoraOntem);
    expect(p.ok).toBe(true);
    const v = (await ver(GERENTE(), TRES(), ontem))!;
    expect(v).toMatchObject({ dia: ontem, passado: true });
    expect(v.lotes.map((x) => [x.fichaNome, x.status, x.daLista])).toEqual([['Molho cheddar', 'PLANEJADA', false]]);
    expect(v.conta).toBeNull();
    expect(v.fichas).toEqual([]);
    expect(v.rascunho.linhas).toEqual([]);
    expect((await ver(GERENTE(), [], 'lixo'))!.dia).toBe(hoje);
    expect((await ver(GERENTE(), [], somarDias(hoje, 15)))!.dia).toBe(hoje);
    // Confirmar para ontem ou para daqui a 15 dias: recusado, nada gravado.
    const antes = await contagens();
    expect(await confirmar(TRES(), { dia: ontem })).toMatchObject({ ok: false, erros: { paraDia: expect.any(String) } });
    expect(await confirmar(TRES(), { dia: somarDias(hoje, 15) })).toMatchObject({ ok: false, erros: { paraDia: expect.any(String) } });
    expect(await contagens()).toEqual(antes);
    await limpar();
  });

  it('critério 9 · o operador vê a lista e as quantidades, mas não confirma nem tira o lote da lista; o lote avulso dele segue seu; o gerente tira (sem saída) e a 3.1 recusa com cheddar entregue', async () => {
    const dia = amanha;
    expect(await confirmar(TRES(), { dia, alcance: OPERADOR() })).toMatchObject({ ok: false });
    expect(await confirmar(TRES(), { dia, alcance: COZINHA() })).toMatchObject({ ok: false });
    expect((await contagens()).ordens).toBe(await a.ordemProducao.count());
    const r = await confirmar(TRES(), { dia });
    expect(r.ok).toBe(true);
    // O operador vê a lista (lotes) e as quantidades, sem rascunho; o rascunho que ele forja na URL é ignorado.
    const op = (await ver(OPERADOR(), TRES(), dia))!;
    expect(op.pode).toMatchObject({ planejar: false, verEstoque: true });
    expect(op.lotes).toHaveLength(3);
    expect(op.rascunho.linhas).toEqual([]);
    expect(op.fichas).toEqual([]);
    expect(linha(op.conta!, 'Cebola').comprar?.texto).toBe('2 × 3 kg (6 kg)');
    expect(op.lotes.every((x) => x.daLista)).toBe(true);
    // Tirar da lista: o operador não; o lote avulso dele sim.
    const doDia = (await a.ordemProducao.findMany({ where: { lojaId: ids.vp, status: 'PLANEJADA', daLista: true }, orderBy: { codigoLote: 'asc' } }))!;
    const sem = await cancelarProducao(a, OPERADOR(), ids.vp, doDia[1].id, { versao: doDia[1].versao, motivo: 'não quero' }, CAIO);
    expect(sem).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/foi definido na lista do dia/) } });
    expect((await obterOrdem(a, DONA(), ids.vp, doDia[1].id))!.ordem.status).toBe('PLANEJADA');
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.caramelo, '1');
    if (!lista.ok) throw new Error(JSON.stringify(lista));
    const avulso = await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ids.caramelo, quantidade: '1', paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: novoEnvio() }, CAIO);
    if (!avulso.ok) throw new Error(JSON.stringify(avulso));
    expect((await a.ordemProducao.findUnique({ where: { id: avulso.id } }))!.daLista).toBe(false);
    const ov = (await obterOrdem(a, OPERADOR(), ids.vp, avulso.id))!;
    expect(await cancelarProducao(a, OPERADOR(), ids.vp, avulso.id, { versao: ov.ordem.versao, motivo: 'errei o dia' }, CAIO)).toMatchObject({ ok: true });
    // O gerente tira o lote da lista sem saída: CANCELADA com motivo; a requisição vai junto.
    const g = await cancelarProducao(a, GERENTE(), ids.vp, doDia[1].id, { versao: doDia[1].versao, motivo: 'sem cebola hoje' }, GIL);
    expect(g).toMatchObject({ ok: true });
    const cancelada = await a.ordemProducao.findUnique({ where: { id: doDia[1].id }, include: { requisicao: true } });
    expect(cancelada).toMatchObject({ status: 'CANCELADA', motivoCancelamento: 'sem cebola hoje' });
    expect(cancelada!.requisicao!.status).toBe('CANCELADA');
    // Com 2,5 kg de cheddar entregue do lote do molho: a 3.1 recusa (o estoque recebe de volta antes).
    const molho = doDia[0];
    expect(await entregar(molho.requisicaoId!, { 'Queijo cheddar': '2,5' })).toMatchObject({ ok: true });
    expect(await cancelarProducao(a, GERENTE(), ids.vp, molho.id, { versao: molho.versao, motivo: 'mudou' }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Já saiu estoque/) } });
    // Quem tem só "definir a lista" (sem registrar produção) também tira o lote da lista.
    const soDefine = alcanceDe(null, [ids.vp], ['producao.ver', 'producao.planejar']);
    const l3 = doDia[2];
    expect(await cancelarProducao(a, soDefine, ids.vp, l3.id, { versao: l3.versao, motivo: 'sem maionese' }, GIL)).toMatchObject({ ok: true });
    await devolverTudo(molho.requisicaoId!);
    await limpar();
  });

  it('critério 10 · gerente da Delivery na Penha: 404; dona de outro parceiro: 404; o nível 1 vê o mesmo; confirmar de fora não grava', async () => {
    expect(await ver(GERENTE_DELIVERY(), [])).toBeNull();
    expect(await ver(alcanceDe('DONO', 'rede'), [], undefined, ids.vp, b)).toBeNull();
    expect(await ver(alcanceDe('DONO', 'rede'), [], undefined, ids.lojaB, a)).toBeNull();
    expect(await ver(GERENTE(), [], undefined, 'nao-existe-123')).toBeNull();
    expect(await ver(GERENTE(), [], undefined, "x'; DROP TABLE")).toBeNull();
    const n1 = (await ver(ALCANCE_FLOWFOODS, TRES()))!;
    expect(resumo(n1.conta!)).toEqual(resumo(await conta(GERENTE(), TRES())));
    const antes = await contagens();
    expect(await confirmar(TRES(), { alcance: GERENTE_DELIVERY() })).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await confirmarLista(b, alcanceDe('DONO', 'rede'), ids.vp, { dia: hoje, linhas: TRES(), envio: novoEnvio() }, GIL)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await contagens()).toEqual(antes);
  });

  it('critério 11 · estoque não aberto: só "vai usar" e o aviso; confirmar é recusado com a frase da 1.8 e nada é gravado', async () => {
    const antes = await contagens();
    const dono = alcanceDe('DONO', 'rede');
    const v = (await ver(dono, [], undefined, ids.delivery))!;
    expect(v.aberto).toBe(false);
    expect(v.conta).not.toBeNull();
    const r = await confirmarLista(a, dono, ids.delivery, { dia: hoje, linhas: TRES(), envio: novoEnvio() }, GIL);
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/estoque da Delivery ainda não foi aberto/) } });
    expect(await contagens()).toEqual(antes);
    // Com rascunho, a prévia mostra o "vai usar" e nenhum "tem/comprar".
    const p = (await ver(dono, TRES(), undefined, ids.delivery))!.conta!;
    expect(p.linhas.length).toBeGreaterThan(0);
    expect(p.linhas.every((l) => l.comprar === null && l.temMilesimos === 0 && l.produzir === null)).toBe(true);
    expect(linha(p, 'Cebola').vaiUsarMilesimos).toBe(4425);
  });

  it('critério 12 · o fornecedor da última compra: só para quem tem compras.ver na loja da nota; nota de outra loja não aparece', async () => {
    const forn = await cadastrarFornecedor(a, { nome: 'Laticínios Serra' }, 'Marina');
    if (!forn.ok) throw new Error(JSON.stringify(forn));
    // Nota de 12 dias atrás (antes da abertura: não mexe no saldo) de cheddar na Penha.
    const antiga = somarDias(hoje, -12);
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: forn.id, numero: '5001', serie: '', data: antiga, frete: '', total: '94,90', itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor: '94,90' }] }, 'Marina');
    if (!n.ok) throw new Error(JSON.stringify(n));
    const salao = await criarRequisicao(a, GERENTE(), ids.vp, { setor: 'SALAO', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cheddar, quantidade: '6', escala: 'base' }] }, 'Gil');
    expect(salao.ok).toBe(true);
    const gerente = linha(await conta(GERENTE(), TRES()), 'Queijo cheddar');
    expect(gerente.comprar).not.toBeNull();
    expect(gerente.fornecedor).toEqual({ nome: 'Laticínios Serra', notaEm: antiga });
    // O operador (sem compras.ver) e o perfil sem compras não recebem o fornecedor; o JSON nem o cita.
    const op = await conta(OPERADOR(), []);
    expect(linha(op, 'Queijo cheddar').fornecedor).toBeNull();
    expect(JSON.stringify(op)).not.toContain('Laticínios');
    expect(JSON.stringify(await conta(SEM_CUSTO(), []))).not.toContain('Laticínios');
    // A nota é de OUTRA loja (a Delivery): quem só alcança a Penha nunca vê o fornecedor dela.
    const dono = alcanceDe('DONO', 'rede');
    const forn2 = await cadastrarFornecedor(a, { nome: 'Frios do Porto' }, 'Marina');
    if (!forn2.ok) throw new Error(JSON.stringify(forn2));
    const n2 = await lancarNota(a, dono, { lojaId: ids.delivery, fornecedorId: forn2.id, numero: '77', serie: '', data: somarDias(hoje, -11), frete: '', total: '90,00', itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor: '90,00' }] }, 'Marina');
    if (!n2.ok) throw new Error(JSON.stringify(n2));
    const depois = linha(await conta(GERENTE(), TRES()), 'Queijo cheddar');
    expect(depois.fornecedor).toBeNull();
    expect(JSON.stringify(await conta(GERENTE(), TRES()))).not.toContain('Frios do Porto');
    // A dona (rede inteira) vê o da nota mais nova.
    expect(linha(await conta(dono, TRES()), 'Queijo cheddar').fornecedor?.nome).toBe('Frios do Porto');
    await limpar();
  });

  it('ataques · 31 linhas, quantidade 0/negativa/"1e9"/acima de 10 mil, ficha de outro parceiro, prato e linha sem ficha: recusa e NADA entra (uma linha ruim derruba a lista)', async () => {
    const antes = await contagens();
    const trinta = Array.from({ length: 30 }, () => ({ fichaId: ids.molho, quantidade: '1' }));
    const r31 = await confirmar([...trinta, { fichaId: ids.molho, quantidade: '1' }]);
    expect(r31).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Até 30 linhas/) } });
    for (const q of ['0', '-1', '1e9', '10000,001', 'abc', '']) {
      const r = await confirmar([{ fichaId: ids.caramelo, quantidade: '1' }, { fichaId: ids.molho, quantidade: q }]);
      expect(r, q).toMatchObject({ ok: false, erros: { 'linha:1': expect.stringMatching(/Molho cheddar/) } });
    }
    expect(await confirmar([{ fichaId: ids.caramelo, quantidade: '1' }, { fichaId: ids.fichaB, quantidade: '1' }])).toMatchObject({ ok: false, erros: { 'linha:1': 'Escolha o pré-preparo.' } });
    expect(await confirmar([{ fichaId: ids.caramelo, quantidade: '1' }, { fichaId: ids.prato, quantidade: '1' }])).toMatchObject({ ok: false, erros: { 'linha:1': expect.stringMatching(/Só se produz pré-preparo/) } });
    expect(await confirmar([{ fichaId: ids.caramelo, quantidade: '1' }, { fichaId: 'nao-existe', quantidade: '1' }])).toMatchObject({ ok: false, erros: { 'linha:1': 'Escolha o pré-preparo.' } });
    expect(await confirmar([])).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/pelo menos um/) } });
    // 30 linhas da mesma ficha juntam numa só (soma 30) e valem.
    const ok30 = await confirmar(trinta, { dia: somarDias(hoje, 5) });
    expect(ok30).toMatchObject({ ok: true, lotes: 1 });
    expect((await a.ordemProducao.findFirst({ where: { dataPlanejada: new Date(`${somarDias(hoje, 5)}T00:00:00.000Z`) } }))!.planejadoMilesimos).toBe(30_000);
    const depois = await contagens();
    expect(depois.ordens - antes.ordens).toBe(1);
    await limpar();
  });

  it('o lote da lista ganha o mesmo nome do quadro da 3.1 e a lista de insumos é a da ficha (sem edição), com o fator de correção', async () => {
    const r = await confirmar(rasc([ids.molho, '5']), { dia: somarDias(hoje, 6) });
    expect(r.ok).toBe(true);
    const l = (await obterOrdem(a, DONA(), ids.vp, r.ok ? r.id : ''))!;
    expect(l.ordem).toMatchObject({ status: 'PLANEJADA', daLista: true, planejadaPorNome: 'Gil Gerente' });
    expect(l.itensDoLote.map((i) => [i.nome, i.pedidoMilesimos])).toEqual(expect.arrayContaining([['Queijo cheddar', 2500], ['Leite', 2500], ['Cebola', 885]]));
    await limpar();
  });
});
