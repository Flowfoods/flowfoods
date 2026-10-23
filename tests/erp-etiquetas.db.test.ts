/**
 * ERP 3.4 · etiquetas no Postgres de verdade:
 * - a etiqueta do LOTE PRODUZIDO copia o retrato da conclusão (validade, conservação, manipulação, quem pegou), com o código do dia;
 *   a mesma chave = a mesma emissão; lote não concluído, perdido ou estornado não emite; lote sem validade sai "não informada";
 * - REIMPRIMIR não recalcula: a ficha e o insumo mudam e o papel continua o mesmo; nova emissão do lote ainda é o retrato do lote;
 * - os pedidos de impressão: primeira e reimpressões (sequência), Zebra preparada → enviada/falhou uma vez só, arquivo e papel =
 *   "arquivo gerado"; chave repetida = o mesmo pedido; cópias e transporte validados;
 * - o ITEM COMPRADO: o lote do fornecedor registrado na nota (código/vencimento, nunca inventados; a nota não muda), a sugestão do
 *   rastro do XML, tirar o lote sem abertura; ABRIR = validade efetiva mín(vencimento, abertura + prazo), sem prazo sem data, lote
 *   vencido não abre, sem mexer no estoque nem na nota;
 * - permissões e alcance (operador imprime e abre; gerente de outra loja não vê; quem não compra não registra lote; o nível 1 não abre),
 *   isolamento entre parceiros (portão e RLS), período fechado não trava, o histórico (pedidos ≠ etiquetas) e as barreiras do banco.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_34t npx vitest run tests/erp-etiquetas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarFornecedor, cancelarNota, lancarNota } from '@/lib/erp/compras';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { atenderRequisicao, obterRequisicao } from '@/lib/erp/requisicao';
import { concluirProducao, estornarProducao, listaDaProducao, obterOrdem, pegarProducao, planejarProducao } from '@/lib/erp/producao';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import {
  abrirEmbalagem,
  aberturaParaEtiqueta,
  confirmarImpressao,
  papelDoPedido,
  emitirEtiquetaDaAbertura,
  emitirEtiquetaDoLote,
  historicoDeImpressoes,
  loteParaEtiqueta,
  lojasDasEtiquetas,
  lotesDaNota,
  obterEmissao,
  opcoesDeAbertura,
  painelDeEtiquetas,
  pedirImpressao,
  registrarLoteDaNota,
  resultadoDaImpressao,
  tirarLoteDaNota,
  type Autor,
} from '@/lib/erp/etiquetas';
import { codigoDaEtiqueta, diaNoRio, fimDoVencimento } from '@/lib/erp/etiqueta-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { cadastrarInsumoDeTeste as cadastrarInsumo, criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';
import { BASE } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA_MS = 86_400_000;
const DIA = 1440;
const CAIO = { nome: 'Caio Cozinha', userId: 'u-caio' };
const DUDA = { nome: 'Duda Lima', userId: 'u-duda' };
const GIL = { nome: 'Gil Gerente', userId: 'u-gil' };

/** Os textos do ZPL, decodificados do ^FH. */
const textos = (zpl: string) => [...zpl.matchAll(/\^FD(.*?)\^FS/g)].map((m) => m[1].replace(/_([0-9A-F]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))));
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const br = (dia: string) => dia.split('-').reverse().join('/');

