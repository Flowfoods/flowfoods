/** PG preparado; a coordenação executa. Fixtures fiscais sintéticas, sem serviço externo. */
import { PrismaClient, type SituacaoDocumentoFiscal } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
import { cadastrarLoja, salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import { receberXml, cancelarDocumento, ligarDocumento, obterDocumento, listarDocumentos } from '@/lib/erp/documentos-fiscais';
import { lancarNota } from '@/lib/erp/compras';
import { digitoDaChave, lerNfeXml } from '@/lib/erp/nfe-xml';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { lerXmlAguardandoDaHome, xmlAguardandoDaHome } from '@/lib/erp/home-xml-aguardando';
import { painelDoDia } from '@/lib/erp/painel-do-dia';
import * as relatorios from '@/lib/erp/compras-relatorio';
import { bytes, montarCenario, xmlDe, type Cenario } from './erp-documento-fiscal-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-29';
const acesso = (lojas: string[] | 'rede' = 'rede', apenasVer = false) => resolverAlcance({ perfilBase: apenasVer ? null : 'DONO', perfilProprio: apenasVer ? ['compras.ver'] : null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojas === 'rede', lojaIds: lojas === 'rede' ? [] : lojas });
const idDe = (r: { ok: boolean }) => { if (!r.ok || !('id' in r) || typeof r.id !== 'string') throw new Error(JSON.stringify(r)); return r.id; };
function xmlForaDoMes(numero: string) {
  let xml = xmlDe([], numero);
  const chave = /Id="NFe([0-9]{44})"/.exec(xml)?.[1]; if (!chave) throw new Error('Fixture sem chave.');
  const corpo = chave.slice(0, 2) + '2609' + chave.slice(6, 43);
  const nova = corpo + digitoDaChave(corpo);
  xml = xml.split(chave).join(nova).replace(/<cDV>\d<\/cDV>/, '<cDV>' + nova[43] + '</cDV>').replaceAll('2026-10-21', '2026-09-21');
  return xml;
}

describe.skipIf(!URL_TESTE)('Home · XML aguardando em fonte independente no Postgres local', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let c: Cenario;
  let desativada: string;
  let vazia: string;
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);
  const contexto = (lojaId: string, raiz = '/erp') => ({ alcance: acesso([lojaId], true), loja: { id: lojaId, nome: 'Loja sintética' }, raiz, hoje: HOJE, consultadoEm: '2026-10-29T15:00:00.000Z' });
  const ler = (lojaId = c.ids.vp) => lerXmlAguardandoDaHome(c.a, acesso([lojaId], true), lojaId);
  const dto = async (lojaId = c.ids.vp, raiz = '/erp') => xmlAguardandoDaHome({ estado: 'lido', dados: await ler(lojaId) }, contexto(lojaId, raiz));
  const livro = async () => Promise.all([
    c.a.notaEntrada.findMany({ orderBy: { id: 'asc' } }), c.a.notaEntradaItem.findMany({ orderBy: { id: 'asc' } }),
    c.a.movimentoEstoque.findMany({ orderBy: { id: 'asc' } }), c.a.saldoEstoque.findMany({ orderBy: { id: 'asc' } }),
    c.a.insumo.findMany({ orderBy: { id: 'asc' } }), c.a.despesa.count(),
  ]);
  async function receber(xml: string, cliente = c.a) { return idDe(await receberXml(cliente, acesso(), bytes(xml), 'Fixture XML Home')); }
  async function novaLoja(nome: string) { return idDe(await cadastrarLoja(c.a, { nome }, 'Fixture XML Home')); }

  /** Estados reservados/legado: INSERÇÃO INICIAL válida, sem transição proibida ou trigger desativado. */
  async function inicial(numero: string, situacao: SituacaoDocumentoFiscal, lojaId: string | null) {
    const r = lerNfeXml(bytes(xmlDe([], numero))); if (!r.ok) throw new Error(r.erro);
    const n = r.nota;
    const d = await c.a.documentoFiscal.create({ data: {
      parceiroId: c.A.id, chaveAcesso: n.chaveAcesso, modelo: n.modelo, serie: n.serie, numero: n.numero,
      emitidaEm: new Date(n.emitidaEm + 'T00:00:00.000Z'), emitenteDocumento: n.emitente.documento, emitenteRazao: n.emitente.razao,
      destinatarioDocumento: n.destinatarioDocumento, lojaId, situacao, origem: 'XML_MANUAL',
      vProdCentavos: n.totais.vProdCentavos, vDescCentavos: n.totais.vDescCentavos, vFreteCentavos: n.totais.vFreteCentavos,
      vSegCentavos: n.totais.vSegCentavos, vOutroCentavos: n.totais.vOutroCentavos, vIpiCentavos: n.totais.vIpiCentavos,
      vStCentavos: n.totais.vStCentavos, vNfCentavos: n.totais.vNfCentavos, xmlSha256: r.sha256, xml: r.texto, criadoPorNome: 'Fixture inicial reservada',
    } });
    // RECEBIDO/ERRO são cabeçalhos ainda sem itens importados. O trigger só
    // permite inserir itens quando o documento já aguarda conferência.
    if (situacao === 'AGUARDANDO_CONFERENCIA') {
      await c.a.documentoFiscalItem.createMany({ data: n.itens.map(i => ({ parceiroId: c.A.id, documentoId: d.id, ...i })) });
    }
  }
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
    c = await montarCenario(db, 'xmlhome', sufixo);
    // Dois documentos atribuídos à A; um foi emitido no mês anterior, com chave/dígito coerentes.
    await receber(xmlDe([], '4611')); await receber(xmlForaDoMes('4612'));
    await receber(xmlDe([['<CNPJ>11444777000161</CNPJ>', '<CNPJ>12345678000195</CNPJ>']], '4613'));
    await receber(xmlDe([], '4611'), c.b); // Mesmo XML/CNPJ, outro parceiro.
    // Desativada: recebeu antes e continua com a pendência existente.
    desativada = await novaLoja('Arquivada'); vazia = await novaLoja('Sem XML');
    const cj = await salvarCnpjDaLoja(c.a, desativada, '11.444.777/0002-42', '', 'Fixture XML Home'); if (!cj.ok) throw new Error(JSON.stringify(cj));
    await receber(xmlDe([['<CNPJ>11444777000161</CNPJ>', '<CNPJ>11444777000242</CNPJ>']], '4614'));
    await c.a.loja.update({ where: { id: desativada }, data: { ativa: false } });
    await inicial('4615', 'AGUARDANDO_CONFERENCIA', null);
    await inicial('4616', 'RECEBIDO', c.ids.vp); await inicial('4617', 'ERRO', c.ids.vp);
    const cancelado = await receber(xmlDe([], '4618')); const dc = await obterDocumento(c.a, acesso(), cancelado);
    if (!dc) throw new Error('Documento cancelável ausente.');
    const cancelou = await cancelarDocumento(c.a, acesso(), cancelado, dc.versao, 'Fixture descartada', 'Fixture XML Home'); if (!cancelou.ok) throw new Error(JSON.stringify(cancelou));
    // Conciliação por vínculo real: nota/loja/fornecedor consistentes; não muda só o enum.
    const conciliado = await receber(xmlDe([], '4619')); const d = await obterDocumento(c.a, acesso(), conciliado);
    if (!d?.fornecedor) throw new Error('Fornecedor da fixture ausente.');
    const nota = await lancarNota(c.a, acesso(), { lojaId: c.ids.vp, fornecedorId: d.fornecedor.id, numero: '4619', serie: '1', data: '2026-10-28', frete: '', total: '580,00', itens: [{ insumoId: c.ids.mucarela, embalagem: 'padrao', quantidade: '2', valor: '580,00' }] }, 'Fixture XML Home');
    const ligou = await ligarDocumento(c.a, acesso(), conciliado, idDe(nota), d.versao, {}, 'Fixture XML Home'); if (!ligou.ok) throw new Error(JSON.stringify(ligou));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (db && perfil && c) await limparParceiros(db, perfil, [c.A.id, c.B.id]);
    await db?.$disconnect();
  });

  it('contador exato por loja sem data, diferente da fila mais ampla; cancelado/conciliado/nulo não somam', async () => {
    const antes = await livro(); const p = await dto();
    expect(p).toMatchObject({ estado: 'ok', aguardando: 2, loja: { id: c.ids.vp, ativa: true }, referencia: 'fila_atual' });
    const direto = await c.a.transacao(tx => relatorios.documentosAguardando(tx, [c.ids.vp]), { repetivel: true, relatorio: {} });
    expect(p!.aguardando).toBe(direto);
    const lista = await listarDocumentos(c.a, acesso([c.ids.vp], true), { lojaId: c.ids.vp, situacao: 'fila' });
    expect(lista.total).toBe(4); expect(lista.linhas.map(x => x.situacao).sort()).toEqual(['AGUARDANDO_CONFERENCIA', 'AGUARDANDO_CONFERENCIA', 'ERRO', 'RECEBIDO']);
    expect(p!.aviso).toMatch(/sem recorte mensal.*também pode incluir notas recebidas ou com erro/);
    expect(await livro()).toEqual(antes);
    expect(JSON.stringify(p)).not.toMatch(/11444777|11222333|chaveAcesso|xmlSha256|vNfCentavos|fornecedor/);
  });

  it('A/B/parceiro, zero e desativada autorizada preservam alcance; N1 não muda de cliente', async () => {
    expect(await dto(c.ids.centro)).toMatchObject({ estado: 'ok', aguardando: 1 });
    expect(await dto(vazia)).toMatchObject({ estado: 'ok', aguardando: 0 });
    expect(await dto(desativada)).toMatchObject({ estado: 'ok', aguardando: 1, loja: { ativa: false } });
    const b = await lerXmlAguardandoDaHome(c.b, acesso([c.ids.lojaB], true), c.ids.lojaB);
    expect(b).toMatchObject({ tipo: 'lido', aguardando: 1, loja: { id: c.ids.lojaB } });
    expect(await lerXmlAguardandoDaHome(c.a, acesso([c.ids.centro], true), c.ids.vp)).toBeNull();
    expect(await lerXmlAguardandoDaHome(c.b, acesso(), c.ids.vp)).toBeNull();
    const sem = { ...acesso([c.ids.vp], true), permissoes: new Set<never>() };
    expect(await lerXmlAguardandoDaHome(c.a, sem, c.ids.vp)).toBeNull();
    const n1 = await dto(c.ids.vp, '/rodolfo/erp/' + c.A.slug);
    expect(n1!.detalhe.href).toBe('/rodolfo/erp/' + c.A.slug + '/compras/recebidas?loja=' + c.ids.vp);
  });

  it('aborto SQL real é só da fonte XML: KPI/categorias continuam íntegros, sem retry ou mutação do livro', async () => {
    const al = acesso([c.ids.vp], true); const visao = { tipo: 'loja', lojaId: c.ids.vp, nome: 'Vila da Penha' } as const;
    const normal = await painelDoDia(c.a, al, '/erp', HOJE, visao);
    if (normal.analitico?.tipo !== 'loja') throw new Error('Home da loja esperada.');
    const esperado = normal.analitico.widgets.find(w => w.familia === 'compras');
    expect(esperado).toMatchObject({ estado: 'ok', valor: { valor: 58000 }, composicaoPorCategoria: { estado: 'ok', totalCentavos: 58000 } });
    const antes = await livro(); let erroSql: unknown;
    const spy = vi.spyOn(relatorios, 'documentosAguardando').mockImplementationOnce(async tx => {
      try { await tx.sql`SELECT (1 / 0)::int AS "falha" FROM "DocumentoFiscal" WHERE "parceiroId" = ${tx.parceiroId}`; }
      catch (e) { erroSql = e; throw e; }
      throw new Error('A query deveria abortar. Esta sentinela não é prova.');
    });
    const p = await painelDoDia(c.a, al, '/erp', HOJE, visao);
    expect(erroSql).toMatchObject({ code: 'P2010', meta: { code: '22012' } }); expect(spy).toHaveBeenCalledTimes(1);
    expect(p.xmlAguardando).toMatchObject({ estado: 'erro', aguardando: null });
    if (p.analitico?.tipo !== 'loja') throw new Error('Home da loja esperada.');
    const atual = p.analitico.widgets.find(w => w.familia === 'compras')!;
    expect({ ...atual, consultadoEm: esperado!.consultadoEm }).toEqual(esperado);
    expect(JSON.stringify(p)).not.toMatch(/Prisma|SELECT|DocumentoFiscal|P2010|22012|division/);
    expect(await livro()).toEqual(antes);
    spy.mockRestore(); expect(await dto()).toMatchObject({ estado: 'ok', aguardando: 2 });
  });

  it('receber mais XML muda só a fila; dinheiro e composição não o contam como compra', async () => {
    const al = acesso([c.ids.vp], true); const visao = { tipo: 'loja', lojaId: c.ids.vp, nome: 'Vila da Penha' } as const;
    const anterior = await painelDoDia(c.a, al, '/erp', HOJE, visao); const antes = await livro();
    await receber(xmlDe([], '4620'));
    const depois = await painelDoDia(c.a, al, '/erp', HOJE, visao);
    expect(depois.xmlAguardando).toMatchObject({ estado: 'ok', aguardando: 3 }); expect(await livro()).toEqual(antes);
    if (anterior.analitico?.tipo !== 'loja' || depois.analitico?.tipo !== 'loja') throw new Error('Home da loja esperada.');
    const a = anterior.analitico.widgets.find(w => w.familia === 'compras')!; const b = depois.analitico.widgets.find(w => w.familia === 'compras')!;
    expect({ ...b, consultadoEm: a.consultadoEm }).toEqual(a);
  });
});
