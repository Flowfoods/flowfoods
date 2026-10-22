/**
 * ERP F.1b · notas fiscais por XML (NF-e manual) no Postgres de verdade, pelos serviços e pelas actions de verdade.
 *
 * Critérios da F.1b (análise F.1, seção 5, números do XML sintético `tests/fixtures/nfe-sintetica.xml`):
 *  11. loja sem CNPJ = "cadastre o CNPJ da loja", nada gravado;     12. documento aguardando, 3 itens pendentes, ZERO nota/estoque/custo;
 *  13. emitente desconhecido = fornecedor provisório "a completar";   14. vínculos (peça 2 kg, pacote 1 kg × 10, fardo 500 un);
 *  15. conciliar: nota IMPORTACAO com chave, líquidos 14500/38000/2500, frete 791/2073/136, estoque +6 kg/+20 kg/+500 un;
 *  16. reimportar o mesmo arquivo = "já recebido";                    17. mesma chave com outro conteúdo = recusa;
 *  18. memória: mesmo código e unidade já vem vinculado, outra unidade não;   19. total que não fecha = não concilia;
 *  20. destinatário que não é de loja nenhuma = recusa;               21. ataques (DOCTYPE, 1,5 MB, NFC-e, sem protocolo, cStat 110);
 *  22. nota lançada à mão antes: "ligar", sem nota nova nem estoque novo;   23. cancelar a nota conciliada devolve o documento;
 *  24. cinco conciliações paralelas = uma nota;                       25. gerente de outra loja não abre; operador não vê;
 *  26. nota do XML não se edita;                                      28. trocar o fator da memória não muda a nota antiga.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-documento-fiscal.db.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja, salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cancelarNota, cadastrarFornecedor, editarNota, lancarNota, mudarSituacaoFornecedor, obterNota, obterFornecedor } from '@/lib/erp/compras';
import { concluirAbertura, conferenciaDaAbertura, iniciarAbertura } from '@/lib/erp/estoque';
import { cancelarDocumento, conciliarDocumento, ligarDocumento, listarDocumentos, obterDocumento, previaDoDocumento, receberXml, salvarConferencia, type EntradaDaConferencia } from '@/lib/erp/documentos-fiscais';
import { digitoDaChave } from '@/lib/erp/nfe-xml';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const BASE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'nfe-sintetica.xml'), 'utf8');
const CHAVE = '33261011222333000181550010000045211123456784';
const bytes = (t: string) => new TextEncoder().encode(t);

/** O XML do roteiro com trocas de texto; `nNF` refaz a chave inteira (e o dígito verificador), como um emitente de verdade faria. */
function xmlDe(trocas: Array<[string | RegExp, string]> = [], nNF?: string, emit = '11222333000181'): string {
  let t = BASE;
  if (nNF || emit !== '11222333000181') {
    nNF ??= '4521';
    const corpo = `33261${emit}`.replace(/^33261/, '332610') + `55001${nNF.padStart(9, '0')}112345678`;
    const nova = `${corpo}${digitoDaChave(corpo)}`;
    t = t.split(CHAVE).join(nova).replace('<nNF>4521</nNF>', `<nNF>${nNF}</nNF>`).replace('<cDV>4</cDV>', `<cDV>${nova[43]}</cDV>`).replace('<nFat>4521</nFat>', `<nFat>${nNF}</nFat>`);
    if (emit !== '11222333000181') t = t.replace('<emit>\n        <CNPJ>11222333000181</CNPJ>', `<emit>\n        <CNPJ>${emit}</CNPJ>`);
  }
  for (const [de, para] of trocas) t = t.replace(de, para);
  return t;
}