describe.skipIf(!URL_TESTE)('ERP 3.4 · etiquetas, lote do fornecedor e abertura (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `e${globalThis.crypto.randomUUID().slice(0, 8)}`;
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
  const SEM_ETIQUETA = () => alcanceDe(null, [ids.vp], ['producao.ver', 'producao.registrar']);

  let envio = 0;
  const chave = () => `et-${sufixo}-${++envio}`.padEnd(12, 'x');

  /** Um lote do molho: planeja `qtd` kg, Caio pega, o estoque entrega, Caio conclui com `saiu` kg (refrigerado). */
  const loteConcluido = async (ficha: string, qtd: string, saiu: string, conservacao = '') => {
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ficha, qtd);
    if (!lista.ok) throw new Error(JSON.stringify(lista));
    const p = await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ficha, quantidade: qtd, paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: chave() }, CAIO);
    if (!p.ok) throw new Error(JSON.stringify(p));
    const l0 = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
    expect((await pegarProducao(a, OPERADOR(), ids.vp, p.id, { versao: l0.ordem.versao }, CAIO)).ok).toBe(true);
    const r = (await obterRequisicao(a, DONA(), ids.vp, l0.requisicao!.id))!;
    const at = await atenderRequisicao(
      a,
      GERENTE(),
      ids.vp,
      r.requisicao.id,
      { versao: r.requisicao.versao, linhas: r.itens.map((i) => ({ itemId: i.id, quantidade: String(i.faltaMilesimos / 1000).replace('.', ','), escala: 'base' })), encerrar: false, confirmarNegativo: true },
      'Edu Estoque',
    );
    expect(at.ok).toBe(true);
    const l = (await obterOrdem(a, DONA(), ids.vp, p.id))!;
    const c = await concluirProducao(a, OPERADOR(), ids.vp, p.id, { versao: l.ordem.versao, produzido: saiu, escala: 'base', motivo: saiu === '0' ? 'caiu no chão' : 'ajuste de teste', conservacao }, CAIO);
    if (!c.ok) throw new Error(JSON.stringify(c));
    return p.id;
  };

  const emitir = (ordemId: string, extra: Partial<{ formato: string; quantas: string; quanto: string; escala: string; hora: string; envio: string }> = {}, alcance = OPERADOR(), autor = DUDA) =>
    emitirEtiquetaDoLote(a, alcance, ids.vp, ordemId, { formato: 'E60X40', quantas: '1', quanto: '', escala: 'base', hora: 'on', envio: chave(), ...extra }, autor, new Set(['u-caio', 'u-duda']));

  const abrir = (insumo: string, extra: Partial<Record<string, string>> = {}, alcance = OPERADOR(), autor: Autor = DUDA, agora?: Date) =>
    abrirEmbalagem(a, alcance, ids.vp, { insumo, lote: 'sem', codigo: '', vencimento: '', fabricacao: '', marca: '', conservacao: 'REFRIGERADO', quanto: '', escala: 'base', envio: chave(), ...extra }, autor, agora);

  const pedir = (etiquetaId: string, extra: Partial<Record<string, string>> = {}, alcance = OPERADOR()) =>
    pedirImpressao(a, alcance, ids.vp, etiquetaId, { copias: '1', transporte: 'BROWSER_PRINT', resolucao: '203', envio: chave(), ...extra }, DUDA);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Etiquetas A', slug: `etiquetas-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Etiquetas B', slug: `etiquetas-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: 'MENSAL', diaInicio: 1, criadoPorNome: 'teste' } });
    for (const [k, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[k] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    const prazo = (dias: string) => ({ aceita_REFRIGERADO: 'on', validade_REFRIGERADO: dias, validadeEm_REFRIGERADO: 'dias' });
    for (const [k, campos] of Object.entries({
      cheddar: { nome: 'Queijo cheddar', unidade: 'KG', conteudo: '1', preco: '40,00', conservacao: 'REFRIGERADO', ...prazo('5') },
      leite: { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '5,00', conservacao: 'REFRIGERADO', ...prazo('3') },
      creme: { nome: 'Creme de leite', unidade: 'KG', conteudo: '1', preco: '12,00', conservacao: 'REFRIGERADO', ...prazo('3') },
      cebola: { nome: 'Cebola', unidade: 'KG', conteudo: '1', preco: '6,00', conservacao: 'SECO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${k}: ${JSON.stringify(r)}`);
      ids[k] = r.id;
    }
    const antes = new Date(Date.now() - 10 * DIA_MS);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: '50', escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
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
        ],
        validade: { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } } },
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.molho = f.id;
    ids.insumoMolho = (await a.insumo.findFirst({ where: { nome: 'Molho cheddar' } }))!.id;
    const sem = await cadastrarFicha(a, { nome: 'Base de cebola', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cebola, quantidade: '1', unidade: 'kg' }] }, { tipo: 'manter' }, 'Marina');
    if (!sem.ok) throw new Error(JSON.stringify(sem));
    ids.base = sem.id;
    const forn = await cadastrarFornecedor(a, { nome: 'Laticínios Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!forn.ok) throw new Error(JSON.stringify(forn));
    ids.fornecedor = forn.id;
    const nota = await lancarNota(
      a,
      DONA(),
      {
        lojaId: ids.vp,
        fornecedorId: ids.fornecedor,
        numero: '4521',
        serie: '',
        data: hoje,
        frete: '',
        total: '48,00',
        itens: [
          { insumoId: ids.creme, embalagem: 'padrao', quantidade: '2', valor: '24,00' },
          { insumoId: ids.leite, embalagem: 'padrao', quantidade: '4', valor: '20,00' },
          { insumoId: ids.cebola, embalagem: 'padrao', quantidade: '1', valor: '4,00' },
        ],
      },
      'Marina',
    );
    if (!nota.ok) throw new Error(JSON.stringify(nota));
    ids.nota = nota.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  // ================================================================ o lote produzido

  let L1: string;
  let E1: string;

  it('a etiqueta do lote copia o retrato da conclusão: validade, conservação, manipulação, quem pegou; código do dia; nada de R$', async () => {
    L1 = await loteConcluido(ids.molho, '5', '4,6');
    const ordem = (await a.ordemProducao.findUnique({ where: { id: L1 } }))!;
    expect(ordem.validadeEm!.getTime() - ordem.concluidaEm!.getTime()).toBe(3 * DIA_MS);
    const tela = (await loteParaEtiqueta(a, OPERADOR(), ids.vp, L1, new Set(['u-caio'])))!;
    expect(tela.motivo).toBeNull();
    expect(tela.lote).toMatchObject({ codigo: ordem.codigoLote, nome: 'Molho cheddar', produzidoMilesimos: 4600, conservacao: 'REFRIGERADO', quemFez: 'Caio Cozinha' });
    expect(JSON.stringify(tela)).not.toMatch(/R\$|custo/i);
    const r = await emitir(L1, { quantas: '9', quanto: '500', escala: 'menor' });
    expect(r).toMatchObject({ ok: true });
    E1 = (r as { id: string }).id;
    const e = (await a.etiqueta.findUnique({ where: { id: E1 } }))!;
    expect(e).toMatchObject({
      codigo: codigoDaEtiqueta(diaNoRio(new Date()), 1),
      ordemProducaoId: L1,
      insumoId: ids.insumoMolho,
      nomeSnapshot: 'Molho cheddar',
      quantidadeMilesimos: 500,
      quantas: 9,
      conservacao: 'REFRIGERADO',
      regraDaValidade: 'LOTE_PRODUZIDO',
      loteProduzido: ordem.codigoLote,
      responsavelNomeSnapshot: 'Caio Cozinha',
      emitidaPorNome: 'Duda Lima',
      lojaNomeSnapshot: 'Vila da Penha',
      formato: 'E60X40',
    });
    expect(e.validadeEm).toEqual(ordem.validadeEm);
    expect(e.fabricadoEm).toEqual(ordem.concluidaEm);
    const h = await listarHistorico(a, { de: [{ entidade: 'Etiqueta', ids: [E1] }], limite: 5, verPrecos: false });
    expect(h[0]).toMatchObject({ acao: 'EMITIU', autorNome: 'Duda Lima' });
    // 9 × 500 g = 4,5 kg ≤ 4,6 kg; 10 × 500 g passa.
    expect(await emitir(L1, { quantas: '10', quanto: '500', escala: 'menor' })).toMatchObject({ ok: false, erros: { quanto: expect.stringMatching(/passa do que saiu do lote/) } });
  });

  it('a mesma chave = a mesma emissão (duplo clique); 5 emissões juntas = 5 códigos sem repetir', async () => {
    const k = chave();
    const [x, y, z] = await Promise.all([emitir(L1, { envio: k }), emitir(L1, { envio: k }), emitir(L1, { envio: k })]);
    expect([x, y, z].every((r) => r.ok)).toBe(true);
    const unicos = new Set([x, y, z].map((r) => (r as { id: string }).id));
    expect(unicos.size).toBe(1);
    expect(await a.etiqueta.count({ where: { chaveEnvio: k } })).toBe(1);
    const juntas = await Promise.all(Array.from({ length: 5 }, () => emitir(L1)));
    expect(juntas.every((r) => r.ok)).toBe(true);
    const codigos = (await a.etiqueta.findMany({ where: { ordemProducaoId: L1 }, select: { codigo: true } })).map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.length).toBe(7);
  });

  it('lote não concluído, perdido ou estornado não emite; lote sem validade sai com "não informada" (nunca uma data)', async () => {
    const lista = await listaDaProducao(a, OPERADOR(), ids.vp, ids.molho, '2');
    if (!lista.ok) throw new Error('lista');
    const p = await planejarProducao(a, OPERADOR(), ids.vp, { fichaId: ids.molho, quantidade: '2', paraDia: 'hoje', observacao: '', linhas: lista.linhas, envio: chave() }, CAIO);
    if (!p.ok) throw new Error('planejar');
    expect(await emitir(p.id)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/ainda não foi concluído/) } });
    const perdido = await loteConcluido(ids.molho, '2', '0');
    expect(await emitir(perdido)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/se perdeu/) } });
    const estornar = await loteConcluido(ids.molho, '2', '2');
    // Emitida antes do estorno: depois dele, a etiqueta não se imprime mais (o retrato fica).
    const antesDoEstorno = await emitir(estornar);
    expect(antesDoEstorno.ok).toBe(true);
    const l = (await obterOrdem(a, DONA(), ids.vp, estornar))!;
    expect((await estornarProducao(a, GERENTE(), ids.vp, estornar, { versao: l.ordem.versao, motivo: 'erro de teste', confirmarNegativo: true }, GIL)).ok).toBe(true);
    expect(await emitir(estornar)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/estornado/) } });
    expect(await pedir((antesDoEstorno as { id: string }).id)).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/estornado/) } });
    expect((await obterEmissao(a, OPERADOR(), ids.vp, (antesDoEstorno as { id: string }).id))!.origem).toMatchObject({ tipo: 'LOTE', estornado: true });
    // A base de cebola não tem validade na ficha: o lote conclui sem ela, e a etiqueta diz "não informada".
    const semValidade = await loteConcluido(ids.base, '1', '1');
    const r = await emitir(semValidade);
    expect(r.ok).toBe(true);
    const e = (await a.etiqueta.findUnique({ where: { id: (r as { id: string }).id } }))!;
    expect(e).toMatchObject({ regraDaValidade: 'LOTE_SEM_VALIDADE', validadeEm: null, conservacao: null });
    const ped = await pedir(e.id);
    if (!ped.ok) throw new Error(JSON.stringify(ped));
    expect(textos(ped.zpl)).toEqual(expect.arrayContaining(['VALIDADE NÃO INFORMADA', 'CONSERVAÇÃO NÃO INFORMADA']));
    expect(ped.zpl).not.toMatch(/VALIDADE \d/);
  });

  // ================================================================ reimprimir: o mesmo retrato

  it('REIMPRIMIR não recalcula: a ficha muda a validade para 10 dias e o papel do lote continua o da conclusão', async () => {
    const primeira = await pedir(E1, { copias: '9' });
    if (!primeira.ok) throw new Error(JSON.stringify(primeira));
    expect(primeira.sequencia).toBe(1);
    expect(primeira.situacao).toBe('PREPARADA');
    const validade = (await a.ordemProducao.findUnique({ where: { id: L1 }, select: { validadeEm: true } }))!.validadeEm!;
    expect(textos(primeira.zpl)).toContain(`VALIDADE ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(validade).replace(',', '')}`);
    expect(primeira.zpl).toContain('^PQ9,0,1,Y');
    // A ficha passa a dizer 10 dias (o banco, direto): o lote não muda; reimprimir dá o mesmo papel.
    await a.fichaTecnica.update({ where: { id: ids.molho }, data: { validadeRefrigeradoMin: 10 * DIA } });
    const segunda = await pedir(E1, { copias: '1' });
    if (!segunda.ok) throw new Error(JSON.stringify(segunda));
    expect(segunda.sequencia).toBe(2);
    expect(segunda.zpl.replace('^PQ1,', '^PQ9,')).toBe(primeira.zpl);
    // Uma emissão NOVA do mesmo lote também é o retrato do lote (a validade da conclusão), não a ficha de hoje.
    const nova = await emitir(L1);
    const n = (await a.etiqueta.findUnique({ where: { id: (nova as { id: string }).id } }))!;
    expect(n.validadeEm).toEqual(validade);
    await a.fichaTecnica.update({ where: { id: ids.molho }, data: { validadeRefrigeradoMin: 3 * DIA } });
  });

  it('os pedidos: Zebra preparada → enviada (uma vez só), falhou depois de enviada é conflito, arquivo e papel são "arquivo gerado"; a chave repetida = o mesmo pedido', async () => {
    const k = chave();
    const p1 = await pedir(E1, { envio: k });
    const p1b = await pedir(E1, { envio: k });
    if (!p1.ok || !p1b.ok) throw new Error('pedido');
    expect(p1b).toMatchObject({ id: p1.id, sequencia: p1.sequencia, jaFeito: true });
    expect(p1b.zpl).toBe(p1.zpl);
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, p1.id, { resultado: 'ENVIADA', erro: '' })).toMatchObject({ ok: true });
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, p1.id, { resultado: 'ENVIADA', erro: '' })).toMatchObject({ ok: true, jaFeito: true });
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, p1.id, { resultado: 'FALHOU', erro: 'x' })).toMatchObject({ ok: false, conflito: true });
    const falha = await pedir(E1);
    if (!falha.ok) throw new Error('pedido');
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, falha.id, { resultado: 'FALHOU', erro: '' })).toMatchObject({ ok: true });
    expect((await a.etiquetaImpressao.findUnique({ where: { id: falha.id } }))!).toMatchObject({ situacao: 'FALHOU', erro: 'Sem resposta da impressora.' });
    const arq = await pedir(E1, { transporte: 'ARQUIVO_ZPL', copias: '2' });
    const papel = await pedir(E1, { transporte: 'PAPEL' });
    expect(arq).toMatchObject({ ok: true, situacao: 'EXPORTADA', nomeArquivo: expect.stringMatching(/^etiqueta-E\d{6}-\d{4}\.zpl$/) });
    expect(papel).toMatchObject({ ok: true, situacao: 'EXPORTADA' });
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, (arq as { id: string }).id, { resultado: 'ENVIADA', erro: '' })).toMatchObject({ ok: false });
    expect(await pedir(E1, { copias: '0' })).toMatchObject({ ok: false, erros: { copias: expect.any(String) } });
    expect(await pedir(E1, { copias: '51' })).toMatchObject({ ok: false, erros: { copias: expect.any(String) } });
    expect(await pedir(E1, { transporte: 'FAX' })).toMatchObject({ ok: false });
    expect(await pedir(E1, { envio: 'curto' })).toMatchObject({ ok: false });
    // 300 dpi: o mesmo desenho em 12 pontos por mm.
    const alta = await pedir(E1, { resolucao: '300' });
    if (!alta.ok) throw new Error('300');
    expect(alta.zpl).toContain('^PW720\n^LL480');
    // Sequências sem buraco nem repetição, mesmo em paralelo.
    const juntos = await Promise.all(Array.from({ length: 5 }, () => pedir(E1)));
    expect(juntos.every((x) => x.ok)).toBe(true);
    const seqs = (await a.etiquetaImpressao.findMany({ where: { etiquetaId: E1 }, select: { sequencia: true }, orderBy: { sequencia: 'asc' } })).map((x) => x.sequencia);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_x, i) => i + 1));
    const tela = (await obterEmissao(a, OPERADOR(), ids.vp, E1))!;
    expect(tela.pedidos[0].sequencia).toBe(seqs.length);
    expect(tela.layout.erro).toBeNull();
  });

  // ================================================================ o item comprado

  let LOTE_LONGE: string;
  let LOTE_PERTO: string;

  it('no recebimento: o lote do fornecedor por insumo da nota (código e vencimento, nunca inventados); a nota não muda; repetido = já registrado', async () => {
    const antes = (await a.notaEntrada.findUnique({ where: { id: ids.nota }, select: { atualizadoEm: true, totalCentavos: true } }))!;
    const vence = somarDias(hoje, 30);
    const r = await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.creme, codigo: 'L2309', vencimento: br(vence), fabricacao: '', marca: 'Itambé', envio: chave() }, GIL);
    expect(r).toMatchObject({ ok: true });
    LOTE_LONGE = (r as { id: string }).id;
    const perto = somarDias(hoje, 1);
    const r2 = await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.leite, codigo: 'LT77', vencimento: br(perto), fabricacao: '', marca: '', envio: chave() }, GIL);
    LOTE_PERTO = (r2 as { id: string }).id;
    expect(await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.creme, codigo: 'L2309', vencimento: br(vence), fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: true, id: LOTE_LONGE, jaFeito: true });
    expect(await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.creme, codigo: '', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: false, erros: { codigo: expect.any(String) } });
    expect(await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.cheddar, codigo: 'X', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: false, erros: { insumo: 'Este insumo não está nesta nota.' } });
    // O operador não lança compras; o gerente da Delivery não acha a nota da Penha.
    expect(await registrarLoteDaNota(a, OPERADOR(), ids.nota, { insumo: ids.creme, codigo: 'Y', vencimento: '', fabricacao: '', marca: '', envio: chave() }, DUDA)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await registrarLoteDaNota(a, GERENTE_DELIVERY(), ids.nota, { insumo: ids.creme, codigo: 'Y', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await lotesDaNota(a, GERENTE_DELIVERY(), ids.nota)).toBeNull();
    expect(await lotesDaNota(a, OPERADOR(), ids.nota)).toBeNull();
    const depois = (await a.notaEntrada.findUnique({ where: { id: ids.nota }, select: { atualizadoEm: true, totalCentavos: true } }))!;
    expect(depois).toEqual(antes);
    const tela = (await lotesDaNota(a, GERENTE(), ids.nota))!;
    expect(tela.insumos.find((i) => i.id === ids.creme)!.lotes).toMatchObject([{ codigo: 'L2309', vencimento: vence, marca: 'Itambé', doXml: false }]);
    // O insumo não guarda data de lote (decisão do Rodolfo, 21/10).
    const cad = await a.insumo.findUnique({ where: { id: ids.creme } });
    expect(JSON.stringify(cad)).not.toContain(vence);
  });

  it('o rastro do XML da nota fiscal vira SUGESTÃO por insumo; aceitar marca "do XML" só se bate com o arquivo', async () => {
    const xml = BASE.replace('<xProd>QUEIJO MUSSARELA PECA 2KG</xProd>', '<xProd>QUEIJO MUSSARELA PECA 2KG</xProd><rastro><nLote>LX-88</nLote><qLote>2.000</qLote><dFab>2026-10-01</dFab><dVal>2026-12-01</dVal></rastro>');
    const doc = await a.documentoFiscal.create({
      data: {
        parceiroId: A.id,
        chaveAcesso: '33261011222333000181550010000045211123456784',
        serie: '1',
        numero: '4521',
        emitidaEm: new Date(`${hoje}T00:00:00Z`),
        emitenteDocumento: '11222333000181',
        emitenteRazao: 'Laticínios Rio',
        destinatarioDocumento: '11444777000161',
        lojaId: ids.vp,
        fornecedorId: ids.fornecedor,
        vProdCentavos: 4800,
        vDescCentavos: 0,
        vFreteCentavos: 0,
        vSegCentavos: 0,
        vOutroCentavos: 0,
        vIpiCentavos: 0,
        vStCentavos: 0,
        vNfCentavos: 4800,
        xmlSha256: 'a'.repeat(64),
        xml,
      },
    });
    // O item ligado ao creme de leite (a memória da F.1b) e o documento conciliado com a nota (a ordem que os gatilhos da F.1b pedem).
    await a.documentoFiscalItem.create({
      data: { parceiroId: A.id, documentoId: doc.id, nItem: 1, codigoProduto: 'CR-1', descricao: 'CREME DE LEITE', unidadeComercial: 'KG', qComTexto: '2.0000', qComMilesimos: 2000, vProdCentavos: 2400, vDescCentavos: 0, vOutroCentavos: 0, vSegCentavos: 0, vIpiCentavos: 0, vStCentavos: 0, vFreteCentavos: 0, liquidoCentavos: 2400, insumoId: ids.creme, varianteId: null, aGranel: true, fatorMilesimos: 1000 },
    });
    await a.documentoFiscal.update({ where: { id: doc.id }, data: { situacao: 'CONCILIADO', notaEntradaId: ids.nota } });
    const tela = (await lotesDaNota(a, GERENTE(), ids.nota))!;
    expect(tela.doXml).toBe(true);
    expect(tela.insumos.find((i) => i.id === ids.creme)!.sugestoes).toEqual([{ codigo: 'LX-88', vencimento: '2026-12-01', fabricacao: '2026-10-01', quantidade: '2 KG', item: 'CREME DE LEITE' }]);
    // Nada foi registrado sozinho.
    expect(await a.loteDeInsumo.count({ where: { notaId: ids.nota, codigo: 'LX-88' } })).toBe(0);
    const ok = await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.creme, codigo: 'LX-88', vencimento: '01/12/2026', fabricacao: '01/10/2026', marca: '', envio: chave(), xml: 'sim' }, GIL);
    expect((await a.loteDeInsumo.findUnique({ where: { id: (ok as { id: string }).id } }))!.sugeridoPeloXml).toBe(true);
    const torto = await registrarLoteDaNota(a, GERENTE(), ids.nota, { insumo: ids.creme, codigo: 'LX-99', vencimento: '01/12/2026', fabricacao: '', marca: '', envio: chave(), xml: 'sim' }, GIL);
    expect((await a.loteDeInsumo.findUnique({ where: { id: (torto as { id: string }).id } }))!.sugeridoPeloXml).toBe(false);
    expect((await lotesDaNota(a, GERENTE(), ids.nota))!.insumos.find((i) => i.id === ids.creme)!.sugestoes).toEqual([]);
    // Tirar o registrado por engano (ninguém abriu): sai; com abertura, fica.
    expect(await tirarLoteDaNota(a, GERENTE(), ids.nota, (torto as { id: string }).id, GIL)).toMatchObject({ ok: true });
    expect(await a.loteDeInsumo.count({ where: { id: (torto as { id: string }).id } })).toBe(0);
  });

  let AB1: string;

  it('ABRIR: o prazo chega antes do vencimento → abertura + prazo; o vencimento chega antes → o vencimento (não prolonga); a hora é do servidor; nada no estoque nem na nota', async () => {
    const movs = await a.movimentoEstoque.count();
    const saldos = JSON.stringify(await a.saldoEstoque.findMany({ orderBy: { id: 'asc' } }));
    const nota = JSON.stringify(await a.notaEntrada.findUnique({ where: { id: ids.nota }, include: { itens: true } }));
    const agora = new Date();
    const r = await abrir(ids.creme, { lote: LOTE_LONGE, quanto: '1' }, OPERADOR(), DUDA, agora);
    expect(r).toMatchObject({ ok: true });
    AB1 = (r as { id: string }).id;
    const ab = (await a.aberturaDeLote.findUnique({ where: { id: AB1 } }))!;
    expect(ab).toMatchObject({ regraDaValidade: 'PRAZO_APOS_ABERTURA', prazoAposAberturaMin: 3 * DIA, codigoLoteSnapshot: 'L2309', marcaSnapshot: 'Itambé', abertoPorNome: 'Duda Lima', quantidadeMilesimos: 1000 });
    expect(ab.abertoEm).toEqual(agora);
    expect(ab.validadeEm!.getTime()).toBe(agora.getTime() + 3 * DIA_MS);
    // Leite: o lote vence amanhã e o prazo é 3 dias → vale o fim do dia de amanhã.
    const r2 = await abrir(ids.leite, { lote: LOTE_PERTO });
    const ab2 = (await a.aberturaDeLote.findUnique({ where: { id: (r2 as { id: string }).id } }))!;
    expect(ab2.regraDaValidade).toBe('VENCIMENTO_DO_LOTE');
    expect(ab2.validadeEm).toEqual(fimDoVencimento(somarDias(hoje, 1)));
    expect(await a.movimentoEstoque.count()).toBe(movs);
    expect(JSON.stringify(await a.saldoEstoque.findMany({ orderBy: { id: 'asc' } }))).toBe(saldos);
    expect(JSON.stringify(await a.notaEntrada.findUnique({ where: { id: ids.nota }, include: { itens: true } }))).toBe(nota);
    const h = await listarHistorico(a, { de: [{ entidade: 'AberturaDeLote', ids: [AB1] }], limite: 5, verPrecos: false });
    expect(h[0]).toMatchObject({ acao: 'ABRIU', autorNome: 'Duda Lima' });
  });

  it('sem prazo após abertura: abre SEM data (nunca inventada); lote vencido não abre; lote lido na embalagem; sem lote; pré-preparo e nível 1 não abrem; a chave repetida = a mesma abertura', async () => {
    const semPrazo = await abrir(ids.cebola, { conservacao: 'SECO' });
    const c = (await a.aberturaDeLote.findUnique({ where: { id: (semPrazo as { id: string }).id } }))!;
    expect(c).toMatchObject({ regraDaValidade: 'PRAZO_NAO_INFORMADO', validadeEm: null, prazoAposAberturaMin: null, loteId: null });
    // Lote vencido ontem: recusa, nada gravado.
    const contar = await a.aberturaDeLote.count();
    const vencido = await abrir(ids.creme, { lote: 'novo', codigo: 'VELHO', vencimento: br(somarDias(hoje, -1)) });
    expect(vencido).toMatchObject({ ok: false, erros: { lote: expect.stringMatching(/venceu em .* não abra/) } });
    expect(await a.aberturaDeLote.count()).toBe(contar);
    expect(await a.loteDeInsumo.count({ where: { codigo: 'VELHO' } })).toBe(0);
    // Lido na embalagem agora: o lote nasce com a origem "abertura" (sem nota).
    const lido = await abrir(ids.creme, { lote: 'novo', codigo: 'EMB-1', vencimento: br(somarDias(hoje, 60)) });
    const lab = (await a.aberturaDeLote.findUnique({ where: { id: (lido as { id: string }).id }, include: { lote: true } }))!;
    expect(lab.lote).toMatchObject({ origem: 'ABERTURA', notaId: null, codigo: 'EMB-1' });
    expect(await abrir(ids.creme, { lote: 'novo' })).toMatchObject({ ok: false, erros: { codigo: expect.any(String) } });
    expect(await abrir(ids.creme, { lote: '' })).toMatchObject({ ok: false, erros: { lote: expect.any(String) } });
    expect(await abrir(ids.insumoMolho)).toMatchObject({ ok: false, erros: { insumo: expect.stringMatching(/Pré-preparo/) } });
    expect(await abrir(ids.creme, {}, ALCANCE_FLOWFOODS, { nome: 'Rodolfo' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/FlowFoods não abre/) } });
    expect(await abrir(ids.creme, { conservacao: 'GELADEIRA' })).toMatchObject({ ok: false, erros: { conservacao: expect.any(String) } });
    // Lote de outro insumo, e de nota cancelada: recusa.
    expect(await abrir(ids.creme, { lote: LOTE_PERTO })).toMatchObject({ ok: false, erros: { lote: expect.stringMatching(/não é deste insumo/) } });
    const k = chave();
    const [x, y] = await Promise.all([abrir(ids.creme, { envio: k }), abrir(ids.creme, { envio: k })]);
    expect((x as { id: string }).id).toBe((y as { id: string }).id);
    expect(await a.aberturaDeLote.count({ where: { chaveEnvio: k } })).toBe(1);
    // As opções: os lotes do insumo nesta loja, nota e fornecedor só para quem vê compras.
    const op = (await opcoesDeAbertura(a, OPERADOR(), ids.vp, ids.creme))!;
    expect(op.escolhido?.prazos.REFRIGERADO).toBe(3 * DIA);
    expect(op.lotes.map((l) => l.codigo)).toEqual(expect.arrayContaining(['L2309', 'EMB-1']));
    expect(op.lotes.every((l) => l.nota === null)).toBe(true);
    const opG = (await opcoesDeAbertura(a, GERENTE(), ids.vp, ids.creme))!;
    expect(opG.lotes.find((l) => l.codigo === 'L2309')!.nota).toMatchObject({ rotulo: 'Nota 4521', fornecedor: 'Laticínios Rio' });
    expect(op.insumos.some((i) => i.id === ids.insumoMolho)).toBe(false);
  });

  it('a etiqueta do item aberto copia a abertura; o prazo do insumo muda depois e a reimpressão continua igual; tirar o lote aberto é recusado', async () => {
    const r = await emitirEtiquetaDaAbertura(a, OPERADOR(), ids.vp, AB1, { formato: 'E60X60', quantas: '', hora: 'on', envio: chave() }, DUDA);
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const e = (await a.etiqueta.findUnique({ where: { id } }))!;
    const ab = (await a.aberturaDeLote.findUnique({ where: { id: AB1 } }))!;
    expect(e).toMatchObject({ aberturaId: AB1, nomeSnapshot: 'Creme de leite', loteFornecedor: 'L2309', marcaSnapshot: 'Itambé', regraDaValidade: 'PRAZO_APOS_ABERTURA', responsavelNomeSnapshot: 'Duda Lima', quantas: 1, quantidadeMilesimos: 1000 });
    expect(e.validadeEm).toEqual(ab.validadeEm);
    const p1 = await pedir(id);
    if (!p1.ok) throw new Error('pedido');
    expect(textos(p1.zpl)).toEqual(expect.arrayContaining(['Creme de leite', 'LOTE FORN. L2309', 'MARCA Itambé', 'RESP. Duda Lima']));
    expect(textos(p1.zpl).find((t) => t.startsWith('VENC. LOTE'))).toBe(`VENC. LOTE ${br(somarDias(hoje, 30)).replace(/\/20(\d\d)$/, '/$1')}`);
    await a.insumo.update({ where: { id: ids.creme }, data: { validadeRefrigeradoMin: 10 * DIA } });
    const p2 = await pedir(id);
    if (!p2.ok) throw new Error('pedido');
    expect(p2.zpl).toBe(p1.zpl);
    // Uma abertura NOVA usa o prazo novo (10 dias), limitado pelo vencimento do lote (30 dias).
    const nova = await abrir(ids.creme, { lote: LOTE_LONGE });
    expect((await a.aberturaDeLote.findUnique({ where: { id: (nova as { id: string }).id } }))!.prazoAposAberturaMin).toBe(10 * DIA);
    await a.insumo.update({ where: { id: ids.creme }, data: { validadeRefrigeradoMin: 3 * DIA } });
    expect(await tirarLoteDaNota(a, GERENTE(), ids.nota, LOTE_LONGE, GIL)).toMatchObject({ ok: false, conflito: true });
    const tela = (await aberturaParaEtiqueta(a, OPERADOR(), ids.vp, AB1))!;
    expect(tela.emissoes.length).toBe(1);
    expect(tela.abertura.regra).toBe('PRAZO_APOS_ABERTURA');
  });

  it('nota cancelada: os lotes ficam registrados, mas não abrem; e não se registra lote nela', async () => {
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '9001', serie: '', data: hoje, frete: '', total: '12,00', itens: [{ insumoId: ids.creme, embalagem: 'padrao', quantidade: '1', valor: '12,00' }] }, 'Marina');
    if (!n.ok) throw new Error(JSON.stringify(n));
    const l = await registrarLoteDaNota(a, GERENTE(), n.id, { insumo: ids.creme, codigo: 'C1', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL);
    expect((await cancelarNota(a, DONA(), n.id, 'nota errada', 'Marina')).ok).toBe(true);
    expect(await abrir(ids.creme, { lote: (l as { id: string }).id })).toMatchObject({ ok: false, erros: { lote: expect.stringMatching(/cancelada/) } });
    expect(await registrarLoteDaNota(a, GERENTE(), n.id, { insumo: ids.creme, codigo: 'C2', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: false, conflito: true });
  });

  // ================================================================ permissões, alcance, isolamento e período

  it('alcance: o operador imprime e abre na loja dele; o gerente da Delivery e quem não tem "imprimir etiquetas" não entram; outro parceiro não acha nada (portão e RLS)', async () => {
    expect((await lojasDasEtiquetas(a, OPERADOR())).map((l) => l.nome)).toEqual(['Vila da Penha']);
    expect((await lojasDasEtiquetas(a, DONA())).map((l) => l.nome)).toEqual(['Delivery', 'Vila da Penha']);
    expect(await lojasDasEtiquetas(a, SEM_ETIQUETA())).toEqual([]);
    expect(await painelDeEtiquetas(a, GERENTE_DELIVERY(), ids.vp, {})).toBeNull();
    expect(await painelDeEtiquetas(a, SEM_ETIQUETA(), ids.vp, {})).toBeNull();
    expect(await obterEmissao(a, GERENTE_DELIVERY(), ids.vp, E1)).toBeNull();
    expect(await obterEmissao(a, GERENTE_DELIVERY(), ids.delivery, E1)).toBeNull();
    expect(await emitir(L1, {}, GERENTE_DELIVERY())).toMatchObject({ ok: false });
    expect(await emitir(L1, {}, SEM_ETIQUETA())).toMatchObject({ ok: false });
    expect(await pedir(E1, {}, SEM_ETIQUETA())).toMatchObject({ ok: false });
    // Outro parceiro: nem pelo id.
    const donaB = alcanceDe('DONO', 'rede');
    expect(await obterEmissao(b, donaB, ids.lojaB, E1)).toBeNull();
    expect(await obterEmissao(b, donaB, ids.vp, E1)).toBeNull();
    expect(await aberturaParaEtiqueta(b, donaB, ids.lojaB, AB1)).toBeNull();
    expect(await lotesDaNota(b, donaB, ids.nota)).toBeNull();
    expect(await emitirEtiquetaDoLote(b, donaB, ids.lojaB, L1, { formato: 'E60X40', quantas: '1', quanto: '', escala: 'base', hora: 'on', envio: chave() }, { nome: 'Bia', userId: 'u-bia' }, null)).toMatchObject({ ok: false });
    if (perfil.rls) {
      // SQL cru SEM where, no contexto de B: a RLS não deixa ver nada de A.
      const [e] = await b.sql<{ n: string }>`SELECT count(*)::text AS n FROM "Etiqueta"`;
      const [p] = await b.sql<{ n: string }>`SELECT count(*)::text AS n FROM "EtiquetaImpressao"`;
      const [l] = await b.sql<{ n: string }>`SELECT count(*)::text AS n FROM "LoteDeInsumo"`;
      const [x] = await b.sql<{ n: string }>`SELECT count(*)::text AS n FROM "AberturaDeLote"`;
      expect([e.n, p.n, l.n, x.n]).toEqual(['0', '0', '0', '0']);
    }
    // O painel da Penha: o lote, as aberturas e a fila (sem envio nem arquivo).
    const p = (await painelDeEtiquetas(a, OPERADOR(), ids.vp, {}))!;
    expect(p.lotes.find((l) => l.id === L1)).toMatchObject({ nome: 'Molho cheddar', quanto: '4,6 kg' });
    expect(p.aberturas.find((x) => x.id === AB1)).toMatchObject({ nome: 'Creme de leite', lote: 'L2309' });
    expect(p.fila.some((f) => f.id === E1)).toBe(false); // E1 já foi enviada
    const busca = (await painelDeEtiquetas(a, OPERADOR(), ids.vp, { lote: (await a.ordemProducao.findUnique({ where: { id: L1 } }))!.codigoLote }))!;
    expect(busca.lotes.map((l) => l.id)).toEqual([L1]);
  });

  it('rodada 1 · I1: o papel de um pedido feito ANTES do estorno não reabre a etiqueta (diz por quê)', async () => {
    const L = await loteConcluido(ids.molho, '2', '2');
    const e = ((await emitir(L)) as { id: string }).id;
    const papel = await pedir(e, { transporte: 'PAPEL' });
    expect((await papelDoPedido(a, OPERADOR(), ids.vp, e, (papel as { id: string }).id))!.bloqueio).toBeNull();
    const l = (await obterOrdem(a, DONA(), ids.vp, L))!;
    expect((await estornarProducao(a, GERENTE(), ids.vp, L, { versao: l.ordem.versao, motivo: 'erro de teste', confirmarNegativo: true }, GIL)).ok).toBe(true);
    expect((await papelDoPedido(a, OPERADOR(), ids.vp, e, (papel as { id: string }).id))!).toMatchObject({ bloqueio: expect.stringMatching(/estornado/), layout: null, conteudo: null });
    expect(await confirmarImpressao(a, OPERADOR(), ids.vp, e, DUDA)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/estornado/) } });
  });

  it('rodada 1 · M4 e M8: pré-preparo solto numa nota não oferece lote (frase, não erro cru); lote com _ : # registra', async () => {
    const solto = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Molho solto', unidade: 'KG', conteudo: '1', preco: '1,00', conservacao: 'REFRIGERADO' });
    if (!solto.ok) throw new Error(JSON.stringify(solto));
    await a.insumo.update({ where: { id: solto.id }, data: { tipo: 'PRE_PREPARO' } });
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '9101', serie: '', data: hoje, frete: '', total: '13,00', itens: [{ insumoId: solto.id, embalagem: 'padrao', quantidade: '1', valor: '1,00' }, { insumoId: ids.creme, embalagem: 'padrao', quantidade: '1', valor: '12,00' }] }, 'Marina');
    if (!n.ok) throw new Error(JSON.stringify(n));
    const tela = (await lotesDaNota(a, DONA(), n.id))!;
    expect(tela.insumos.find((i) => i.id === solto.id)).toMatchObject({ prePreparo: true });
    expect(tela.insumos.find((i) => i.id === ids.creme)).toMatchObject({ prePreparo: false });
    expect(await registrarLoteDaNota(a, DONA(), n.id, { insumo: solto.id, codigo: 'X1', vencimento: '', fabricacao: '', marca: '', envio: chave() }, GIL)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Pré-preparo não tem lote de fornecedor/) } });
    const r = await registrarLoteDaNota(a, DONA(), n.id, { insumo: ids.creme, codigo: 'L_23:#1', vencimento: br(somarDias(hoje, 30)), fabricacao: '', marca: '', envio: chave() }, GIL);
    expect(r).toMatchObject({ ok: true });
    expect((await a.loteDeInsumo.findUnique({ where: { id: (r as { id: string }).id } }))!.codigo).toBe('L_23:#1');
  });
  it('período fechado não trava imprimir nem abrir (não mexem em dinheiro nem em estoque)', async () => {
    await a.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Fechado de teste', inicio: somarDias(hoje, -2), fim: somarDias(hoje, 2) }));
    expect((await emitir(L1)).ok).toBe(true);
    expect((await abrir(ids.creme)).ok).toBe(true);
    expect((await pedir(E1)).ok).toBe(true);
  });

  it('o histórico: pedidos ≠ etiquetas (soma das cópias); a Zebra aceitou ≠ arquivo gerado; reimpressão marcada; filtro de origem e página', async () => {
    const h = (await historicoDeImpressoes(a, OPERADOR(), ids.vp, { periodo: 'hoje' }))!;
    const todos = await a.etiquetaImpressao.findMany({ where: { lojaId: ids.vp } });
    expect(h.totais.pedidos).toBe(todos.length);
    expect(h.totais.etiquetas).toBe(todos.reduce((s, x) => s + x.copias, 0));
    expect(h.totais.enviadas).toBe(todos.filter((x) => x.situacao === 'ENVIADA').reduce((s, x) => s + x.copias, 0));
    expect(h.totais.arquivos).toBe(todos.filter((x) => x.situacao === 'EXPORTADA').reduce((s, x) => s + x.copias, 0));
    expect(h.totais.falharam).toBe(todos.filter((x) => x.situacao === 'FALHOU').length);
    expect(h.linhas.some((l) => l.reimpressao)).toBe(true);
    expect(h.linhas.every((l) => l.solicitadaPorNome === 'Duda Lima')).toBe(true);
    const soAbertas = (await historicoDeImpressoes(a, OPERADOR(), ids.vp, { periodo: 'hoje', origem: 'aberta' }))!;
    expect(soAbertas.linhas.every((l) => l.etiqueta.origem === 'ABERTA')).toBe(true);
    expect(soAbertas.total).toBeLessThan(h.total);
    expect(h.paginas).toBe(Math.max(1, Math.ceil(h.total / 25)));
    expect((await historicoDeImpressoes(a, OPERADOR(), ids.vp, { periodo: 'hoje', pagina: '999' }))!.pagina).toBe(h.paginas);
    expect(await historicoDeImpressoes(a, GERENTE_DELIVERY(), ids.vp, {})).toBeNull();
  });

  // ================================================================ as barreiras do banco (até SQL cru)

  it('o banco recusa: abertura que prolonga o vencimento, prazo inventado, mudar a abertura; etiqueta que não copia a origem, mudar ou apagar a emissão; o pedido que muda duas vezes; mudar o lote', async () => {
    const ab = (await a.aberturaDeLote.findUnique({ where: { id: AB1 } }))!;
    const cols = `"id","parceiroId","lojaId","insumoId","loteId","insumoNomeSnapshot","unidadeSnapshot","conservacao","abertoEm","prazoAposAberturaMin","vencimentoLoteEm","codigoLoteSnapshot","marcaSnapshot","validadeEm","regraDaValidade","abertoPorNome"`;
    const inserir = (validade: string, prazo: number, venc: string | null, regra: string) =>
      cru(db, perfil, A.id, `INSERT INTO "AberturaDeLote" (${cols}) VALUES ($1,$2,$3,$4,NULL,'X','KG','REFRIGERADO',$5::timestamp,$6,$7::date,NULL,NULL,$8::timestamp,$9::"RegraDaValidade",'Teste')`, `x${sufixo}${prazo}${regra.length}`, A.id, ids.vp, ids.creme, '2026-10-23 17:00:00', prazo, venc, validade, regra);
    // Prazo de 30 dias quando o insumo diz 3: o gatilho recusa (nada inventado).
    await expect(inserir('2026-11-22 17:00:00', 30 * DIA, null, 'PRAZO_APOS_ABERTURA')).rejects.toThrow(/prazo da abertura|AberturaDeLote_confere/);
    // Sem lote informado, mas com vencimento: recusa.
    await expect(inserir('2026-10-25 03:00:00', 3 * DIA, '2026-10-24', 'VENCIMENTO_DO_LOTE')).rejects.toThrow(/sem lote|AberturaDeLote/);
    // Mudar a abertura: o gatilho recusa; com a RLS forçada, o papel do tenant nem tem UPDATE nela (só lê e cria).
    await expect(cru(db, perfil, A.id, `UPDATE "AberturaDeLote" SET "abertoPorNome" = 'Outro' WHERE "id" = $1`, AB1)).rejects.toThrow(/não muda|permission denied for table AberturaDeLote/);
    // Validade que passa do vencimento do lote: o CHECK do mínimo (direto, com o gatilho do prazo satisfeito).
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "AberturaDeLote" (${cols}) VALUES ($1,$2,$3,$4,$5,'X','KG','REFRIGERADO',$6::timestamp,$7,$8::date,$9,$10,$11::timestamp,'PRAZO_APOS_ABERTURA','Teste')`, `y${sufixo}`, A.id, ids.vp, ids.creme, ab.loteId, '2026-10-23 17:00:00', 3 * DIA, isoDia(ab.vencimentoLoteEm!), ab.codigoLoteSnapshot, ab.marcaSnapshot, '2030-01-01 00:00:00'),
    ).rejects.toThrow(/AberturaDeLote_validade_efetiva|check/i);
    // Etiqueta da abertura com outra validade: o gatilho recusa.
    await expect(
      cru(db, perfil, A.id, `INSERT INTO "Etiqueta" ("id","parceiroId","lojaId","codigo","insumoId","aberturaId","nomeSnapshot","conservacao","validadeEm","regraDaValidade","formato","quantas","lojaNomeSnapshot","emitidaPorNome","chaveEnvio","abertoEm") VALUES ($1,$2,$3,'EXX','${ids.creme}',$4,'X','REFRIGERADO','2030-01-01','PRAZO_APOS_ABERTURA','E60X40',1,'VP','Teste',$5,$6::timestamp)`, `z${sufixo}`, A.id, ids.vp, AB1, `chave-${sufixo}-z`, ab.abertoEm.toISOString().replace('T', ' ').replace('Z', '')),
    ).rejects.toThrow(/copia a abertura/);
    await expect(cru(db, perfil, A.id, `UPDATE "Etiqueta" SET "validadeEm" = now() + interval '30 days' WHERE "id" = $1`, E1)).rejects.toThrow(/não muda nem some/);
    await expect(cru(db, perfil, A.id, `DELETE FROM "Etiqueta" WHERE "id" = $1`, E1)).rejects.toThrow(/não muda nem some|permission denied|violates/);
    const enviado = (await a.etiquetaImpressao.findFirst({ where: { etiquetaId: E1, situacao: 'ENVIADA' } }))!;
    await expect(cru(db, perfil, A.id, `UPDATE "EtiquetaImpressao" SET "situacao" = 'FALHOU', "erro" = 'x' WHERE "id" = $1`, enviado.id)).rejects.toThrow(/só muda uma vez/);
    await expect(cru(db, perfil, A.id, `UPDATE "LoteDeInsumo" SET "codigo" = 'OUTRO' WHERE "id" = $1`, LOTE_LONGE)).rejects.toThrow(/não muda/);
  });
  // ================================================================ rodada de correção 1 (Guardião e UX)

  it('rodada 1 · lote vencido: não emite, não reimprime (Zebra, arquivo, papel), sai da fila e o painel diz "venceu"', async () => {
    const depois = new Date(Date.now() + 4 * DIA_MS); // o molho dura 3 dias
    const r = await emitirEtiquetaDoLote(a, OPERADOR(), ids.vp, L1, { formato: 'E60X40', quantas: '1', quanto: '', escala: 'base', hora: 'on', envio: chave() }, DUDA, null, depois);
    expect(r).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/^Este lote venceu em \d\d\/\d\d às \d\d:\d\d: não use\. Separe para descarte e avise a gerência\.$/) } });
    expect((await loteParaEtiqueta(a, OPERADOR(), ids.vp, L1, null, depois))!.motivo).toMatch(/venceu/);
    for (const transporte of ['BROWSER_PRINT', 'ARQUIVO_ZPL', 'PAPEL']) {
      expect(await pedirImpressao(a, OPERADOR(), ids.vp, E1, { copias: '1', transporte, resolucao: '203', envio: chave() }, DUDA, depois)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/venceu/) } });
    }
    const papel = (await a.etiquetaImpressao.findFirst({ where: { etiquetaId: E1, transporte: 'PAPEL' } }))!;
    expect((await papelDoPedido(a, OPERADOR(), ids.vp, E1, papel.id, depois))!).toMatchObject({ bloqueio: expect.stringMatching(/venceu/), layout: null });
    expect((await papelDoPedido(a, OPERADOR(), ids.vp, E1, papel.id))!.bloqueio).toBeNull();
    expect((await obterEmissao(a, OPERADOR(), ids.vp, E1, depois))!.bloqueio).toMatch(/venceu/);
    const p = (await painelDeEtiquetas(a, OPERADOR(), ids.vp, {}, depois))!;
    expect(p.lotes.find((l) => l.id === L1)).toMatchObject({ vencido: true, situacao: { texto: 'Venceu' } });
    expect(p.fila.map((f) => f.id)).not.toContain(E1);
  });

  it('rodada 1 · a fila: arquivo e papel NÃO tiram; a Zebra aceitando ou "Já imprimi" tiram; "Já imprimi" uma vez, com quem e quando; Zebra sem resposta fica "sem resultado"', async () => {
    const r = await emitir(L1);
    const e = (r as { id: string }).id;
    const naFila = async () => (await painelDeEtiquetas(a, OPERADOR(), ids.vp, {}))!.fila.some((f) => f.id === e);
    expect(await naFila()).toBe(true);
    expect(await confirmarImpressao(a, OPERADOR(), ids.vp, e, DUDA)).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/Peça a impressão primeiro/) } });
    expect((await pedir(e, { transporte: 'ARQUIVO_ZPL' })).ok).toBe(true);
    expect((await pedir(e, { transporte: 'PAPEL' })).ok).toBe(true);
    expect(await naFila()).toBe(true);
    const semResposta = await pedir(e); // Zebra que não respondeu: fica PREPARADA
    expect(semResposta.ok).toBe(true);
    expect((await obterEmissao(a, OPERADOR(), ids.vp, e))!).toMatchObject({ naFila: true, aConfirmar: (semResposta as { id: string }).id });
    expect(await confirmarImpressao(a, OPERADOR(), ids.vp, e, DUDA)).toMatchObject({ ok: true });
    expect(await naFila()).toBe(false);
    const conf = (await a.etiquetaImpressao.findFirst({ where: { etiquetaId: e, confirmadaEm: { not: null } } }))!;
    expect(conf).toMatchObject({ id: (semResposta as { id: string }).id, situacao: 'PREPARADA', confirmadaPorNome: 'Duda Lima', confirmadaPorUsuarioId: 'u-duda' });
    expect(await confirmarImpressao(a, OPERADOR(), ids.vp, e, DUDA)).toMatchObject({ ok: true, jaFeito: true });
    // Confirmado, o pedido não recebe mais resultado da Zebra.
    expect(await resultadoDaImpressao(a, OPERADOR(), ids.vp, conf.id, { resultado: 'ENVIADA', erro: '' })).toMatchObject({ ok: false });
    // Outra emissão: a Zebra aceitando tira da fila.
    const e2 = ((await emitir(L1)) as { id: string }).id;
    const z = await pedir(e2);
    expect((await resultadoDaImpressao(a, OPERADOR(), ids.vp, (z as { id: string }).id, { resultado: 'ENVIADA', erro: '' })).ok).toBe(true);
    expect((await painelDeEtiquetas(a, OPERADOR(), ids.vp, {}))!.fila.some((f) => f.id === e2)).toBe(false);
    // O histórico conta as confirmadas e não chama de "sem resultado" o que foi confirmado.
    const h = (await historicoDeImpressoes(a, OPERADOR(), ids.vp, { periodo: 'hoje' }))!;
    expect(h.totais.confirmadas).toBeGreaterThanOrEqual(1);
    expect(h.linhas.find((l) => l.id === conf.id)).toMatchObject({ confirmadaPorNome: 'Duda Lima' });
  });

  it('rodada 1 · Guardião: chave de outra loja, etiqueta forjada (manipulação, quem fez, lote e marca), pedido e abertura que somem, id e conclusão para trás', async () => {
    // M6: a chave usada na Penha, reusada pela Delivery, não devolve o id da Penha.
    const k = chave();
    const r1 = await emitir(L1, { envio: k });
    expect(r1.ok).toBe(true);
    const outra = await emitirEtiquetaDoLote(a, alcanceDe('DONO', 'rede'), ids.delivery, L1, { formato: 'E60X40', quantas: '1', quanto: '', escala: 'base', hora: 'on', envio: k }, DUDA, null);
    expect(outra).toMatchObject({ ok: false });
    expect(JSON.stringify(outra)).not.toContain((r1 as { id: string }).id);
    // M2: a etiqueta do lote com manipulação ou quem fez forjados; a do item aberto com lote ou marca forjados.
    const o = (await a.ordemProducao.findUnique({ where: { id: L1 } }))!;
    const ab = (await a.aberturaDeLote.findUnique({ where: { id: AB1 } }))!;
    const ts = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '');
    const doLote = (fabricado: string, resp: string | null) =>
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "Etiqueta" ("id","parceiroId","lojaId","codigo","insumoId","ordemProducaoId","nomeSnapshot","conservacao","validadeEm","regraDaValidade","formato","quantas","lojaNomeSnapshot","emitidaPorNome","chaveEnvio","fabricadoEm","loteProduzido","responsavelNomeSnapshot") VALUES ($1,$2,$3,$4,$5,$6,'X','REFRIGERADO',$7::timestamp,'LOTE_PRODUZIDO','E60X40',1,'VP','Teste',$8,$9::timestamp,$10,$11)`,
        `f${sufixo}${resp ?? ''}${fabricado.length}`, A.id, ids.vp, `EF-${resp ?? 'n'}-${fabricado.slice(0, 4)}`, ids.insumoMolho, L1, ts(o.validadeEm!), `ch-${sufixo}-${resp ?? 'n'}-${fabricado.length}`, fabricado, o.codigoLote, resp,
      );
    await expect(doLote('2020-01-01 00:00:00', o.responsavelNomeSnapshot)).rejects.toThrow(/copia o lote concluído/);
    await expect(doLote(ts(o.concluidaEm!), 'Fulano Forjado')).rejects.toThrow(/copia o lote concluído/);
    const daAbertura = (lote: string | null, marca: string | null) =>
      cru(
        db,
        perfil,
        A.id,
        `INSERT INTO "Etiqueta" ("id","parceiroId","lojaId","codigo","insumoId","aberturaId","nomeSnapshot","conservacao","validadeEm","regraDaValidade","formato","quantas","lojaNomeSnapshot","emitidaPorNome","chaveEnvio","abertoEm","vencimentoLoteEm","loteFornecedor","marcaSnapshot","responsavelNomeSnapshot","responsavelUsuarioId") VALUES ($1,$2,$3,$4,$5,$6,'X','REFRIGERADO',$7::timestamp,$8::"RegraDaValidade",'E60X40',1,'VP','Teste',$9,$10::timestamp,$11::date,$12,$13,$14,$15)`,
        `g${sufixo}${lote}${marca}`.slice(0, 40), A.id, ids.vp, `EG-${lote}-${marca}`.slice(0, 40), ids.creme, AB1, ts(ab.validadeEm!), ab.regraDaValidade, `cg-${sufixo}-${lote}-${marca}`.slice(0, 60), ts(ab.abertoEm), ab.vencimentoLoteEm ? isoDia(ab.vencimentoLoteEm) : null, lote, marca, ab.abertoPorNome, ab.abertoPorUsuarioId,
      );
    await expect(daAbertura('FORJADO', ab.marcaSnapshot)).rejects.toThrow(/copia a abertura/);
    await expect(daAbertura(ab.codigoLoteSnapshot, 'Marca Forjada')).rejects.toThrow(/copia a abertura/);
    // M5: o pedido e a abertura não somem (com RLS, o papel do tenant nem tem DELETE nelas).
    const algum = (await a.etiquetaImpressao.findFirst({ where: { etiquetaId: E1 } }))!;
    await expect(cru(db, perfil, A.id, `DELETE FROM "EtiquetaImpressao" WHERE "id" = $1`, algum.id)).rejects.toThrow(/não some|permission denied/);
    await expect(cru(db, perfil, A.id, `DELETE FROM "AberturaDeLote" WHERE "id" = $1`, AB1)).rejects.toThrow(/não muda nem some|permission denied/);
    // M7: o pedido preparado não troca de id nem conclui antes de ser pedido.
    const prep = await pedir(E1);
    const pid = (prep as { id: string }).id;
    await expect(cru(db, perfil, A.id, `UPDATE "EtiquetaImpressao" SET "id" = $2 WHERE "id" = $1`, pid, `novo${sufixo}`)).rejects.toThrow(/só muda uma vez/);
    await expect(cru(db, perfil, A.id, `UPDATE "EtiquetaImpressao" SET "situacao" = 'ENVIADA', "concluidaEm" = "solicitadaEm" - interval '1 day' WHERE "id" = $1`, pid)).rejects.toThrow(/EtiquetaImpressao_resultado|check/i);
    // Confirmar e mudar o resultado ao mesmo tempo: recusado.
    await expect(cru(db, perfil, A.id, `UPDATE "EtiquetaImpressao" SET "confirmadaEm" = now(), "confirmadaPorNome" = 'X', "situacao" = 'ENVIADA', "concluidaEm" = now() WHERE "id" = $1`, pid)).rejects.toThrow(/não muda o resultado/);
  });

});
