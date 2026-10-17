/**
 * ERP 2.2a · DRE ao vivo no Postgres de verdade (as regras, com banco):
 *  - plano de contas: parceiro novo e suspenso leem o padrão SEM gravar; a primeira
 *    escrita semeia uma vez (dez paralelas = uma linha por código); renomear (despesas
 *    antigas mostram o nome novo, antes/depois no histórico, 2ª aba recebe conflito);
 *    ocultar (some do formulário, continua no DRE do período com valor, despesa nova
 *    recusada); calculada não renomeia, não oculta, não recebe despesa;
 *  - despesa por competência: R$ 3.100,00 em período mensal, semanal (fatia a fatia, soma
 *    exata) e parcial em 16/10 (R$ 1.500,00); valores e competências inválidos; duplo envio;
 *    recorrente (falta lançar, "do mês passado" duas vezes = uma filha, corrida);
 *  - período FECHADO: pagar passa; editar nos dois sentidos, criar, remover e o intervalo que
 *    só encosta são recusados; a trava espera o fechamento em curso;
 *  - isolamento, alcance (gerente de uma loja nunca recebe despesa da rede), operador sem acesso,
 *    `despesas.lancar` sem `dre.ver`, linha e loja forjadas, histórico sem `verDre`;
 *  - DRE: taxa do iFood (23 % + 3,2 % de R$ 10.000,00 = R$ 2.620,00), integração vence, faltas
 *    iguais às do calendário da 2.1, rede = soma das lojas + despesas da rede;
 *  - período: troca de regra mensal dia 1 → dia 15 (nunca retroativa, pendente substituída),
 *    gatilho anti-sobreposição por SQL cru, e a 1.7 usando o mesmo período;
 *  - CHECKs do banco por SQL cru.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-dre.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { iniciarFechamento, situacaoDoPeriodo } from '@/lib/erp/contagem';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { lancarDia, obterMes } from '@/lib/erp/faturamento';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import {
  desfazerPagamento,
  editarDespesa,
  faltaLancar,
  lancarDespesa,
  lancarDoMesPassado,
  listarDespesas,
  obterDespesa,
  pagarDespesa,
  pararDeRepetir,
  recorrentesEmFalta,
  removerDespesa,
  type EntradaDaEdicao,
} from '@/lib/erp/despesas';
import { dreDoPeriodo, type DreDoPeriodo } from '@/lib/erp/dre';
import { CODIGO, PLANO_PADRAO, chaveDaLinha } from '@/lib/erp/dre-plano';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { periodoDe, registrarPeriodo, salvarRegra, situacaoDosPeriodos } from '@/lib/erp/periodos';
import { criarLinha, garantirPlano, ocultarLinha, planoDoParceiro, renomearLinha } from '@/lib/erp/plano';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, reabrirPeriodoDeTeste, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-17';
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const DIA_MS = 86_400_000;

describe.skipIf(!URL_TESTE)('ERP 2.2a · DRE ao vivo (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `d${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let S: { id: string };
  let W: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  let s: ClienteDoParceiro;
  let w: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const criados: string[] = [];

  const alcance = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const propria = (permissoes: string[], lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcance('DONO', 'rede');
  const DONA_DE_LOJA = () => alcance('DONO', [ids.vp]);
  const GERENTE_VP = () => alcance('GERENTE', [ids.vp]);
  const GERENTE_REDE = () => alcance('GERENTE', 'rede');
  const OPERADOR = () => alcance('OPERADOR', [ids.vp]);
  const ADMIN_REDE = () => propria(['despesas.lancar', 'lojas.ver'], 'rede'); // lança sem ver o DRE
  const SO_HISTORICO = () => propria(['historico.ver', 'lojas.ver'], 'rede');

  const envio = () => globalThis.crypto.randomUUID().replace(/-/g, '');
  const textos = (p: Partial<TextosDaDespesa> = {}): TextosDaDespesa => ({
    envio: envio(),
    lojaId: '',
    linha: 'aluguel',
    descricao: 'Aluguel',
    valor: '3.100,00',
    tipo: 'mes',
    dia: '',
    mes: '2026-10',
    de: '',
    ate: '',
    recorrente: false,
    vencimento: '',
    ...p,
  });
  const lancar = (al: Alcance, p: Partial<TextosDaDespesa> = {}, cliente = a, autor = 'Gil Gerente') => lancarDespesa(cliente, al, textos(p), autor, HOJE);
  const lancado = async (al: Alcance, p: Partial<TextosDaDespesa> = {}, cliente = a) => {
    const r = await lancar(al, p, cliente);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  };
  const dre = (cliente: ClienteDoParceiro, al: Alcance, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, data: string, hoje = HOJE) => dreDoPeriodo(cliente, al, escopo, data, hoje);
  const linha = (d: DreDoPeriodo, codigo: string) => d.resultado.linhas.find((l) => l.codigo === codigo)!;
  const doBanco = (id: string) => a.despesa.findUnique({ where: { id } });
  const edicao = (d: Awaited<ReturnType<typeof obterDespesa>>, p: Partial<EntradaDaEdicao> = {}): EntradaDaEdicao => {
    const x = d!.despesa;
    const br = (iso: string) => iso.split('-').reverse().join('/');
    return {
      lojaId: x.lojaId ?? '',
      linha: x.linhaChave,
      descricao: x.descricao,
      valor: (x.valorCentavos / 100).toFixed(2).replace('.', ','),
      tipo: d!.tipo,
      dia: br(x.competencia.inicio),
      mes: x.competencia.inicio.slice(0, 7),
      de: br(x.competencia.inicio),
      ate: br(x.competencia.fim),
      recorrente: x.recorrente,
      vencimento: x.vencimento ? br(x.vencimento) : '',
      versao: x.versao,
      ...p,
    };
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'DRE A', slug: `dre-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'DRE B', slug: `dre-b-${sufixo}`, status: 'ATIVO' } });
    S = await db.parceiroFlow.create({ data: { nome: 'DRE Suspenso', slug: `dre-s-${sufixo}`, status: 'ATIVO' } });
    W = await db.parceiroFlow.create({ data: { nome: 'DRE Semanal', slug: `dre-w-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id, B.id, S.id, W.id);
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    s = doParceiro(S.id, db);
    w = doParceiro(W.id, db);
    for (const [cliente, chave, nome] of [
      [a, 'vp', 'Vila da Penha'],
      [a, 'dlv', 'Penha Delivery'],
      [b, 'lojaB', 'Loja do B'],
      [s, 'lojaS', 'Loja do S'],
      [w, 'lojaW', 'Loja do W'],
    ] as const) {
      const r = await cadastrarLoja(cliente, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, criados);
    await db?.$disconnect();
  });

  // ------------------------------------------------------------ 1. plano de contas
  it('critério 1: parceiro novo e parceiro suspenso abrem o DRE com o plano padrão SEM gravar nada', async () => {
    expect(await a.dreLinha.count()).toBe(0);
    const plano = await planoDoParceiro(a);
    expect(plano).toHaveLength(PLANO_PADRAO.length);
    expect(plano.every((l) => l.id === null)).toBe(true);
    const d = await dre(a, DONA(), { tipo: 'rede' }, '2026-10-10');
    expect(d).not.toBeNull();
    expect(d!.resultado.linhas.map((l) => l.codigo)).toContain('aluguel');
    expect(await a.dreLinha.count()).toBe(0); // ler não escreve
    // Parceiro suspenso: lê com o padrão do código; o portão recusa a escrita.
    await db.parceiroFlow.update({ where: { id: S.id }, data: { status: 'SUSPENSO' } });
    const somenteLeitura = doParceiro(S.id, db, { somenteLeitura: true });
    expect(await dre(somenteLeitura, DONA(), { tipo: 'rede' }, '2026-10-10')).not.toBeNull();
    expect(await somenteLeitura.dreLinha.count()).toBe(0);
    await expect(lancarDespesa(somenteLeitura, DONA(), textos(), 'Marina', HOJE)).rejects.toThrow();
    expect(await somenteLeitura.despesa.count()).toBe(0);
  });

  it('critério 1: a primeira escrita semeia o plano UMA vez — dez despesas paralelas = uma linha por código', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => lancar(DONA(), { descricao: `Paralela ${i}`, valor: '10,00', linha: 'energia' })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(await a.despesa.count({ where: { descricao: { startsWith: 'Paralela' } } })).toBe(10);
    expect(await a.dreLinha.count()).toBe(PLANO_PADRAO.length);
    const repetidos = await db.$queryRawUnsafe<{ codigo: string; n: number }[]>(`SELECT "codigo", count(*)::int AS n FROM "DreLinha" WHERE "parceiroId" = $1 GROUP BY "codigo" HAVING count(*) > 1`, A.id).catch(() => []);
    expect(repetidos).toEqual([]);
    // garantirPlano de novo, em paralelo: nada muda.
    await Promise.all(Array.from({ length: 6 }, () => a.transacao((tx) => garantirPlano(tx))));
    expect(await a.dreLinha.count()).toBe(PLANO_PADRAO.length);
    await a.despesa.deleteMany({ where: { descricao: { startsWith: 'Paralela' } } });
  });

  it('critério 2: renomear "Aluguel" → "Aluguel loja": despesas antigas mostram o nome novo, histórico com antes e depois, a 2ª aba recebe conflito', async () => {
    const id = await lancado(DONA(), { lojaId: ids.vp, descricao: 'Aluguel da Penha' });
    const antes = (await planoDoParceiro(a)).find((l) => l.codigo === 'aluguel')!;
    expect(antes.versao).not.toBe('');
    const r = await renomearLinha(a, DONA(), { linha: 'aluguel', nome: 'Aluguel loja', versao: antes.versao }, 'Marina');
    expect(r).toMatchObject({ ok: true, mudou: true });
    const d = await obterDespesa(a, DONA(), id, HOJE);
    expect(d!.despesa.linhaNome).toBe('Aluguel loja');
    expect(d!.despesa.linhaChave).toBe('aluguel'); // o código não muda
    const h = await listarHistorico(a, { entidade: 'DreLinha', verPrecos: false, verDre: true, limite: 10 });
    const alt = h.find((x) => x.acao === 'ALTEROU')!;
    expect(alt.mudancas.find((m) => m.campo === 'nome')).toMatchObject({ antes: 'Aluguel', depois: 'Aluguel loja' });
    // 2ª aba, com a versão velha: conflito, nada sobrescrito.
    const velha = await renomearLinha(a, DONA(), { linha: 'aluguel', nome: 'Aluguel do ponto', versao: antes.versao }, 'Outra');
    expect(velha).toMatchObject({ ok: false, conflito: true });
    expect((await planoDoParceiro(a)).find((l) => l.codigo === 'aluguel')!.nome).toBe('Aluguel loja');
    // Nome repetido (sem ligar para acento e caixa) é recusado com frase.
    const atual = (await planoDoParceiro(a)).find((l) => l.codigo === 'condominio')!;
    expect(await renomearLinha(a, DONA(), { linha: 'condominio', nome: 'ALUGUEL  Loja', versao: atual.versao }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    // Voltar ao nome de antes para não atrapalhar as próximas.
    const v = (await planoDoParceiro(a)).find((l) => l.codigo === 'aluguel')!.versao;
    expect(await renomearLinha(a, DONA(), { linha: 'aluguel', nome: 'Aluguel', versao: v }, 'Marina')).toMatchObject({ ok: true });
    await a.despesa.delete({ where: { id } });
  });

  it('critério 3: linha oculta some do formulário e continua no DRE do período com valor; despesa nova nela é recusada; calculada não muda nem recebe', async () => {
    const id = await lancado(DONA(), { linha: 'iptu', descricao: 'IPTU 2026', tipo: 'intervalo', de: '01/01/2026', ate: '31/12/2026', valor: '3.650,00' });
    const v = (await planoDoParceiro(a)).find((l) => l.codigo === 'iptu')!;
    expect(await ocultarLinha(a, DONA(), { linha: 'iptu', ocultar: true, versao: v.versao }, 'Marina')).toMatchObject({ ok: true, mudou: true });
    const oculta = (await planoDoParceiro(a)).find((l) => l.codigo === 'iptu')!;
    expect(oculta.ativa).toBe(false);
    // Com valor no período, continua na tela, marcada "oculta": 3650,00 em 365 dias = 10,00/dia × 31 = 310,00 em outubro.
    const d = await dre(a, DONA(), { tipo: 'rede' }, '2026-10-10', '2026-11-05');
    expect(linha(d!, 'iptu')).toMatchObject({ oculta: true, nota: 'oculta', valorCentavos: 31000 });
    // Sem valor, a linha oculta sai da tela.
    const semValor = await dre(a, DONA(), { tipo: 'rede' }, '2025-02-10', '2025-03-05');
    expect(semValor!.resultado.linhas.find((l) => l.codigo === 'iptu')).toBeUndefined();
    // Despesa nova numa linha oculta (campo forjado): recusada.
    expect(await lancar(DONA(), { linha: 'iptu' })).toMatchObject({ ok: false, erros: { linha: expect.stringMatching(/oculta/) } });
    // Reexibir volta ao formulário.
    expect(await ocultarLinha(a, DONA(), { linha: 'iptu', ocultar: false, versao: oculta.versao }, 'Marina')).toMatchObject({ ok: true, mudou: true });
    // Calculada: não renomeia, não oculta, não recebe despesa.
    for (const calc of [CODIGO.cmv, 'grupo:PESSOAL', CODIGO.receitaLiquida, 'receita-loja']) {
      expect(await renomearLinha(a, DONA(), { linha: calc, nome: 'Qualquer', versao: '' }, 'Marina'), calc).toMatchObject({ ok: false });
      expect(await ocultarLinha(a, DONA(), { linha: calc, ocultar: true, versao: '' }, 'Marina'), calc).toMatchObject({ ok: false });
      expect(await lancar(DONA(), { linha: calc }), calc).toMatchObject({ ok: false, erros: { linha: expect.stringMatching(/calculada/) } });
    }
    expect((await planoDoParceiro(a)).find((l) => l.codigo === CODIGO.cmv)!.nome).toBe('CMV');
    await a.despesa.delete({ where: { id } });
  });

  it('linha criada pela casa: nome único, grupo de despesa, recebe despesa; grupo calculado e nome vazio recusados; só quem define o plano (rede inteira)', async () => {
    expect(await criarLinha(a, DONA(), { nome: 'Seguro do ponto', grupo: 'ADMINISTRATIVA' }, 'Marina')).toMatchObject({ ok: true });
    expect(await criarLinha(a, DONA(), { nome: 'seguro DO ponto', grupo: 'OUTRAS' }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.stringMatching(/Já existe/) } });
    expect(await criarLinha(a, DONA(), { nome: 'X', grupo: 'RECEITA' }, 'Marina')).toMatchObject({ ok: false, erros: { grupo: expect.any(String) } });
    expect(await criarLinha(a, DONA(), { nome: 'X', grupo: 'CMV' }, 'Marina')).toMatchObject({ ok: false });
    expect(await criarLinha(a, DONA(), { nome: '   ', grupo: 'OUTRAS' }, 'Marina')).toMatchObject({ ok: false, erros: { nome: expect.any(String) } });
    expect(await criarLinha(a, DONA(), { nome: 'y'.repeat(61), grupo: 'OUTRAS' }, 'Marina')).toMatchObject({ ok: false });
    const nova = (await planoDoParceiro(a)).find((l) => l.nome === 'Seguro do ponto')!;
    expect(nova).toMatchObject({ codigo: null, grupo: 'ADMINISTRATIVA', calculada: false });
    const id = await lancado(DONA(), { linha: chaveDaLinha(nova), descricao: 'Seguro anual', valor: '120,00' });
    expect((await obterDespesa(a, DONA(), id, HOJE))!.despesa.linhaNome).toBe('Seguro do ponto');
    await a.despesa.delete({ where: { id } });
    // Gerente (sem a permissão), dono de loja (a permissão exige a rede) e operador não mexem no plano.
    for (const quem of [GERENTE_REDE(), DONA_DE_LOJA(), OPERADOR()]) {
      expect(await criarLinha(a, quem, { nome: 'Outra', grupo: 'OUTRAS' }, 'X')).toMatchObject({ ok: false });
    }
    expect(await renomearLinha(a, GERENTE_REDE(), { linha: 'aluguel', nome: 'Hack', versao: '' }, 'X')).toMatchObject({ ok: false });
  });

  // ------------------------------------------------------------ 2. despesa por competência
  it('critério 4: R$ 3.100,00 de mês — mensal 3.100,00; parcial em 16/10 apropria R$ 1.500,00 (15 dias até ontem)', async () => {
    const id = await lancado(DONA(), { lojaId: ids.vp, descricao: 'Aluguel da Penha (DRE)' });
    const mensal = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05');
    expect(linha(mensal!, 'aluguel').valorCentavos).toBe(310000);
    expect(mensal!.encerrado).toBe(true);
    const parcial = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-16', '2026-10-16');
    expect(linha(parcial!, 'aluguel').valorCentavos).toBe(150000);
    expect(parcial).toMatchObject({ ate: '2026-10-15', diaDeHoje: 16, diasDoPeriodo: 31, diasApurados: 15, emCurso: true });
    // Despesa de loja não vai para a outra loja.
    const outra = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.dlv }, '2026-10-16', '2026-10-16');
    expect(linha(outra!, 'aluguel').valorCentavos).toBe(0);
    // Primeiro dia do período: ainda nenhum dia apurado.
    const primeiro = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-01', '2026-10-01');
    expect(primeiro).toMatchObject({ ate: null, diasApurados: 0 });
    expect(linha(primeiro!, 'aluguel').valorCentavos).toBe(0);
    await a.despesa.delete({ where: { id } });
  });

  it('critério 4: em período semanal as fatias somam R$ 3.100,00 EXATOS, conferidas fatia a fatia', async () => {
    await w.regraDoPeriodo.create({ data: { parceiroId: W.id, vigenteDesde: dia('2020-01-01'), tipo: 'SEMANAL', diaInicio: 1, criadoPorNome: 'teste' } });
    await lancado(DONA(), { descricao: 'Aluguel semanal' }, w);
    const datas = ['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
    const fatias: number[] = [];
    for (const d of datas) {
      const r = await dre(w, DONA(), { tipo: 'rede' }, d, '2026-12-01');
      fatias.push(linha(r!, 'aluguel').valorCentavos!);
    }
    expect(fatias).toEqual([40000, 70000, 70000, 70000, 60000]);
    expect(fatias.reduce((x, y) => x + y, 0)).toBe(310000);
    // O período de 01/10 é a semana que começa em 28/09 (a regra manda).
    expect((await dre(w, DONA(), { tipo: 'rede' }, '2026-10-01', '2026-12-01'))!.periodo).toMatchObject({ inicio: '2026-09-28', fim: '2026-10-04' });
  });

  it('critérios 6 e 7: valor e competência inválidos são recusados com frase, sem gravar', async () => {
    const antes = await a.despesa.count();
    for (const valor of ['0', '-5', '1e3', '10.000.000,01', '']) {
      const r = await lancar(DONA(), { valor });
      expect(r, valor).toMatchObject({ ok: false, erros: { valor: expect.any(String) } });
    }
    expect(await lancar(DONA(), { tipo: 'dia', dia: '18/10/2027' })).toMatchObject({ ok: false, erros: { competencia: expect.stringMatching(/12 meses/) } });
    expect(await lancar(DONA(), { tipo: 'intervalo', de: '01/01/2026', ate: '02/01/2027' })).toMatchObject({ ok: false, erros: { competencia: expect.stringMatching(/366/) } });
    expect(await lancar(DONA(), { tipo: 'dia', dia: '31/12/2019' })).toMatchObject({ ok: false, erros: { competencia: expect.any(String) } });
    expect(await lancar(DONA(), { envio: 'curto' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/venceu/) } });
    expect(await a.despesa.count()).toBe(antes);
    const ok = await lancar(DONA(), { valor: '1.234,56', descricao: 'Reparo' });
    expect(ok.ok).toBe(true);
    expect((await a.despesa.findFirst({ where: { descricao: 'Reparo' } }))!.valorCentavos).toBe(123456);
    await a.despesa.deleteMany({ where: { descricao: 'Reparo' } });
  });

  it('critério 9: duplo envio do mesmo formulário (também em paralelo) = uma só despesa, "já lançada"', async () => {
    const mesmo = envio();
    const primeira = await lancarDespesa(a, DONA(), textos({ envio: mesmo, descricao: 'Duplo' }), 'Gil', HOJE);
    const segunda = await lancarDespesa(a, DONA(), textos({ envio: mesmo, descricao: 'Duplo' }), 'Gil', HOJE);
    expect(primeira).toMatchObject({ ok: true, jaLancada: false });
    expect(segunda).toMatchObject({ ok: true, jaLancada: true });
    expect(segunda.ok && primeira.ok && segunda.id === primeira.id).toBe(true);
    const outro = envio();
    const rs = await Promise.all(Array.from({ length: 6 }, () => lancarDespesa(a, DONA(), textos({ envio: outro, descricao: 'Duplo paralelo' }), 'Gil', HOJE)));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rs.filter((r) => r.ok && !r.jaLancada)).toHaveLength(1);
    expect(await a.despesa.count({ where: { descricao: { startsWith: 'Duplo' } } })).toBe(2);
    expect(await a.historicoAlteracao.count({ where: { entidade: 'Despesa', entidadeId: primeira.ok ? primeira.id : '' } })).toBe(1);
    await a.despesa.deleteMany({ where: { descricao: { startsWith: 'Duplo' } } });
  });

  // ------------------------------------------------------------ 3. recorrência e contas a pagar
  it('critério 8: recorrente de setembro sem filha em outubro aparece em "falta lançar"; "do mês passado" duas vezes = uma filha', async () => {
    const origem = await lancado(DONA(), { lojaId: ids.vp, descricao: 'Aluguel recorrente', mes: '2026-09', recorrente: true, vencimento: '05/09/2026' });
    const em = await a.transacao((tx) => recorrentesEmFalta(tx, DONA(), '2026-10'));
    expect(em.map((x) => x.origemId)).toEqual([origem]);
    expect(em[0]).toMatchObject({ valorCentavos: 310000, descricao: 'Aluguel recorrente', lojaNome: 'Vila da Penha' });
    const faltas = await a.transacao((tx) => faltaLancar(tx, DONA(), '2026-10-01', '2026-10-16', '2026-10-16'));
    expect(faltas.map((x) => x.descricao)).toEqual(['Aluguel recorrente']);
    // Em setembro (o mês dela) não falta nada: ela é a de origem.
    expect(await a.transacao((tx) => faltaLancar(tx, DONA(), '2026-09-01', '2026-09-30', '2026-10-16'))).toEqual([]);

    const e1 = envio();
    const r1 = await lancarDoMesPassado(a, DONA(), { envio: e1, mes: '2026-10', itens: [{ origemId: origem, valor: '3.250,00' }] }, 'Gil', HOJE);
    expect(r1).toEqual({ ok: true, criadas: 1, jaLancadas: 0 });
    // A segunda vez (outra aba, duplo clique, ou outro envio): nenhuma nova.
    const r2 = await lancarDoMesPassado(a, DONA(), { envio: e1, mes: '2026-10', itens: [{ origemId: origem, valor: '3.250,00' }] }, 'Gil', HOJE);
    const r3 = await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-10', itens: [{ origemId: origem, valor: '3.250,00' }] }, 'Gil', HOJE);
    expect(r2).toEqual({ ok: true, criadas: 0, jaLancadas: 1 });
    expect(r3).toEqual({ ok: true, criadas: 0, jaLancadas: 1 });
    const filhas = await a.despesa.findMany({ where: { repeteDeId: origem } });
    expect(filhas).toHaveLength(1);
    expect(filhas[0]).toMatchObject({ valorCentavos: 325000, recorrente: true, lojaId: ids.vp, competencia: dia('2026-10-01'), competenciaFim: dia('2026-10-31'), vencimento: dia('2026-10-05') });
    expect(await a.transacao((tx) => faltaLancar(tx, DONA(), '2026-10-01', '2026-10-16', '2026-10-16'))).toEqual([]);
    // Corrida (duas abas ao mesmo tempo) no mês seguinte: uma filha só.
    const mes11 = await Promise.all([
      lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-11', itens: [{ origemId: filhas[0].id, valor: '3.250,00' }] }, 'Gil', '2026-11-05'),
      lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-11', itens: [{ origemId: filhas[0].id, valor: '3.300,00' }] }, 'Gil', '2026-11-05'),
    ]);
    expect(mes11.filter((r) => r.ok && r.criadas === 1)).toHaveLength(1);
    expect(await a.despesa.count({ where: { repeteDeId: filhas[0].id } })).toBe(1);
  }, 60_000);

  it('"do mês passado": valor inválido, mês errado, gerente de outra loja e linha oculta não gravam nada', async () => {
    const origem = (await a.despesa.findFirst({ where: { descricao: 'Aluguel recorrente', competencia: dia('2026-09-01') } }))!;
    const filha = (await a.despesa.findFirst({ where: { repeteDeId: origem.id } }))!;
    // A de novembro (filha da filha) vai ser a origem de dezembro: não da de setembro.
    const antes = await a.despesa.count();
    expect(await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-12', itens: [{ origemId: filha.id, valor: 'abc' }] }, 'Gil', '2026-12-05')).toMatchObject({ ok: false, porItem: { [filha.id]: expect.any(String) } });
    expect(await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-12', itens: [] }, 'Gil', '2026-12-05')).toMatchObject({ ok: false });
    expect(await lancarDoMesPassado(a, DONA(), { envio: 'x', mes: '2026-12', itens: [{ origemId: filha.id, valor: '1,00' }] }, 'Gil', '2026-12-05')).toMatchObject({ ok: false });
    expect(await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2027-12', itens: [{ origemId: filha.id, valor: '1,00' }] }, 'Gil', '2026-12-05')).toMatchObject({ ok: false });
    // Origem de outra loja que o gerente não alcança.
    expect(await lancarDoMesPassado(a, alcance('GERENTE', [ids.dlv]), { envio: envio(), mes: '2026-11', itens: [{ origemId: origem.id, valor: '1,00' }] }, 'Gil', '2026-11-05')).toMatchObject({ ok: false });
    expect(await a.despesa.count()).toBe(antes);
    // "Não repete mais": some da lista e fica no histórico.
    const pronta = await obterDespesa(a, DONA(), filha.id, HOJE);
    expect(await pararDeRepetir(a, DONA(), filha.id, pronta!.despesa.versao, 'Marina')).toMatchObject({ ok: true, mudou: true });
    expect((await a.despesa.findUnique({ where: { id: filha.id } }))!.recorrente).toBe(false);
    const h = await listarHistorico(a, { de: [{ entidade: 'Despesa', ids: [filha.id] }], verPrecos: false, verDre: true, limite: 10 });
    expect(h.find((x) => x.mudancas.some((m) => m.campo === 'repete todo mês'))).toBeTruthy();
  });

  it('contas a pagar: filtro "A pagar" (vencidas e próximos 7 dias), pagar tira da lista, desfazer volta', async () => {
    const vencida = await lancado(DONA(), { descricao: 'Fornecedor atrasado', linha: 'sistemas', vencimento: '10/10/2026', valor: '200,00' });
    const logo = await lancado(DONA(), { descricao: 'Contador', linha: 'contabilidade', vencimento: '20/10/2026', valor: '800,00' });
    const longe = await lancado(DONA(), { descricao: 'Seguro', linha: 'diversas', vencimento: '30/11/2026', valor: '50,00' });
    const semVenc = await lancado(DONA(), { descricao: 'Sem vencimento', linha: 'diversas', valor: '10,00' });
    const meus = ['Fornecedor atrasado', 'Contador', 'Seguro'];
    const doTeste = async () => (await listarDespesas(a, DONA(), { situacao: 'a-pagar', pagina: 1 }, HOJE)).itens.filter((i) => meus.includes(i.descricao));
    const lista = await listarDespesas(a, DONA(), { situacao: 'a-pagar', pagina: 1 }, HOJE);
    expect((await doTeste()).map((i) => i.descricao)).toEqual(meus);
    expect((await doTeste()).map((i) => i.pagamento)).toEqual(['vencida', 'vence-logo', 'a-vencer']);
    // A de outra série (recorrente, com vencimento em setembro/outubro) também conta nos totais: os meus somam 3 contas e R$ 1.050,00.
    expect(lista.aPagar.total - lista.itens.filter((i) => !meus.includes(i.descricao)).length).toBe(3);
    const v = (await obterDespesa(a, DONA(), vencida, HOJE))!.despesa.versao;
    expect(await pagarDespesa(a, DONA(), vencida, { data: '', versao: v }, 'Marina', HOJE)).toMatchObject({ ok: true, mudou: true });
    expect((await a.despesa.findUnique({ where: { id: vencida } }))!.pagaEm).toEqual(dia(HOJE));
    expect((await doTeste()).map((i) => i.descricao)).toEqual(['Contador', 'Seguro']);
    expect((await listarDespesas(a, DONA(), { situacao: 'pagas', mes: '2026-10', pagina: 1 }, HOJE)).itens.map((i) => i.descricao)).toEqual(['Fornecedor atrasado']);
    // Duas abas: pagar com a versão velha é conflito.
    expect(await pagarDespesa(a, DONA(), vencida, { data: '', versao: v }, 'Outra', HOJE)).toMatchObject({ ok: false, conflito: true });
    // Data do pagamento futura é recusada.
    const v2 = (await obterDespesa(a, DONA(), logo, HOJE))!.despesa.versao;
    expect(await pagarDespesa(a, DONA(), logo, { data: '18/10/2026', versao: v2 }, 'Marina', HOJE)).toMatchObject({ ok: false });
    const v3 = (await obterDespesa(a, DONA(), vencida, HOJE))!.despesa.versao;
    expect(await desfazerPagamento(a, DONA(), vencida, v3, 'Marina')).toMatchObject({ ok: true, mudou: true });
    expect((await doTeste()).map((i) => i.descricao)).toEqual(meus);
    await a.despesa.deleteMany({ where: { id: { in: [vencida, logo, longe, semVenc] } } });
  });

  it('remover: motivo de 3 a 200 letras, o antes fica no histórico; com filha, recusado', async () => {
    const id = await lancado(DONA(), { descricao: 'Lancei errado', linha: 'diversas', valor: '77,00' });
    const v = (await obterDespesa(a, DONA(), id, HOJE))!.despesa.versao;
    expect(await removerDespesa(a, DONA(), id, { motivo: 'ab', versao: v }, 'Marina')).toMatchObject({ ok: false });
    expect(await removerDespesa(a, DONA(), id, { motivo: 'Lancei na loja errada', versao: 'velha' }, 'Marina')).toMatchObject({ ok: false, conflito: true });
    expect(await removerDespesa(a, DONA(), id, { motivo: 'Lancei na loja errada', versao: v }, 'Marina')).toMatchObject({ ok: true });
    expect(await doBanco(id)).toBeNull();
    const h = await listarHistorico(a, { de: [{ entidade: 'Despesa', ids: [id] }], verPrecos: false, verDre: true, limite: 10 });
    const ex = h.find((x) => x.acao === 'EXCLUIU')!;
    expect(ex.motivo).toBe('Lancei na loja errada');
    expect(ex.mudancas.find((m) => m.campo === 'valor')!.antes?.replace(/\s/g, ' ')).toBe('R$ 77,00');
    // Com filha: recusa.
    const origem = (await a.despesa.findFirst({ where: { descricao: 'Aluguel recorrente', competencia: dia('2026-09-01') } }))!;
    expect(await removerDespesa(a, DONA(), origem.id, { motivo: 'Teste da filha', versao: (await obterDespesa(a, DONA(), origem.id, HOJE))!.despesa.versao }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/repetida/) } });
  });

  it('editar: condicional à versão, só grava o que mudou; intervalo e recorrente de mês são conferidos', async () => {
    const id = await lancado(DONA(), { descricao: 'Para editar', linha: 'diversas', valor: '100,00', tipo: 'dia', dia: '05/10/2026' });
    const d0 = await obterDespesa(a, DONA(), id, HOJE);
    const mesmo = await editarDespesa(a, DONA(), id, edicao(d0), 'Gil', HOJE);
    expect(mesmo).toMatchObject({ ok: true, mudou: false });
    const hAntes = await a.historicoAlteracao.count({ where: { entidadeId: id } });
    const mudou = await editarDespesa(a, DONA(), id, edicao(d0, { valor: '150,00' }), 'Gil', HOJE);
    expect(mudou).toMatchObject({ ok: true, mudou: true });
    expect((await doBanco(id))!.valorCentavos).toBe(15000);
    expect(await a.historicoAlteracao.count({ where: { entidadeId: id } })).toBe(hAntes + 1);
    // 2ª aba com a versão velha.
    expect(await editarDespesa(a, DONA(), id, edicao(d0, { valor: '170,00' }), 'Outra', HOJE)).toMatchObject({ ok: false, conflito: true });
    const d1 = await obterDespesa(a, DONA(), id, HOJE);
    expect(await editarDespesa(a, DONA(), id, edicao(d1, { tipo: 'dia', dia: '05/11/2027' }), 'Gil', HOJE)).toMatchObject({ ok: false, erros: { competencia: expect.any(String) } });
    expect(await editarDespesa(a, DONA(), id, edicao(d1, { tipo: 'dia', recorrente: true }), 'Gil', HOJE)).toMatchObject({ ok: false, erros: { recorrente: expect.any(String) } });
    // Mudar para mês inteiro e repetir todo mês.
    expect(await editarDespesa(a, DONA(), id, edicao(d1, { tipo: 'mes', mes: '2026-10', recorrente: true }), 'Gil', HOJE)).toMatchObject({ ok: true, mudou: true });
    expect(await doBanco(id)).toMatchObject({ competencia: dia('2026-10-01'), competenciaFim: dia('2026-10-31'), recorrente: true });
    await a.despesa.delete({ where: { id } });
  });

  // ------------------------------------------------------------ 4. período fechado
  it('critério 10: com o período FECHADO, pagar passa; editar nos dois sentidos, criar, remover e o intervalo que só encosta são recusados', async () => {
    const fechado = await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Agosto de 2026', inicio: '2026-08-01', fim: '2026-08-31' }));
    const dentro = await a.despesa.create({ data: { parceiroId: A.id, linhaId: (await planoDoParceiro(a)).find((l) => l.codigo === 'aluguel')!.id!, descricao: 'Aluguel de agosto', competencia: dia('2026-08-01'), competenciaFim: dia('2026-08-31'), valorCentavos: 100000, vencimento: dia('2026-09-05'), atualizadoPorNome: 'x' } });
    const fora = await lancado(DONA(), { descricao: 'Aluguel de outubro (fora)', linha: 'diversas', valor: '50,00' });
    const frase = /Agosto de 2026 já foi fechado/;
    // Pagar passa (não muda o DRE); mudar só o vencimento também.
    const dd = await obterDespesa(a, DONA(), dentro.id, HOJE);
    expect(dd!.fechado).toBe('Agosto de 2026');
    expect(await pagarDespesa(a, DONA(), dentro.id, { data: '', versao: dd!.despesa.versao }, 'Marina', HOJE)).toMatchObject({ ok: true, mudou: true });
    const dd2 = await obterDespesa(a, DONA(), dentro.id, HOJE);
    expect(await editarDespesa(a, DONA(), dentro.id, edicao(dd2, { vencimento: '10/09/2026' }), 'Marina', HOJE)).toMatchObject({ ok: true, mudou: true });
    // Editar o valor: recusado.
    const dd3 = await obterDespesa(a, DONA(), dentro.id, HOJE);
    const r1 = await editarDespesa(a, DONA(), dentro.id, edicao(dd3, { valor: '1,00' }), 'Marina', HOJE);
    expect(r1).toMatchObject({ ok: false });
    expect(JSON.stringify(r1)).toMatch(frase);
    // Mover a de fora PARA DENTRO do fechado: recusado.
    const df = await obterDespesa(a, DONA(), fora, HOJE);
    const r2 = await editarDespesa(a, DONA(), fora, edicao(df, { mes: '2026-08' }), 'Marina', HOJE);
    expect(JSON.stringify(r2)).toMatch(frase);
    expect((await doBanco(fora))!.competencia).toEqual(dia('2026-10-01'));
    // Mover a de dentro PARA FORA: recusado também (tira número de um período fechado).
    const r3 = await editarDespesa(a, DONA(), dentro.id, edicao(await obterDespesa(a, DONA(), dentro.id, HOJE), { mes: '2026-10' }), 'Marina', HOJE);
    expect(JSON.stringify(r3)).toMatch(frase);
    // Criar dentro: recusado. Intervalo que só encosta (25/07 a 02/08): recusado.
    expect(JSON.stringify(await lancar(DONA(), { tipo: 'dia', dia: '15/08/2026' }))).toMatch(frase);
    expect(JSON.stringify(await lancar(DONA(), { tipo: 'intervalo', de: '25/07/2026', ate: '02/08/2026' }))).toMatch(frase);
    expect(await lancar(DONA(), { tipo: 'intervalo', de: '25/07/2026', ate: '31/07/2026', linha: 'diversas', descricao: 'Antes do fechado' })).toMatchObject({ ok: true });
    // Remover: recusado.
    const r4 = await removerDespesa(a, DONA(), dentro.id, { motivo: 'Tentativa de remover', versao: (await obterDespesa(a, DONA(), dentro.id, HOJE))!.despesa.versao }, 'Marina');
    expect(JSON.stringify(r4)).toMatch(frase);
    expect(await doBanco(dentro.id)).not.toBeNull();
    // "Do mês passado" cai em mês fechado: recusado.
    const origem = await a.despesa.create({ data: { parceiroId: A.id, linhaId: dentro.linhaId, descricao: 'Recorrente de julho', competencia: dia('2026-07-01'), competenciaFim: dia('2026-07-31'), valorCentavos: 1000, recorrente: true, atualizadoPorNome: 'x' } });
    expect(JSON.stringify(await lancarDoMesPassado(a, DONA(), { envio: envio(), mes: '2026-08', itens: [{ origemId: origem.id, valor: '10,00' }] }, 'Gil', HOJE))).toMatch(frase);
    // O DRE do período fechado ainda lê (2.2b lê da fotografia).
    const d = await dre(a, DONA(), { tipo: 'rede' }, '2026-08-10', HOJE);
    expect(d).toMatchObject({ status: 'FECHADO' });
    await a.despesa.deleteMany({ where: { id: { in: [dentro.id, fora, origem.id] } } });
    await a.despesa.deleteMany({ where: { descricao: 'Antes do fechado' } });
    await reabrirPeriodoDeTeste(a, fechado.id);
  });

  it('a trava compartilhada: lançar despesa espera o fechamento em curso e, depois dele, é recusado', async () => {
    const caixa: { lancado?: Promise<unknown> } = {};
    let terminouAntes = false;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx); // a 2.2b, fechando: trava exclusiva
      caixa.lancado = lancar(DONA(), { tipo: 'dia', dia: '12/06/2026', linha: 'diversas', descricao: 'Corrida' }).then((r) => {
        terminouAntes = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminouAntes).toBe(false);
      await criarPeriodoFechadoDeTeste(tx, { nome: 'Junho de 2026', inicio: '2026-06-01', fim: '2026-06-30' });
    });
    const r = (await caixa.lancado) as { ok: boolean; erros: { competencia?: string } };
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('Junho de 2026');
    expect(await a.despesa.count({ where: { descricao: 'Corrida' } })).toBe(0);
    await reabrirPeriodoDeTeste(a, (await a.periodoApuracao.findFirst({ where: { nome: 'Junho de 2026' } }))!.id);
  });

  // ------------------------------------------------------------ 5. isolamento, alcance e vazamento
  it('isolamento: outro parceiro não lê, não lança em loja alheia e não usa linha alheia; o banco recusa por SQL cru', async () => {
    const id = await lancado(DONA(), { lojaId: ids.vp, descricao: 'Só da A', linha: 'diversas' });
    expect(await obterDespesa(b, DONA(), id, HOJE)).toBeNull();
    expect((await listarDespesas(b, DONA(), { situacao: 'todas', mes: '2026-10', pagina: 1 }, HOJE)).itens).toEqual([]);
    // Loja da A no parceiro B (e o contrário): "não encontrada".
    expect(await lancar(DONA(), { lojaId: ids.lojaB }, a)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await lancar(DONA(), { lojaId: ids.vp }, b)).toMatchObject({ ok: false, naoEncontrado: true });
    // Linha do outro parceiro (campo forjado): frase, não 500.
    await b.transacao((tx) => garantirPlano(tx));
    const linhaDaB = (await planoDoParceiro(b)).find((l) => l.codigo === 'aluguel')!.id!;
    expect(await lancar(DONA(), { linha: `id:${linhaDaB}` })).toMatchObject({ ok: false, erros: { linha: expect.any(String) } });
    expect(await lancar(DONA(), { linha: 'id:inexistente' })).toMatchObject({ ok: false, erros: { linha: expect.any(String) } });
    expect(await lancar(DONA(), { linha: '../../etc' })).toMatchObject({ ok: false });
    // Editar a despesa da A usando o contexto da B: nada.
    const d = await obterDespesa(a, DONA(), id, HOJE);
    expect(await editarDespesa(b, DONA(), id, edicao(d), 'Beto', HOJE)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await removerDespesa(b, DONA(), id, { motivo: 'Tentativa alheia', versao: d!.despesa.versao }, 'Beto')).toMatchObject({ ok: false, naoEncontrado: true });
    // O banco: FK composta com o parceiro (linha da B numa despesa da A).
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "Despesa"("id","parceiroId","linhaId","descricao","competencia","valorCentavos","atualizadoEm") VALUES ('forjada','${A.id}','${linhaDaB}','x','2026-10-01',100,now())`),
    ).rejects.toThrow();
    await a.despesa.delete({ where: { id } });
  });

  it('critério 15: o gerente de uma loja só vê a loja dele, nunca despesa da rede (lista, detalhe, DRE e total)', async () => {
    const daRede = await lancado(DONA(), { descricao: 'Contador do grupo', linha: 'contabilidade', valor: '900,00', lojaId: '' });
    const daVp = await lancado(DONA(), { descricao: 'Luz da Penha', linha: 'energia', valor: '400,00', lojaId: ids.vp });
    const daDlv = await lancado(DONA(), { descricao: 'Luz da Delivery', linha: 'energia', valor: '300,00', lojaId: ids.dlv });
    const lista = await listarDespesas(a, GERENTE_VP(), { situacao: 'todas', mes: '2026-10', pagina: 1 }, HOJE);
    const nomes = lista.itens.map((i) => i.descricao);
    expect(nomes).toContain('Luz da Penha');
    expect(nomes).not.toContain('Contador do grupo');
    expect(nomes).not.toContain('Luz da Delivery');
    expect(lista.itens.every((i) => i.lojaId === ids.vp)).toBe(true);
    expect(JSON.stringify(lista)).not.toContain('Contador do grupo');
    expect(await obterDespesa(a, GERENTE_VP(), daRede, HOJE)).toBeNull();
    expect(await obterDespesa(a, GERENTE_VP(), daDlv, HOJE)).toBeNull();
    expect(await obterDespesa(a, GERENTE_VP(), daVp, HOJE)).not.toBeNull();
    // Lançar/editar/remover/pagar da rede ou de outra loja: recusado, nada gravado.
    expect(await lancar(GERENTE_VP(), { lojaId: '' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/rede inteira/) } });
    expect(await lancar(GERENTE_VP(), { lojaId: ids.dlv })).toMatchObject({ ok: false, naoEncontrado: true });
    const dr = await obterDespesa(a, DONA(), daRede, HOJE);
    expect(await editarDespesa(a, GERENTE_VP(), daRede, edicao(dr, { valor: '1,00' }), 'Gil', HOJE)).toMatchObject({ ok: false });
    expect(await pagarDespesa(a, GERENTE_VP(), daRede, { data: '', versao: dr!.despesa.versao }, 'Gil', HOJE)).toMatchObject({ ok: false });
    expect(await removerDespesa(a, GERENTE_VP(), daRede, { motivo: 'Tentativa do gerente', versao: dr!.despesa.versao }, 'Gil')).toMatchObject({ ok: false });
    // O gerente move a dele para a rede? Recusado (loja de depois).
    const dv = await obterDespesa(a, GERENTE_VP(), daVp, HOJE);
    expect(await editarDespesa(a, GERENTE_VP(), daVp, edicao(dv, { lojaId: '' }), 'Gil', HOJE)).toMatchObject({ ok: false });
    expect(await editarDespesa(a, GERENTE_VP(), daVp, edicao(dv, { lojaId: ids.dlv }), 'Gil', HOJE)).toMatchObject({ ok: false });
    // DRE: a rede não abre; a loja dele sim e sem a despesa da rede; a outra loja não existe para ele.
    expect(await dre(a, GERENTE_VP(), { tipo: 'rede' }, '2026-10-10')).toBeNull();
    expect(await dre(a, GERENTE_VP(), { tipo: 'loja', lojaId: ids.dlv }, '2026-10-10')).toBeNull();
    const meu = await dre(a, GERENTE_VP(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', '2026-11-05');
    expect(linha(meu!, 'energia').valorCentavos).toBe(40000);
    expect(linha(meu!, 'contabilidade').valorCentavos).toBe(0);
    expect(meu!.porLoja).toBeNull();
    expect(JSON.stringify(meu)).not.toContain('Contador do grupo');
    // Gerente com a rede inteira abre a rede, e ela inclui a da rede.
    const rede = await dre(a, GERENTE_REDE(), { tipo: 'rede' }, '2026-10-10', '2026-11-05');
    expect(linha(rede!, 'contabilidade').valorCentavos).toBe(90000);
    expect(linha(rede!, 'energia').valorCentavos).toBe(70000);
    expect(rede!.porLoja!.map((l) => l.loja.nome).sort()).toEqual(['Penha Delivery', 'Vila da Penha']);
    await a.despesa.deleteMany({ where: { id: { in: [daRede, daVp, daDlv] } } });
  });

  it('critério 15: operador não vê nem lança; "lançar despesas" sem "ver DRE" lança e lista, mas não abre o DRE', async () => {
    expect(await listarDespesas(a, OPERADOR(), { situacao: 'todas', mes: '2026-10', pagina: 1 }, HOJE)).toMatchObject({ itens: [], total: 0 });
    expect(await lancar(OPERADOR(), { lojaId: ids.vp })).toMatchObject({ ok: false });
    expect(await dre(a, OPERADOR(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10')).toBeNull();
    const id = await lancado(ADMIN_REDE(), { descricao: 'Lançada pelo administrativo', linha: 'diversas', valor: '33,00' });
    const lista = await listarDespesas(a, ADMIN_REDE(), { situacao: 'todas', mes: '2026-10', pagina: 1 }, HOJE);
    expect(lista.itens.map((i) => i.descricao)).toContain('Lançada pelo administrativo');
    expect(await obterDespesa(a, ADMIN_REDE(), id, HOJE)).not.toBeNull();
    expect(await dre(a, ADMIN_REDE(), { tipo: 'rede' }, '2026-10-10')).toBeNull();
    expect(await dre(a, ADMIN_REDE(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10')).toBeNull();
    await a.despesa.delete({ where: { id } });
  });

  it('critério 15: o histórico com "ver o histórico" mas sem "ver DRE" não recebe despesa, linha do plano nem regra do período', async () => {
    await lancado(DONA(), { descricao: 'Aparece no histórico', linha: 'diversas' });
    // A regra do período e a linha do plano: no parceiro B, que tem a sua própria.
    expect(await salvarRegra(b, DONA(), { tipo: 'QUINZENAL', dia: '1', versao: '' }, 'Marina', HOJE)).toMatchObject({ ok: true, mudou: true });
    expect(await criarLinha(b, DONA(), { nome: 'Linha da B', grupo: 'OUTRAS' }, 'Marina')).toMatchObject({ ok: true });
    const semB = await listarHistorico(b, { limite: 500, verPrecos: true, verFaturamento: true });
    expect(semB.some((h) => h.entidade === 'RegraDoPeriodo' || h.entidade === 'DreLinha')).toBe(false);
    expect((await listarHistorico(b, { limite: 500, verPrecos: true, verDre: true })).map((h) => h.entidade)).toEqual(expect.arrayContaining(['RegraDoPeriodo', 'DreLinha']));
    const sem = await listarHistorico(a, { limite: 500, verPrecos: true, verFaturamento: true });
    const entidades = new Set(sem.map((h) => h.entidade));
    for (const e of ['Despesa', 'DreLinha', 'RegraDoPeriodo', 'PeriodoApuracao']) expect(entidades.has(e), e).toBe(false);
    expect((await listarHistorico(a, { limite: 500, verPrecos: true, verFaturamento: true, verDre: false })).some((h) => h.entidade === 'Despesa')).toBe(false);
    const com = await listarHistorico(a, { limite: 500, verPrecos: true, verFaturamento: true, verDre: true });
    expect(com.map((h) => h.entidade)).toEqual(expect.arrayContaining(['Despesa', 'DreLinha']));
    expect(JSON.stringify(sem)).not.toContain('Aparece no histórico');
    // Mesmo pedindo a entidade pelo nome, sem verDre a lista vem vazia dela.
    expect(await listarHistorico(a, { entidade: 'Despesa', limite: 50, verPrecos: true })).toEqual([]);
    expect(SO_HISTORICO().permissoes.has('dre.ver')).toBe(false);
    await a.despesa.deleteMany({ where: { descricao: 'Aparece no histórico' } });
  });

  // ------------------------------------------------------------ 6. o DRE
  it('critério 11: taxas do iFood — sem configuração "falta configurar"; com 23 % + 3,2 % sobre R$ 10.000,00 = R$ 2.620,00', async () => {
    const dia1 = await lancarDia(a, DONA(), { lojaId: ids.vp, data: '2026-10-10', canais: [{ canal: 'IFOOD', valor: '10.000,00', pedidos: '200', clientes: '', naoVendeu: false, versao: '' }, { canal: 'LOJA', valor: '5.000,00', pedidos: '80', clientes: '', naoVendeu: false, versao: '' }] }, 'Gil', HOJE);
    expect(dia1.ok).toBe(true);
    const sem = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', HOJE);
    expect(linha(sem!, CODIGO.taxasIfood)).toMatchObject({ valorCentavos: null, nota: 'falta configurar a taxa' });
    expect(linha(sem!, CODIGO.receitaLiquida)).toMatchObject({ valorCentavos: 1_500_000, semContar: ['a taxa do iFood'] });
    expect(sem!.taxaConfigurada).toBe(false);
    await a.canalConfig.create({ data: { parceiroId: A.id, canal: 'IFOOD', taxaBp: 2300, taxaPagamentoBp: 320 } });
    const com = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', HOJE);
    expect(linha(com!, CODIGO.taxasIfood).valorCentavos).toBe(262000);
    expect(linha(com!, CODIGO.receitaLiquida)).toMatchObject({ valorCentavos: 1_238_000, semContar: [] });
    expect(linha(com!, 'receita-ifood').valorCentavos).toBe(1_000_000);
    expect(linha(com!, 'receita-loja').valorCentavos).toBe(500_000);
    // O parcial até ontem (16/10): o 10/10 está dentro.
    expect(com!.ate).toBe('2026-10-16');
  });

  it('critério 12: o CMV sem nota e sem estoque é nulo e diz a frase; margem e resultados com "sem contar o CMV"', async () => {
    const d = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', HOJE);
    expect(linha(d!, CODIGO.cmv)).toMatchObject({ valorCentavos: null, nota: 'sem nota de compra no período' });
    for (const c of [CODIGO.margem, CODIGO.operacional, CODIGO.resultado]) expect(linha(d!, c).semContar).toEqual(['o CMV']);
  });

  it('a leitura única: a integração vence a digitação — o DRE usa o número dela (nunca a soma)', async () => {
    await a.faturamentoLancamento.create({ data: { parceiroId: A.id, lojaId: ids.dlv, canal: 'DELIVERY_PROPRIO', data: dia('2026-10-11'), valorCentavos: 100_000, pedidos: 10, clientes: 10, origem: 'MANUAL', chaveIdempotencia: `manual:${ids.dlv}:-:DELIVERY_PROPRIO:2026-10-11` } });
    await a.faturamentoLancamento.create({ data: { parceiroId: A.id, lojaId: ids.dlv, canal: 'DELIVERY_PROPRIO', data: dia('2026-10-11'), valorCentavos: 120_000, pedidos: 11, clientes: 11, origem: 'INTEGRACAO', origemRef: 'p1', chaveIdempotencia: 'anotaai:pedido:p1' } });
    const d = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.dlv }, '2026-10-11', HOJE);
    expect(linha(d!, 'receita-delivery').valorCentavos).toBe(120_000);
  });

  it('critério 13: o selo de faltas tem a mesma contagem do calendário da 2.1 para o mesmo recorte', async () => {
    const mes = await obterMes(a, DONA(), { mes: '2026-10' }, HOJE);
    const d = await dre(a, DONA(), { tipo: 'rede' }, '2026-10-10', HOJE);
    expect(d!.faltas.total).toBe(mes.faltas);
    expect(mes.faltas).toBeGreaterThan(0);
    const vp = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-10-10', HOJE);
    expect(vp!.faltas.total).toBe(mes.lojas.find((l) => l.loja.id === ids.vp)!.faltas);
    expect(d!.porLoja!.map((l) => l.faltas).reduce((x, y) => x + y, 0)).toBe(mes.faltas);
  });

  it('a rede é a soma das lojas mais as despesas da rede; a loja não recebe rateio', async () => {
    const r1 = await lancado(DONA(), { descricao: 'Salário VP', linha: 'salarios', valor: '1.000,00', lojaId: ids.vp, mes: '2026-09' });
    const r2 = await lancado(DONA(), { descricao: 'Salário DLV', linha: 'salarios', valor: '500,00', lojaId: ids.dlv, mes: '2026-09' });
    const r3 = await lancado(DONA(), { descricao: 'Pró-labore', linha: 'pro-labore', valor: '2.000,00', lojaId: '', mes: '2026-09' });
    const rede = await dre(a, DONA(), { tipo: 'rede' }, '2026-09-10', '2026-10-05');
    const vp = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.vp }, '2026-09-10', '2026-10-05');
    const dlv = await dre(a, DONA(), { tipo: 'loja', lojaId: ids.dlv }, '2026-09-10', '2026-10-05');
    expect(linha(rede!, 'grupo:PESSOAL').valorCentavos).toBe(350_000);
    expect(linha(vp!, 'grupo:PESSOAL').valorCentavos).toBe(100_000);
    expect(linha(dlv!, 'grupo:PESSOAL').valorCentavos).toBe(50_000);
    await a.despesa.deleteMany({ where: { id: { in: [r1, r2, r3] } } });
  });

  // ------------------------------------------------------------ 7. o período e a regra
  it('critério 14: regra mensal dia 1 → dia 15 mudada em 10/10 — outubro inteiro, 01/11 a 14/11, 15/11 a 14/12; nunca retroativa; pendente substituída', async () => {
    await w.regraDoPeriodo.deleteMany({});
    const inicio = await situacaoDosPeriodos(w, '2026-10-10');
    expect(inicio.regras[0]).toMatchObject({ padrao: true, tipo: 'MENSAL', diaInicio: 1 });
    expect(inicio.versao).toBe('');
    const r = await salvarRegra(w, DONA(), { tipo: 'MENSAL', dia: '15', versao: inicio.versao }, 'Marina', '2026-10-10');
    expect(r).toMatchObject({ ok: true, mudou: true, vigenteDesde: '2026-11-01' });
    expect(await periodoDe(w, '2026-10-10')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' });
    expect(await periodoDe(w, '2026-11-01')).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-14' });
    expect(await periodoDe(w, '2026-11-14')).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-14' });
    expect(await periodoDe(w, '2026-11-15')).toMatchObject({ inicio: '2026-11-15', fim: '2026-12-14' });
    // Duas abas: a segunda, com a versão velha, recebe o conflito.
    expect(await salvarRegra(w, DONA(), { tipo: 'QUINZENAL', dia: '1', versao: '' }, 'Outra', '2026-10-10')).toMatchObject({ ok: false, conflito: true });
    // Uma regra pendente é substituída (e o histórico guarda as duas).
    const v1 = (await situacaoDosPeriodos(w, '2026-10-10')).versao;
    const troca = await salvarRegra(w, DONA(), { tipo: 'SEMANAL', dia: '1', versao: v1 }, 'Marina', '2026-10-10');
    expect(troca).toMatchObject({ ok: true, mudou: true, vigenteDesde: '2026-11-01' });
    expect(await w.regraDoPeriodo.count()).toBe(1);
    expect(await periodoDe(w, '2026-10-20')).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(await periodoDe(w, '2026-11-01')).toMatchObject({ inicio: '2026-11-01' }); // semana de 26/10 cortada no início da regra
    const h = await listarHistorico(w, { entidade: 'RegraDoPeriodo', verPrecos: false, verDre: true, limite: 10 });
    expect(h.map((x) => x.acao).sort()).toEqual(['CRIOU', 'CRIOU', 'EXCLUIU']);
    // Voltar à regra de agora cancela a mudança agendada.
    const v2 = (await situacaoDosPeriodos(w, '2026-10-10')).versao;
    expect(await salvarRegra(w, DONA(), { tipo: 'MENSAL', dia: '1', versao: v2 }, 'Marina', '2026-10-10')).toMatchObject({ ok: true, mudou: true, voltouAtual: true });
    expect(await w.regraDoPeriodo.count()).toBe(0);
    // Mesma regra de agora, sem nada agendado: nada muda.
    expect(await salvarRegra(w, DONA(), { tipo: 'MENSAL', dia: '1', versao: '' }, 'Marina', '2026-10-10')).toMatchObject({ ok: true, mudou: false });
    // Só quem tem a rede inteira e a permissão muda; entrada inválida é recusada.
    for (const quem of [GERENTE_REDE(), DONA_DE_LOJA(), OPERADOR()]) expect(await salvarRegra(w, quem, { tipo: 'MENSAL', dia: '5', versao: '' }, 'X', '2026-10-10')).toMatchObject({ ok: false });
    expect(await salvarRegra(w, DONA(), { tipo: 'PERSONALIZADO', dia: '1', versao: '' }, 'X', '2026-10-10')).toMatchObject({ ok: false });
    expect(await salvarRegra(w, DONA(), { tipo: 'MENSAL', dia: '29', versao: '' }, 'X', '2026-10-10')).toMatchObject({ ok: false });
    expect(await w.regraDoPeriodo.count()).toBe(0);
  });

  it('a regra só se inclui: UPDATE por SQL cru é recusado; DELETE da pendente é do código', async () => {
    await w.regraDoPeriodo.create({ data: { parceiroId: W.id, vigenteDesde: dia('2026-11-01'), tipo: 'QUINZENAL', diaInicio: 1, criadoPorNome: 'teste' } });
    await expect(cru(db, perfil, W.id, `UPDATE "RegraDoPeriodo" SET "diaInicio" = 2 WHERE "parceiroId" = '${W.id}'`)).rejects.toThrow(/só se inclui|so_inclusao/);
    await expect(cru(db, perfil, W.id, `UPDATE "RegraDoPeriodo" SET "parceiroId" = '${A.id}' WHERE "parceiroId" = '${W.id}'`)).rejects.toThrow();
    // CHECKs: personalizado e dia fora da faixa.
    await expect(cru(db, perfil, W.id, `INSERT INTO "RegraDoPeriodo"("id","parceiroId","vigenteDesde","tipo","diaInicio") VALUES ('r1','${W.id}','2027-01-01','PERSONALIZADO',1)`)).rejects.toThrow(/tipo_do_catalogo/);
    await expect(cru(db, perfil, W.id, `INSERT INTO "RegraDoPeriodo"("id","parceiroId","vigenteDesde","tipo","diaInicio") VALUES ('r2','${W.id}','2027-01-01','SEMANAL',8)`)).rejects.toThrow(/dia_faixa/);
    await expect(cru(db, perfil, W.id, `INSERT INTO "RegraDoPeriodo"("id","parceiroId","vigenteDesde","tipo","diaInicio") VALUES ('r3','${W.id}','2027-01-01','MENSAL',29)`)).rejects.toThrow(/dia_faixa/);
    await w.regraDoPeriodo.deleteMany({});
  });

  it('critério 14: período sobreposto por SQL cru é recusado; registrar período cruzando outro dá frase', async () => {
    await w.periodoApuracao.create({ data: { parceiroId: W.id, nome: 'Base', inicio: dia('2026-05-10'), fim: dia('2026-05-16') } });
    for (const [i, f] of [['2026-05-16', '2026-05-20'], ['2026-05-01', '2026-05-10'], ['2026-05-12', '2026-05-13'], ['2026-05-01', '2026-05-31']]) {
      await expect(cru(db, perfil, W.id, `INSERT INTO "PeriodoApuracao"("id","parceiroId","nome","inicio","fim") VALUES ('sobre${i}${f}','${W.id}','x','${i}','${f}')`), `${i}..${f}`).rejects.toThrow(/sobrepõe|sem_sobreposicao/);
    }
    // Encostar sem cruzar (17/05 em diante) pode.
    await expect(cru(db, perfil, W.id, `INSERT INTO "PeriodoApuracao"("id","parceiroId","nome","inicio","fim") VALUES ('vizinho','${W.id}','Vizinho','2026-05-17','2026-05-23')`)).resolves.toBeDefined();
    const dentro = await w.transacao((tx) => registrarPeriodo(tx, { inicio: '2026-05-14', fim: '2026-05-20', nome: 'Cruza' }));
    expect(dentro).toMatchObject({ ok: false, erro: expect.stringMatching(/cruza/) });
    const igual = await w.transacao((tx) => registrarPeriodo(tx, { inicio: '2026-05-10', fim: '2026-05-16', nome: 'Base' }));
    expect(igual).toMatchObject({ ok: true, nome: 'Base' });
    // Duas transações registrando períodos que se cruzam ao mesmo tempo: uma passa, a outra tem frase (a trava serializa).
    const [x, y] = await Promise.all([
      w.transacao((tx) => registrarPeriodo(tx, { inicio: '2026-06-01', fim: '2026-06-10', nome: 'P1' })),
      w.transacao((tx) => registrarPeriodo(tx, { inicio: '2026-06-05', fim: '2026-06-15', nome: 'P2' })),
    ]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    await w.periodoApuracao.deleteMany({});
  });

  it('a 1.7 usa o MESMO período: o fechamento de estoque abre com as datas da regra e a regra nova não o atravessa', async () => {
    const C = await db.parceiroFlow.create({ data: { nome: 'DRE C', slug: `dre-c-${sufixo}`, status: 'ATIVO' } });
    criados.push(C.id);
    const c = doParceiro(C.id, db);
    const lc = await cadastrarLoja(c, { nome: 'Penha C' }, 'Marina');
    if (!lc.ok) throw new Error(JSON.stringify(lc));
    const ins = await cadastrarInsumo(c, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Cheddar', unidade: 'KG', conteudo: '5', preco: '89,90', frete: '5,00', conservacao: 'REFRIGERADO' });
    if (!ins.ok) throw new Error(JSON.stringify(ins));
    // A semana do parceiro termina HOJE (o fechamento do período já pode começar).
    const hoje = hojeNoRio();
    const diaDaSemana = ((new Date(`${hoje}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    await c.regraDoPeriodo.create({ data: { parceiroId: C.id, vigenteDesde: dia('2020-01-01'), tipo: 'SEMANAL', diaInicio: (diaDaSemana % 7) + 1, criadoPorNome: 'teste' } });
    const antes = new Date(Date.now() - 10 * DIA_MS);
    expect((await iniciarAbertura(c, DONA(), lc.id, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(c, DONA(), lc.id))!;
    for (const i of ab.itens) expect((await contarItem(c, DONA(), lc.id, { itemId: i.id, embalagens: '', solto: '10', escala: 'base', versao: i.versao }, 'Marina', { agora: antes })).ok).toBe(true);
    const v = (await c.contagem.findFirst({ where: { lojaId: lc.id, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(c, DONA(), lc.id, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);

    const semana = (await situacaoDoPeriodo(c, DONA(), lc.id))!;
    if (!semana.aberto) throw new Error('estoque deveria estar aberto');
    expect(semana.periodo.fim).toBe(hoje);
    expect(semana.periodo).toEqual(await periodoDe(c, hoje)); // a 1.7 e o DRE leem o mesmo
    // Muda a regra HOJE: vale a partir de amanhã; o período de hoje não muda.
    const sit = await situacaoDosPeriodos(c, hoje);
    const mudou = await salvarRegra(c, DONA(), { tipo: 'MENSAL', dia: '15', versao: sit.versao }, 'Marina', hoje);
    expect(mudou).toMatchObject({ ok: true, mudou: true, vigenteDesde: somarDias(hoje, 1) });
    const depoisDaMudanca = (await situacaoDoPeriodo(c, DONA(), lc.id))!;
    if (!depoisDaMudanca.aberto) throw new Error('aberto');
    expect(depoisDaMudanca.periodo).toEqual(semana.periodo);
    // O fechamento registra EXATAMENTE as datas da semana (e não as da regra nova).
    const f = await iniciarFechamento(c, DONA(), lc.id, { inicio: semana.periodo.inicio }, 'Marina');
    expect(f.ok).toBe(true);
    const reg = await c.periodoApuracao.findMany();
    expect(reg).toHaveLength(1);
    expect([reg[0].inicio.toISOString().slice(0, 10), reg[0].fim.toISOString().slice(0, 10)]).toEqual([semana.periodo.inicio, semana.periodo.fim]);
    // O primeiro período da regra nova nasce cortado em amanhã; um período sobreposto à semana é recusado no banco.
    expect((await periodoDe(c, somarDias(hoje, 1))).inicio).toBe(somarDias(hoje, 1));
    await expect(cru(db, perfil, C.id, `INSERT INTO "PeriodoApuracao"("id","parceiroId","nome","inicio","fim") VALUES ('cruza17','${C.id}','x','${hoje}','${somarDias(hoje, 3)}')`)).rejects.toThrow(/sobrepõe|sem_sobreposicao/);
  }, 120_000);

  // ------------------------------------------------------------ 8. CHECKs do banco
  it('os CHECKs do banco recusam por SQL cru: valor, competência, descrição, canal, repetir e a linha do plano', async () => {
    const linhaId = (await planoDoParceiro(a)).find((l) => l.codigo === 'diversas')!.id!;
    const ins = (campos: string, valores: string) =>
      cru(db, perfil, A.id, `INSERT INTO "Despesa"("id","parceiroId","linhaId","atualizadoEm",${campos}) VALUES ('c${globalThis.crypto.randomUUID().slice(0, 8)}','${A.id}','${linhaId}',now(),${valores})`);
    const base = `"descricao","competencia","valorCentavos"`;
    await expect(ins(base, `'x','2026-10-01',0`)).rejects.toThrow(/valor_faixa/);
    await expect(ins(base, `'x','2026-10-01',1000000001`)).rejects.toThrow(/valor_faixa/);
    await expect(ins(base, `'','2026-10-01',100`)).rejects.toThrow(/descricao_curta/);
    await expect(ins(base, `'${'y'.repeat(121)}','2026-10-01',100`)).rejects.toThrow(/descricao_curta/);
    await expect(ins(base, `'x','2019-12-31',100`)).rejects.toThrow(/competencia_minima/);
    await expect(ins(`${base},"competenciaFim"`, `'x','2026-10-10',100,'2026-10-09'`)).rejects.toThrow(/competencia_fim/);
    await expect(ins(`${base},"competenciaFim"`, `'x','2026-01-01',100,'2027-01-02'`)).rejects.toThrow(/competencia_fim/); // 367 dias
    await expect(ins(`${base},"canal"`, `'x','2026-10-01',100,'IFOOD'`)).rejects.toThrow(/canal_nulo/);
    await expect(ins(`${base},"recorrente","competenciaFim"`, `'x','2026-10-02',100,true,'2026-10-31'`)).rejects.toThrow(/recorrente_de_mes_inteiro/);
    await expect(ins(`${base},"recorrente"`, `'x','2026-10-01',100,true`)).rejects.toThrow(/recorrente_de_mes_inteiro/);
    await expect(ins(`${base},"atualizadoPorNome"`, `'x','2026-10-01',100,'${'n'.repeat(121)}'`)).rejects.toThrow(/textos_curtos/);
    await expect(ins(base, `'x','2026-10-01',100`)).resolves.toBeDefined(); // o caminho feliz passa
    await expect(ins(`${base},"competenciaFim"`, `'x','2026-01-01',100,'2026-12-31'`)).resolves.toBeDefined(); // 365 dias
    await a.despesa.deleteMany({ where: { descricao: 'x' } });
    // A linha: nome vazio/longo e calculada sem código.
    await expect(cru(db, perfil, A.id, `UPDATE "DreLinha" SET "nome" = '' WHERE "id" = '${linhaId}'`)).rejects.toThrow(/nome_curto/);
    await expect(cru(db, perfil, A.id, `UPDATE "DreLinha" SET "codigo" = NULL WHERE "parceiroId" = '${A.id}' AND "codigo" = 'cmv'`)).rejects.toThrow(/calculada_tem_codigo/);
    // O mesmo código não repete no parceiro.
    await expect(cru(db, perfil, A.id, `INSERT INTO "DreLinha"("id","parceiroId","nome","grupo","codigo","atualizadoEm") VALUES ('dup1','${A.id}','Outro nome','OUTRAS','aluguel',now())`)).rejects.toThrow();
  });

  it('fino do Guardião: o mesmo envio de outra pessoa não devolve id fora do alcance; repetida fora do alcance não vaza', async () => {
    const mesmo = envio();
    const dela = await lancarDespesa(a, GERENTE_VP(), textos({ envio: mesmo, lojaId: ids.vp, descricao: 'Fino do envio' }), 'Gil', HOJE);
    expect(dela.ok).toBe(true);
    const outra = alcance('GERENTE', [ids.dlv]);
    const r = await lancarDespesa(a, outra, textos({ envio: mesmo, lojaId: ids.dlv, descricao: 'Fino do envio outro' }), 'Ana', HOJE);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(dela.ok ? dela.id : 'x');
    // O mesmo envio, pela mesma pessoa (dentro do alcance), continua sendo "já lançada".
    expect(await lancarDespesa(a, GERENTE_VP(), textos({ envio: mesmo, lojaId: ids.vp, descricao: 'Fino do envio' }), 'Gil', HOJE)).toMatchObject({ ok: true, jaLancada: true });
    // Uma repetida de OUTRA loja (plantada por SQL) impede remover a origem, sem dizer nada sobre ela.
    const origem = await lancado(GERENTE_VP(), { lojaId: ids.vp, descricao: 'Fino da origem', linha: 'diversas', valor: '10,00', recorrente: true, mes: '2026-10' });
    const linhaId = (await planoDoParceiro(a)).find((l) => l.codigo === 'diversas')!.id!;
    await cru(db, perfil, A.id, `INSERT INTO "Despesa"("id","parceiroId","lojaId","linhaId","descricao","competencia","competenciaFim","valorCentavos","recorrente","repeteDeId","atualizadoEm") VALUES ('filhafora1','${A.id}','${ids.dlv}','${linhaId}','Fino da filha','2026-11-01','2026-11-30',1000,true,'${origem}',now())`);
    const v = (await obterDespesa(a, GERENTE_VP(), origem, HOJE))!.despesa.versao;
    const rm = await removerDespesa(a, GERENTE_VP(), origem, { motivo: 'Teste da filha fora', versao: v }, 'Gil');
    expect(rm).toMatchObject({ ok: false, erros: { geral: 'Não foi possível remover esta despesa agora.' } });
    expect(JSON.stringify(rm)).not.toContain('filhafora1');
    await cru(db, perfil, A.id, `DELETE FROM "Despesa" WHERE "id" = 'filhafora1'`);
    await a.despesa.deleteMany({ where: { descricao: { startsWith: 'Fino' } } });
  });
});