describe.skipIf(!URL_TESTE)('ERP F.1b · notas fiscais por XML (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `x${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const dataBr = (iso: string) => iso.split('-').reverse().join('/');

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE_VP = () => alcanceDe('GERENTE', [ids.vp]);
  const GERENTE_CENTRO = () => alcanceDe('GERENTE', [ids.centro]);
  const OPERADOR_VP = () => alcanceDe('OPERADOR', [ids.vp]);

  /** O que a pessoa escolhe na tela para o roteiro: muçarela peça 2 kg (1), bacon pacote 1 kg (10), guardanapo fardo (1). */
  const escolhasDoRoteiro = (): EntradaDaConferencia['itens'] => [
    { nItem: 1, insumoId: ids.mucarela, embalagem: `v:${ids.peca}`, fator: '1' },
    { nItem: 2, insumoId: ids.bacon, embalagem: `v:${ids.pacote}`, fator: '10' },
    { nItem: 3, insumoId: ids.guardanapo, embalagem: `v:${ids.fardo}`, fator: '1' },
  ];
  const conferencia = (d: { versao: string }, extra: Partial<EntradaDaConferencia> = {}): EntradaDaConferencia => ({ versao: d.versao, data: dataBr(hoje), itens: escolhasDoRoteiro(), ...extra });
  const detalhe = async (id: string, alcance = DONA()) => (await obterDocumento(a, alcance, id))!;
  const receber = (xml: string, alcance = DONA(), cliente = a) => receberXml(cliente, alcance, bytes(xml), 'Marina Dona');
  const idDe = (r: { ok: boolean }) => {
    if (!r.ok) throw new Error(JSON.stringify(r));
    return (r as { id: string }).id;
  };
  const contagens = async () => ({
    docs: await a.documentoFiscal.count(),
    notas: await a.notaEntrada.count(),
    movimentos: await a.movimentoEstoque.count(),
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Notas fiscais A', slug: `nf-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Notas fiscais B', slug: `nf-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['centro', 'Centro']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    // Insumos do roteiro, cada um com a embalagem que o fornecedor vende.
    const novo = async (nome: string, unidade: 'KG' | 'UN', variante: { nome: string; conteudo: string }) => {
      const i = await cadastrarInsumo(a, { nome, tipo: 'INGREDIENTE', unidade, escala: 'base', conteudo: '1', preco: '10,00' });
      if (!i.ok) throw new Error(JSON.stringify(i));
      const v = await cadastrarVariante(a, i.id, { nome: variante.nome, escala: 'base', conteudo: variante.conteudo, preco: '50,00' });
      if (!v.ok) throw new Error(JSON.stringify(v));
      return { insumo: i.id, variante: v.id };
    };
    const m = await novo('Muçarela', 'KG', { nome: 'Peça 2 kg', conteudo: '2' });
    const ba = await novo('Bacon', 'KG', { nome: 'Pacote 1 kg', conteudo: '1' });
    const g = await novo('Guardanapo', 'UN', { nome: 'Fardo 500 un', conteudo: '500' });
    Object.assign(ids, { mucarela: m.insumo, peca: m.variante, bacon: ba.insumo, pacote: ba.variante, guardanapo: g.insumo, fardo: g.variante });
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('critério 11: a loja sem CNPJ não recebe a nota; a frase manda cadastrar o CNPJ da loja e nada é gravado', async () => {
    const r = await receber(xmlDe());
    expect(r).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/Cadastre o CNPJ da loja.*Lojas ainda sem CNPJ: Centro, Vila da Penha/) } });
    expect(await contagens()).toEqual({ docs: 0, notas: 0, movimentos: 0 });
    expect(await a.fornecedor.count()).toBe(0);
  });

  it('critério 20: nota para o CNPJ de ninguém é recusada sem gravar; o do Centro é do Centro', async () => {
    expect(await salvarCnpjDaLoja(a, ids.vp, '11.444.777/0001-61', '', 'Marina')).toMatchObject({ ok: true });
    expect(await salvarCnpjDaLoja(a, ids.centro, '12.345.678/0001-95', '', 'Marina')).toMatchObject({ ok: true });
    const r = await receber(xmlDe([['<CNPJ>11444777000161</CNPJ>', '<CNPJ>11444777000242</CNPJ>']]));
    expect(r).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/11\.444\.777\/0002-42.*não é de nenhuma loja sua/) } });
    expect(await contagens()).toEqual({ docs: 0, notas: 0, movimentos: 0 });
    expect(await a.fornecedor.count()).toBe(0);
  });

  it('critérios 12 e 13: receber grava UM documento aguardando conferência, 3 itens pendentes, o fornecedor provisório — e NADA de nota, estoque ou custo', async () => {
    const r = await receber(xmlDe());
    ids.doc = idDe(r);
    expect(r).toMatchObject({ ok: true, mudou: [] });
    expect(await contagens()).toEqual({ docs: 1, notas: 0, movimentos: 0 });
    const d = await detalhe(ids.doc);
    expect(d).toMatchObject({
      rotulo: 'Nota 4521 · série 1',
      situacao: 'AGUARDANDO_CONFERENCIA',
      chaveAcesso: CHAVE,
      emitidaEm: '2026-10-21',
      loja: { id: ids.vp, nome: 'Vila da Penha' },
      vinculados: 0,
      conferencia: { fecha: true, somaItensCentavos: 55000, freteCentavos: 3000, calculadoCentavos: 58000, totalDaNotaCentavos: 58000 },
    });
    expect(d.itens.map((i) => [i.nItem, i.codigoProduto, i.unidadeComercial, i.qComMilesimos, i.liquidoCentavos, i.insumoId])).toEqual([
      [1, 'QJ-MUS-2K', 'PC', 3000, 14500, null],
      [2, 'BAC-CX10', 'CX', 2000, 38000, null],
      [3, 'GUAR-500', 'FD', 1000, 2500, null],
    ]);
    // O emitente desconhecido virou fornecedor "a completar" com o que veio no XML (sem e-mail nem WhatsApp).
    const f = (await a.fornecedor.findFirst({ where: { documento: '11222333000181' } }))!;
    expect(f).toMatchObject({ nome: 'Laticínios Exemplo', razaoSocial: 'LATICINIOS EXEMPLO LTDA', inscricaoEstadual: '12345678', uf: 'RJ', municipio: 'Rio de Janeiro', cep: '21020000', situacaoCadastro: 'A_COMPLETAR', email: null, whatsapp: null, chaveEnvio: null });
    ids.fornecedor = f.id;
    expect(d.fornecedor).toMatchObject({ id: f.id, situacaoCadastro: 'A_COMPLETAR', falta: expect.arrayContaining(['e-mail', 'WhatsApp']) });
    // A casa não leu o XML inteiro na lista: o XML não aparece em lugar nenhum além do próprio registro.
    const lista = await listarDocumentos(a, DONA());
    expect(lista.linhas).toHaveLength(1);
    expect(JSON.stringify(lista)).not.toContain('<nfeProc');
    expect(JSON.stringify(d)).not.toContain('<nfeProc');
    const [h] = await listarHistorico(a, { de: [{ entidade: 'DocumentoFiscal', ids: [ids.doc] }], verPrecos: true });
    expect(h).toMatchObject({ acao: 'CRIOU', autorNome: 'Marina Dona' });
  });

  it('critério 16: o mesmo arquivo de novo (e cinco ao mesmo tempo) é "já recebido": um documento só', async () => {
    const igual = await receber(xmlDe());
    expect(igual).toEqual({ ok: true, id: ids.doc, mudou: [], repetido: true });
    const quatro = await Promise.all([1, 2, 3, 4, 5].map(() => receber(xmlDe())));
    expect(quatro.every((r) => r.ok && (r as { id: string }).id === ids.doc)).toBe(true);
    expect((await contagens()).docs).toBe(1);
    // Outra nota (outra chave) ao mesmo tempo, cinco vezes: um documento novo só.
    const novos = await Promise.all([1, 2, 3, 4, 5].map(() => receber(xmlDe([], '4530'))));
    expect(new Set(novos.map((r) => (r as { id: string }).id)).size).toBe(1);
    expect((await contagens()).docs).toBe(2);
    await cancelarDocumento(a, DONA(), (novos[0] as { id: string }).id, (await detalhe((novos[0] as { id: string }).id)).versao, 'teste: nota de outra rodada', 'Marina');
  });

  it('critério 17: a mesma chave com outro conteúdo é recusada e o documento não muda', async () => {
    const adulterada = xmlDe([[/<vProd>380\.00<\/vProd>\s*<cEANTrib>/, '<vProd>381.00</vProd><cEANTrib>']]);
    const r = await receber(adulterada);
    expect(r).toMatchObject({ ok: false, existenteId: ids.doc, erros: { arquivo: expect.stringMatching(/OUTRO conteúdo/) } });
    const d = await detalhe(ids.doc);
    expect(d.itens[1].liquidoCentavos).toBe(38000);
  });

  it('critério 21: DOCTYPE com entidade, 1,5 MB, NFC-e, sem protocolo e cStat 110 são recusados e NADA é gravado', async () => {
    const antes = await contagens();
    const xxe = xmlDe().replace('<nfeProc', '<!DOCTYPE nfeProc [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<nfeProc').replace('<natOp>Venda de mercadoria', '<natOp>&xxe;');
    expect(await receber(xxe)).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/DOCTYPE, ENTITY/) } });
    expect(await receber(`<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><nfeProc>&b;</nfeProc>`)).toMatchObject({ ok: false });
    const grande = xmlDe().replace('</nfeProc>', `<!-- ${'x'.repeat(1_500_000)} --></nfeProc>`);
    expect(await receber(grande)).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/limite é 1 MB/) } });
    expect(await receber(xmlDe([['<mod>55</mod>', '<mod>65</mod>']], '4540'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/NFC-e/) } });
    expect(await receber(xmlDe([[/<protNFe[\s\S]*<\/protNFe>/, '']], '4541'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/protocolo/) } });
    expect(await receber(xmlDe([['<cStat>100</cStat>', '<cStat>110</cStat>']], '4542'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/código 110/) } });
    expect(await contagens()).toEqual(antes);
    expect(await a.fornecedor.count()).toBe(1);
  });

  it('critério 14: vincular os 3 itens mostra "3 PC → 6 kg", "2 CX → 20 kg", "1 FD → 500 un"; "salvar" grava a memória e o contador', async () => {
    const d = await detalhe(ids.doc);
    const p = await previaDoDocumento(a, DONA(), ids.doc, conferencia(d));
    expect(p).toMatchObject({ ok: true });
    expect((await contagens()).notas).toBe(0);
    const salvo = await salvarConferencia(a, DONA(), ids.doc, conferencia(d), 'Marina Dona');
    expect(salvo).toMatchObject({ ok: true, mudou: ['itens'] });
    const v = await detalhe(ids.doc);
    expect(v.vinculados).toBe(3);
    expect(v.itens.map((i) => i.conta?.curta)).toEqual(['3 PC → 6 kg', '2 CX → 20 kg', '1 FD → 500 un']);
    expect(v.itens.map((i) => i.origem)).toEqual(['memoria', 'memoria', 'memoria']);
    expect(await a.vinculoItemFornecedor.count()).toBe(3);
    expect((await contagens()).notas).toBe(0);
    // A versão andou: a outra aba, que ainda vê a de antes, recebe o conflito.
    expect(await salvarConferencia(a, DONA(), ids.doc, conferencia(d), 'Gil')).toMatchObject({ ok: false, conflito: true });
  });

  it('critério 19: nota que não fecha (vNF 581,00) NÃO concilia e a frase diz a diferença', async () => {
    const r = await receber(xmlDe([['<vNF>580.00</vNF>', '<vNF>581.00</vNF>']], '4550'));
    const id = idDe(r);
    const d = await detalhe(id);
    expect(d.conferencia).toMatchObject({ fecha: false, diferencaCentavos: 100 });
    const c = await conciliarDocumento(a, DONA(), id, conferencia(d), 'Marina Dona');
    expect(c).toMatchObject({ ok: false, erros: { total: expect.stringMatching(/dão R\$\s580,00, mas a nota diz R\$\s581,00 \(diferença de R\$\s1,00\)/) } });
    expect((await detalhe(id)).situacao).toBe('AGUARDANDO_CONFERENCIA');
    expect((await contagens()).notas).toBe(0);
    await cancelarDocumento(a, DONA(), id, d.versao, 'teste: nota que não fecha', 'Marina');
  });

  it('critério 15: conciliar lança UMA nota IMPORTACAO com a chave, líquidos 14500/38000/2500, frete 791/2073/136, custo e estoque', async () => {
    // A loja precisa estar com o estoque aberto para a nota entrar no razão (1.6).
    expect(await iniciarAbertura(a, DONA(), ids.vp, 'Marina')).toMatchObject({ ok: true });
    const conf = (await conferenciaDaAbertura(a, DONA(), ids.vp))!;
    expect(await concluirAbertura(a, DONA(), ids.vp, { versao: conf.contagem!.versao, confirmarNaoContados: true }, 'Marina')).toMatchObject({ ok: true });
    const d = await detalhe(ids.doc);
    const prev = await previaDoDocumento(a, DONA(), ids.doc, conferencia(d));
    expect(prev).toMatchObject({ ok: true, previa: { estoque: { movimenta: true } } });
    const c = await conciliarDocumento(a, DONA(), ids.doc, conferencia(d), 'Marina Dona');
    expect(c).toMatchObject({ ok: true, mudou: ['situacao'] });
    ids.nota = (c as { notaId: string }).notaId;
    const nota = (await a.notaEntrada.findUnique({ where: { id: ids.nota }, include: { itens: { orderBy: { ordem: 'asc' } } } }))!;
    expect(nota).toMatchObject({ origem: 'IMPORTACAO', chaveAcesso: CHAVE, status: 'LANCADA', totalCentavos: 58000, freteCentavos: 3000, numero: '4521', serie: '1', origemRef: ids.doc });
    expect(nota.emitidaEm!.toISOString().slice(0, 10)).toBe('2026-10-21');
    expect(nota.itens.map((i) => [i.valorTotalCentavos, i.freteRateadoCentavos, i.quantidadeMilesimos])).toEqual([
      [14500, 791, 6000],
      [38000, 2073, 20000],
      [2500, 136, 500000],
    ]);
    expect(nota.itens.reduce((s, i) => s + i.freteRateadoCentavos, 0)).toBe(3000);
    // Custo da muçarela: (14500 + 791) ÷ 6 kg = R$ 25,485/kg (a conta exata, sem arredondar o unitário).
    const detalheNota = (await obterNota(a, DONA(), ids.nota))!;
    expect(detalheNota.itens[0]).toMatchObject({ nome: 'Muçarela', valorCentavos: 14500, freteRateadoCentavos: 791, quantidadeMilesimos: 6000, valeNoCusto: true });
    expect(detalheNota.chaveAcesso).toBe(CHAVE);
    expect(detalheNota.documentoId).toBe(ids.doc);
    // Estoque: +6 kg, +20 kg, +500 un, uma vez.
    const movs = await a.movimentoEstoque.findMany({ where: { notaId: ids.nota }, orderBy: { insumoNomeSnapshot: 'asc' } });
    expect(movs.map((m) => [m.insumoNomeSnapshot, m.tipo, m.quantidadeMilesimos])).toEqual([
      ['Bacon', 'ENTRADA_COMPRA', 20000],
      ['Guardanapo', 'ENTRADA_COMPRA', 500000],
      ['Muçarela', 'ENTRADA_COMPRA', 6000],
    ]);
    const doc = await detalhe(ids.doc);
    expect(doc).toMatchObject({ situacao: 'CONCILIADO', nota: { id: ids.nota } });
    const [h] = await listarHistorico(a, { de: [{ entidade: 'DocumentoFiscal', ids: [ids.doc] }], verPrecos: true });
    expect(h).toMatchObject({ acao: 'CONCILIOU' });
    // Conciliar de novo: já conciliada, nenhuma segunda nota.
    expect(await conciliarDocumento(a, DONA(), ids.doc, conferencia(d), 'Marina')).toMatchObject({ ok: false, conflito: true });
    expect(await a.notaEntrada.count()).toBe(1);
  });

  it('critério 26: a nota que veio do XML não se edita (a frase manda cancelar e conciliar de novo)', async () => {
    const n = (await obterNota(a, DONA(), ids.nota))!;
    const r = await editarNota(a, DONA(), ids.nota, { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '4521', serie: '1', data: dataBr(hoje), frete: '30,00', total: '580,00', versao: n.versao, itens: [] }, 'Marina');
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/veio do XML.*Cancele a nota/) } });
  });

  it('critério 18: a memória lembra o item por fornecedor + código + UNIDADE: PC já vem vinculado, KG não', async () => {
    const mesmo = await receber(xmlDe([], '4560'));
    const outro = await receber(
      xmlDe([[/<cProd>BAC-CX10<\/cProd>/, '<cProd>BAC-CX10</cProd>'], [/<uCom>PC<\/uCom>/, '<uCom>KG</uCom>'], [/<uTrib>PC<\/uTrib>/, '<uTrib>KG</uTrib>']], '4561'),
    );
    const d1 = await detalhe(idDe(mesmo));
    expect(d1.itens.map((i) => [i.codigoProduto, i.insumoNome, i.fator, i.origem])).toEqual([
      ['QJ-MUS-2K', 'Muçarela', '1', 'memoria'],
      ['BAC-CX10', 'Bacon', '10', 'memoria'],
      ['GUAR-500', 'Guardanapo', '1', 'memoria'],
    ]);
    const d2 = await detalhe(idDe(outro));
    expect(d2.itens[0]).toMatchObject({ unidadeComercial: 'KG', insumoId: null, origem: null });
    expect(d2.itens[1].insumoNome).toBe('Bacon');
    ids.doc2 = d1.id;
    ids.doc3 = d2.id;
  });

  it('critério 28: quem tem fornecedores.editar troca o fator de 10 para 12 (antes/depois no histórico); a nota antiga não muda; quem não tem, não troca', async () => {
    const d = await detalhe(ids.doc2);
    const trocado = escolhasDoRoteiro().map((e) => (e.nItem === 2 ? { ...e, fator: '12' } : e));
    // O gerente da Penha tem fornecedores.editar (perfil base), então troca; o operador nem concilia.
    const op = await salvarConferencia(a, OPERADOR_VP(), ids.doc2, { versao: d.versao, itens: trocado }, 'Caio');
    expect(op).toMatchObject({ ok: false });
    // Uma pessoa que concilia mas NÃO edita fornecedores: perfil próprio só com compras.
    const soCompras = resolverAlcance({ perfilBase: null, perfilProprio: ['compras.ver', 'compras.lancar', 'insumos.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
    const negado = await salvarConferencia(a, soCompras, ids.doc2, { versao: d.versao, itens: trocado }, 'Luna');
    expect(negado).toMatchObject({ ok: false, erros: { 'item-2': expect.stringMatching(/Só quem pode editar fornecedores/) } });
    expect(await a.vinculoItemFornecedor.findFirst({ where: { codigoProduto: 'BAC-CX10' } })).toMatchObject({ fatorMilesimos: 10000 });
    const ok = await salvarConferencia(a, GERENTE_VP(), ids.doc2, { versao: d.versao, itens: trocado }, 'Gil Gerente');
    expect(ok).toMatchObject({ ok: true });
    const v = (await a.vinculoItemFornecedor.findFirst({ where: { codigoProduto: 'BAC-CX10' } }))!;
    expect(v.fatorMilesimos).toBe(12000);
    const [h] = await listarHistorico(a, { de: [{ entidade: 'VinculoItemFornecedor', ids: [v.id] }], verPrecos: true });
    expect(h).toMatchObject({ acao: 'ALTEROU', autorNome: 'Gil Gerente' });
    expect(h.mudancas).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'embalagens por unidade da nota', antes: '10', depois: '12' })]));
    // A nota do critério 15 e o documento dela ficam como estavam.
    const itensDaNota = await a.notaEntradaItem.findMany({ where: { notaId: ids.nota }, orderBy: { ordem: 'asc' } });
    expect(itensDaNota.map((i) => i.quantidadeMilesimos)).toEqual([6000, 20000, 500000]);
    const antigo = await detalhe(ids.doc);
    expect(antigo.itens[1]).toMatchObject({ fator: '10' });
  });

  it('critério 23: cancelar a nota conciliada estorna UMA vez e devolve o documento à fila; conciliar de novo dá UMA nota ativa', async () => {
    const antes = await a.movimentoEstoque.count({ where: { notaId: ids.nota } });
    expect(antes).toBe(3);
    const r = await cancelarNota(a, DONA(), ids.nota, 'teste: voltar a conferir', 'Marina');
    expect(r).toMatchObject({ ok: true });
    expect(await a.movimentoEstoque.count({ where: { notaId: ids.nota } })).toBe(6);
    const d = await detalhe(ids.doc);
    expect(d).toMatchObject({ situacao: 'AGUARDANDO_CONFERENCIA', nota: null });
    const c = await conciliarDocumento(a, DONA(), ids.doc, conferencia(d), 'Marina Dona');
    expect(c).toMatchObject({ ok: true });
    ids.nota2 = (c as { notaId: string }).notaId;
    expect(ids.nota2).not.toBe(ids.nota);
    expect(await a.notaEntrada.count({ where: { chaveAcesso: CHAVE, status: 'LANCADA' } })).toBe(1);
    expect(await a.notaEntrada.count({ where: { chaveAcesso: CHAVE } })).toBe(2);
    // Saldo certo: o estorno e a nova entrada se compensam (+6 kg uma vez só).
    const saldo = await a.saldoEstoque.findFirst({ where: { lojaId: ids.vp, insumoId: ids.mucarela }, select: { quantidadeMilesimos: true } });
    expect(saldo!.quantidadeMilesimos).toBe(6000);
    // O custo da muçarela é o da nota nova, uma só.
    expect(await a.notaEntradaItem.count({ where: { nota: { chaveAcesso: CHAVE, status: 'LANCADA' } } })).toBe(3);
  });

  it('critério 22: a nota lançada à mão antes e o XML depois: "ligar" não cria nota nem estoque; conciliar sem ligar é recusado', async () => {
    // Fornecedor SEM CNPJ (como os antigos), nota digitada 4570 série 1, e só depois chega o XML da 4570.
    const f = await cadastrarFornecedor(a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!f.ok) throw new Error(JSON.stringify(f));
    const manual = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: f.id, numero: '4570', serie: '1', data: dataBr(hoje), frete: '', total: '60,00', itens: [{ insumoId: ids.mucarela, embalagem: 'padrao', quantidade: '2', valor: '60,00' }] }, 'Marina');
    if (!manual.ok) throw new Error(JSON.stringify(manual));
    const movsAntes = await a.movimentoEstoque.count();
    const notasAntes = await a.notaEntrada.count();
    const id = idDe(await receber(xmlDe([], '4570')));
    const d = await detalhe(id);
    expect(d.notaParaLigar).toHaveLength(1);
    expect(d.notaParaLigar[0]).toMatchObject({ id: manual.id, mesmoFornecedor: false, fornecedorSemCnpj: true, totalCentavos: 6000, diferencaCentavos: 52000 });
    // Conciliar sem dizer que é outra nota: recusado.
    const recusado = await conciliarDocumento(a, DONA(), id, { versao: d.versao, data: dataBr(hoje), itens: escolhasDoRoteiro() }, 'Marina');
    expect(recusado).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/já existe a Nota 4570/i) } });
    expect(await a.notaEntrada.count()).toBe(notasAntes);
    const ligou = await ligarDocumento(a, DONA(), id, manual.id, d.versao, {}, 'Marina Dona');
    expect(ligou).toMatchObject({ ok: true, notaId: manual.id });
    expect(await a.notaEntrada.count()).toBe(notasAntes);
    expect(await a.movimentoEstoque.count()).toBe(movsAntes);
    const n = (await obterNota(a, DONA(), manual.id))!;
    expect(n.chaveAcesso).toMatch(/^3326101122233300018155001000004570/);
    expect(await detalhe(id)).toMatchObject({ situacao: 'CONCILIADO', nota: { id: manual.id, diferencaCentavos: 52000 } });
    // A nota ligada também não se edita.
    expect(await editarNota(a, DONA(), manual.id, { lojaId: ids.vp, fornecedorId: f.id, numero: '4570', serie: '1', data: dataBr(hoje), total: '60,00', versao: n.versao, itens: [] }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/veio do XML/) } });
    ids.fornManual = f.id;
  });

  it('critério 24: cinco conciliações ao mesmo tempo do mesmo documento dão UMA nota', async () => {
    const id = idDe(await receber(xmlDe([], '4580')));
    const d = await detalhe(id);
    const antes = await a.notaEntrada.count();
    const rs = await Promise.all([1, 2, 3, 4, 5].map((n) => conciliarDocumento(a, DONA(), id, conferencia(d), `Pessoa ${n}`)));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => (r as { conflito?: boolean }).conflito)).toBe(true);
    expect(await a.notaEntrada.count()).toBe(antes + 1);
    expect(await a.notaEntrada.count({ where: { chaveAcesso: { startsWith: '332610112223330001815500100000458' }, status: 'LANCADA' } })).toBe(1);
  });

  it('critério 25: a gerente da outra loja não alcança o documento (nem o id); o operador não vê notas recebidas; o outro parceiro tampouco', async () => {
    expect(await obterDocumento(a, GERENTE_CENTRO(), ids.doc)).toBeNull();
    expect((await listarDocumentos(a, GERENTE_CENTRO(), { situacao: 'todas' })).linhas).toHaveLength(0);
    expect(await obterDocumento(a, OPERADOR_VP(), ids.doc)).toBeNull();
    expect((await listarDocumentos(a, OPERADOR_VP(), { situacao: 'todas' })).total).toBe(0);
    expect(await obterDocumento(b, DONA(), ids.doc)).toBeNull();
    // Quem não alcança a loja não concilia nem cancela, e a recusa não diz de quem é a nota.
    const d = await detalhe(ids.doc);
    expect(await conciliarDocumento(a, GERENTE_CENTRO(), ids.doc, conferencia(d), 'Gil')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await cancelarDocumento(a, GERENTE_CENTRO(), ids.doc, d.versao, 'tentando', 'Gil')).toMatchObject({ ok: false, naoEncontrado: true });
    expect(await ligarDocumento(a, GERENTE_CENTRO(), ids.doc, 'x', d.versao, {}, 'Gil')).toMatchObject({ ok: false, naoEncontrado: true });
    // O gerente da Penha vê e pode.
    expect((await listarDocumentos(a, GERENTE_VP(), { situacao: 'todas' })).total).toBeGreaterThan(0);
    // Receber: o operador não tem compras.lancar.
    expect(await receberXml(a, OPERADOR_VP(), bytes(xmlDe([], '4590')), 'Caio')).toMatchObject({ ok: false });
  });

  it('isolamento entre parceiros: o parceiro B recebe a MESMA nota para a loja dele, sem conflito, e nada de A vaza', async () => {
    expect(await salvarCnpjDaLoja(b, ids.lojaB, '11.444.777/0001-61', '', 'Bia')).toMatchObject({ ok: true });
    const r = await receberXml(b, alcanceDe('DONO', 'rede'), bytes(xmlDe()), 'Bia');
    expect(r).toMatchObject({ ok: true });
    const idB = (r as { id: string }).id;
    expect(idB).not.toBe(ids.doc);
    expect(await b.documentoFiscal.count()).toBe(1);
    expect(await b.fornecedor.count()).toBe(1);
    expect(await b.vinculoItemFornecedor.count()).toBe(0);
    // Memória de A não vaza para B: o item chega pendente.
    const dB = (await obterDocumento(b, alcanceDe('DONO', 'rede'), idB))!;
    expect(dB.vinculados).toBe(0);
    // O documento de A é invisível para B e vice-versa.
    expect(await obterDocumento(a, DONA(), idB)).toBeNull();
    expect(await obterDocumento(b, alcanceDe('DONO', 'rede'), ids.doc)).toBeNull();
  });

  it('cancelar o documento: aguardando só marca; o conciliado cancela a nota (estorno oficial) e o descartado não volta', async () => {
    const id = idDe(await receber(xmlDe([], '4600')));
    const d = await detalhe(id);
    expect(await cancelarDocumento(a, DONA(), id, d.versao, 'x', 'Marina')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await cancelarDocumento(a, DONA(), id, d.versao, 'não é da casa', 'Marina')).toMatchObject({ ok: true });
    const c = await detalhe(id);
    expect(c).toMatchObject({ situacao: 'CANCELADO', motivo: 'não é da casa' });
    // O cancelado não concilia, e a mesma chave não entra de novo (o documento é um só).
    expect(await conciliarDocumento(a, DONA(), id, conferencia(c), 'Marina')).toMatchObject({ ok: false });
    expect(await receber(xmlDe([], '4600'))).toEqual({ ok: true, id, mudou: [], repetido: true });
    // O conciliado: descartar cancela a nota (estorna 1x) e marca o documento.
    const movs = await a.movimentoEstoque.count({ where: { notaId: ids.nota2 } });
    const d0 = await detalhe(ids.doc);
    expect(await cancelarDocumento(a, DONA(), ids.doc, d0.versao, 'devolvida ao fornecedor', 'Marina')).toMatchObject({ ok: true });
    expect(await a.movimentoEstoque.count({ where: { notaId: ids.nota2 } })).toBe(movs * 2);
    expect(await a.notaEntrada.findUnique({ where: { id: ids.nota2 } })).toMatchObject({ status: 'CANCELADA' });
    expect(await detalhe(ids.doc)).toMatchObject({ situacao: 'CANCELADO', nota: null });
  });

  it('o banco recusa o que as regras já recusam: conteúdo do documento imutável, loja e fornecedor uma vez, cancelado não volta, conciliado quer nota', async () => {
    const id = idDe(await receber(xmlDe([], '4610')));
    const tentar = (sql: string) => cru(db, perfil, A.id, sql);
    await expect(tentar(`UPDATE "DocumentoFiscal" SET "vNfCentavos" = 1 WHERE "id" = '${id}'`)).rejects.toThrow(/conteudo_imutavel|não se altera/);
    await expect(tentar(`UPDATE "DocumentoFiscal" SET "xml" = 'x' WHERE "id" = '${id}'`)).rejects.toThrow();
    await expect(tentar(`UPDATE "DocumentoFiscal" SET "lojaId" = '${ids.centro}' WHERE "id" = '${id}'`)).rejects.toThrow(/não troca/);
    await expect(tentar(`UPDATE "DocumentoFiscal" SET "situacao" = 'CONCILIADO' WHERE "id" = '${id}'`)).rejects.toThrow(/conciliado_tem_nota/);
    await expect(tentar(`UPDATE "DocumentoFiscalItem" SET "qComMilesimos" = 5 WHERE "documentoId" = '${id}'`)).rejects.toThrow(/não se altera/);
    await expect(tentar(`UPDATE "DocumentoFiscalItem" SET "insumoId" = NULL WHERE "documentoId" = '${id}'`)).rejects.toThrow(/resolucao_inteira|embalagem_precisa_insumo/);
    await expect(tentar(`UPDATE "DocumentoFiscalItem" SET "fatorMilesimos" = 0 WHERE "documentoId" = '${id}'`)).rejects.toThrow(/fator_faixa/);
    const d = await detalhe(id);
    await cancelarDocumento(a, DONA(), id, d.versao, 'limpeza do teste', 'Marina');
    await expect(tentar(`UPDATE "DocumentoFiscal" SET "situacao" = 'AGUARDANDO_CONFERENCIA', "canceladoEm" = NULL WHERE "id" = '${id}'`)).rejects.toThrow(/cancelado não muda/);
    // Duas notas ATIVAS com a mesma chave não existem (índice parcial); a nota CANCELADA libera a chave.
    const ativas = await a.notaEntrada.findMany({ where: { status: 'LANCADA', chaveAcesso: { not: null } }, orderBy: { criadoEm: 'asc' }, take: 2 });
    expect(ativas).toHaveLength(2);
    await expect(tentar(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${ativas[0].chaveAcesso}' WHERE "id" = '${ativas[1].id}'`)).rejects.toThrow(/already exists/);
    const cancelada = (await a.notaEntrada.findFirst({ where: { status: 'CANCELADA', chaveAcesso: { not: null } } }))!;
    const original = ativas[1].chaveAcesso;
    await tentar(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${cancelada.chaveAcesso}' WHERE "id" = '${ativas[1].id}'`);
    await tentar(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${original}' WHERE "id" = '${ativas[1].id}'`);
  });

  it('o fornecedor desativado, o "sem nota fiscal" e dois cadastros com o mesmo CNPJ nunca são escolhidos sozinhos', async () => {
    // Desativado: recusa com a frase de reativar; nada é gravado.
    const f = (await a.fornecedor.findFirst({ where: { documento: '11222333000181' } }))!;
    expect(await mudarSituacaoFornecedor(a, f.id, false, 'teste', 'Marina')).toMatchObject({ ok: true });
    const antes = await contagens();
    expect(await receber(xmlDe([], '4620'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/está desativado.*Reative/) } });
    expect(await contagens()).toEqual(antes);
    expect(await mudarSituacaoFornecedor(a, f.id, true, '', 'Marina')).toMatchObject({ ok: true });
    // Dois ativos com o mesmo CNPJ (índice único não existe nesta base de teste? existe: força por SQL só se der).
    const indice = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'Fornecedor_parceiroId_documento_key'`);
    if (indice[0].n === 1) {
      await cru(db, perfil, A.id, `DROP INDEX "Fornecedor_parceiroId_documento_key"`);
      await cru(db, perfil, A.id, `INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('fdup${sufixo}','${A.id}','Laticínios Exemplo - Penha','11222333000181',now())`);
      const id = idDe(await receber(xmlDe([], '4630')));
      const d = await detalhe(id);
      expect(d.fornecedor).toBeNull();
      expect(d.fornecedoresCandidatos.map((x) => x.nome).sort()).toEqual(['Laticínios Exemplo', 'Laticínios Exemplo - Penha']);
      // Sem escolher, não concilia; escolhendo um dos dois, concilia.
      expect(await conciliarDocumento(a, DONA(), id, conferencia(d), 'Marina')).toMatchObject({ ok: false, erros: { fornecedorId: expect.stringMatching(/Escolha o fornecedor/) } });
      expect(await conciliarDocumento(a, DONA(), id, conferencia(d, { fornecedorId: 'fdup' + sufixo }), 'Marina')).toMatchObject({ ok: true });
      await cru(db, perfil, A.id, `DELETE FROM "VinculoItemFornecedor" WHERE "fornecedorId" = 'fdup${sufixo}'`);
      await cru(db, perfil, A.id, `UPDATE "Fornecedor" SET documento = NULL WHERE id = 'fdup${sufixo}'`);
      await cru(db, perfil, A.id, `CREATE UNIQUE INDEX "Fornecedor_parceiroId_documento_key" ON "Fornecedor"("parceiroId", "documento") WHERE "documento" IS NOT NULL`);
    }
    // "Compras sem nota fiscal" com o mesmo CNPJ: recusa explicando que ele nunca recebe nota fiscal.
    await cru(db, perfil, A.id, `UPDATE "Fornecedor" SET "ativo" = false WHERE id = '${f.id}'`);
    await cru(db, perfil, A.id, `UPDATE "Fornecedor" SET "documento" = '11222333000262', "semNotaFiscal" = true, "ativo" = true WHERE id = '${ids.fornManual}'`);
    const filial = await receber(xmlDe([], '4640', '11222333000262'));
    expect(filial).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/Compras sem nota fiscal.*nunca recebe nota fiscal/) } });
    await cru(db, perfil, A.id, `UPDATE "Fornecedor" SET "ativo" = true WHERE id = '${f.id}'`);
    await cru(db, perfil, A.id, `UPDATE "Fornecedor" SET "documento" = NULL, "semNotaFiscal" = true WHERE id = '${ids.fornManual}'`);
    const detalheForn = await obterFornecedor(a, DONA(), f.id);
    expect(detalheForn).toBeTruthy();
  });

  it('item do mesmo insumo e embalagem em duas linhas do XML vira UMA linha na nota; a mesma escolha em dois itens de um código só', async () => {
    // Troca o código do item 3 para o do item 1 e dá a mesma escolha: a nota soma as duas linhas.
    const id = idDe(
      await receber(
        xmlDe(
          [
            [/<cProd>GUAR-500<\/cProd>/, '<cProd>QJ-MUS-2K</cProd>'],
            [/<xProd>GUARDANAPO 500UN<\/xProd>/, '<xProd>QUEIJO MUSSARELA PECA 2KG</xProd>'],
            [/<uCom>FD<\/uCom>/, '<uCom>PC</uCom>'],
            [/<uTrib>FD<\/uTrib>/, '<uTrib>PC</uTrib>'],
          ],
          '4650',
        ),
      ),
    );
    const d = await detalhe(id);
    // Os dois itens do código QJ-MUS-2K em PC já vêm da memória (muçarela, peça 2 kg).
    expect(d.itens[0].insumoNome).toBe('Muçarela');
    expect(d.itens[2].insumoNome).toBe('Muçarela');
    const escolhas = [
      { nItem: 1, insumoId: ids.mucarela, embalagem: `v:${ids.peca}`, fator: '1' },
      { nItem: 2, insumoId: ids.bacon, embalagem: `v:${ids.pacote}`, fator: '12' },
      { nItem: 3, insumoId: ids.mucarela, embalagem: `v:${ids.peca}`, fator: '1' },
    ];
    const c = await conciliarDocumento(a, DONA(), id, { versao: d.versao, data: dataBr(hoje), itens: escolhas }, 'Marina Dona');
    expect(c).toMatchObject({ ok: true });
    const itens = await a.notaEntradaItem.findMany({ where: { notaId: (c as { notaId: string }).notaId }, orderBy: { ordem: 'asc' } });
    expect(itens).toHaveLength(2);
    expect(itens.map((i) => [i.insumoNomeSnapshot, i.embalagensMilesimos, i.valorTotalCentavos])).toEqual([
      ['Muçarela', 4000, 14500 + 2500],
      ['Bacon', 24000, 38000],
    ]);
    // Dois itens do mesmo código e unidade com escolhas DIFERENTES: o sistema lembra uma só e recusa.
    const id2 = idDe(
      await receber(
        xmlDe(
          [
            [/<cProd>GUAR-500<\/cProd>/, '<cProd>QJ-MUS-2K</cProd>'],
            [/<uCom>FD<\/uCom>/, '<uCom>PC</uCom>'],
            [/<uTrib>FD<\/uTrib>/, '<uTrib>PC</uTrib>'],
          ],
          '4651',
        ),
      ),
    );
    const d2 = await detalhe(id2);
    const diferentes = [
      { nItem: 1, insumoId: ids.mucarela, embalagem: `v:${ids.peca}`, fator: '1' },
      { nItem: 2, insumoId: ids.bacon, embalagem: `v:${ids.pacote}`, fator: '12' },
      { nItem: 3, insumoId: ids.mucarela, embalagem: 'padrao', fator: '2' },
    ];
    expect(await conciliarDocumento(a, DONA(), id2, { versao: d2.versao, data: dataBr(hoje), itens: diferentes }, 'Marina')).toMatchObject({ ok: false, erros: { 'item-3': expect.stringMatching(/uma escolha só por código e unidade/) } });
  });

  it('o período fechado, o insumo desativado e o pré-preparo barram a conciliação sem mexer no documento', async () => {
    const id = idDe(await receber(xmlDe([], '4660')));
    const d = await detalhe(id);
    // Insumo desativado depois de vinculado: a conciliação recusa com a frase do insumo.
    await a.insumo.update({ where: { id: ids.guardanapo }, data: { ativo: false } });
    const r = await conciliarDocumento(a, DONA(), id, conferencia(d), 'Marina');
    expect(r).toMatchObject({ ok: false });
    expect((r as { erros: Record<string, string> }).erros['item-3']).toMatch(/desativado/);
    await a.insumo.update({ where: { id: ids.guardanapo }, data: { ativo: true } });
    expect((await detalhe(id)).situacao).toBe('AGUARDANDO_CONFERENCIA');
    expect(await a.notaEntrada.count({ where: { origemRef: id } })).toBe(0);
    // Memória cujo insumo foi desativado: o próximo documento recebe o item PENDENTE (não vincula sozinho a um insumo parado).
    await a.insumo.update({ where: { id: ids.guardanapo }, data: { ativo: false } });
    const id2 = idDe(await receber(xmlDe([], '4661')));
    expect((await detalhe(id2)).itens[2]).toMatchObject({ insumoId: null });
    await a.insumo.update({ where: { id: ids.guardanapo }, data: { ativo: true } });
  });
});
