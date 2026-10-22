/**
 * ERP F.1b · as actions e as telas das notas recebidas por XML (a página de verdade, com banco), nas duas árvores de rota.
 *
 *  - o arquivo vai por FormData, como o navegador manda: tamanho conferido antes de ler os bytes, DOCTYPE recusado, mesmo arquivo
 *    = "já recebido", operador barrado, nada de nota ou estoque ao receber;
 *  - salvar, conferir o impacto, conciliar e descartar pelas actions de verdade (redirecionam com a frase certa);
 *  - o que cada perfil recebe no HTML: a dona vê a fila, os itens, a chave e o formulário; a gerente da outra loja nem o id (404);
 *    quem só vê não recebe formulário; o operador não abre; o XML nunca vai para o HTML; nenhum campo de senha ou certificado;
 *  - o nível 1 (/rodolfo) faz o mesmo pelo slug do parceiro, e o parceiro B não alcança nada de A.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-documento-fiscal-telas.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown), visao: { tipo: 'rede' } as { tipo: string; lojaId?: string; nome?: string } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/erp/compras/recebidas',
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    recusaDaAcao,
    exigirPermissao,
    pode,
    exigirPermissaoNaPagina: (ctx: { alcance: Alcance }, p: Parameters<typeof pode>[1]) => {
      if (!pode(ctx.alcance, p)) throw new Error('SEM_ACESSO');
    },
    visaoDaRequisicao: async () => ({ visao: atual.visao, lojas: [] }),
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));

import { doParceiro } from '@/lib/erp/tenant';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import ErpNotasRecebidasPage from '@/app/erp/compras/recebidas/page';
import ErpImportarXmlPage from '@/app/erp/compras/recebidas/importar/page';
import ErpNotaRecebidaPage from '@/app/erp/compras/recebidas/[id]/page';
import ParceiroNotasRecebidasPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/recebidas/page';
import ParceiroNotaRecebidaPage from '@/app/rodolfo/(painel)/erp/[slug]/compras/recebidas/[id]/page';
import * as daSessao from '@/app/erp/compras/actions';
import * as doNivel1 from '@/app/rodolfo/(painel)/erp/[slug]/compras/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { CHAVE, montarCenario, xmlDe, type Cenario } from './erp-documento-fiscal-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: string) => t.replace(/\u00a0/g, ' ');

describe.skipIf(!URL_TESTE)('ERP F.1b · actions e telas das notas recebidas por XML (Postgres real)', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let c: Cenario;
  const sufixo = `t${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const dataBr = (iso: string) => iso.split('-').reverse().join('/');

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', lojaIds: string[] | 'rede'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const soVer = () => resolverAlcance({ perfilBase: null, perfilProprio: ['compras.ver', 'insumos.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const como = (alcance: Alcance, autorNome: string, parceiro = c.A, cliente = c.a) =>
    (atual.ctx = () => ({ parceiro, alcance, cliente, bloqueio: null, podeEscrever: true, sessao: { userId: 'u', autorNome } }));
  const comoDona = () => como(alcanceDe('DONO', 'rede'), 'Marina Dona');
  const rodar = async <T,>(fn: () => Promise<T>): Promise<T | { redirect: string }> => {
    try {
      return await fn();
    } catch (e) {
      const url = (e as { url?: string }).url;
      if (url) return { redirect: url };
      throw e;
    }
  };
  const arquivo = (xml: string | Uint8Array, nome = 'nota.xml') => new File([(typeof xml === 'string' ? new TextEncoder().encode(xml) : xml) as BlobPart], nome, { type: 'text/xml' });
  const formDoArquivo = (xml: string | Uint8Array) => {
    const f = new FormData();
    f.set('arquivo', arquivo(xml));
    return f;
  };
  const importar = (xml: string | Uint8Array) => rodar(() => daSessao.acaoImportarXml(null, formDoArquivo(xml)));
  const idDoRedirect = (r: unknown) => (r as { redirect: string }).redirect.split('?')[0].split('/').pop()!;
  const feito = (r: unknown) => new URL((r as { redirect: string }).redirect, 'http://x').searchParams.get('feito');

  /** O HTML de uma página (componente de servidor assíncrono) como a pessoa recebe. */
  const html = async (pagina: (p: never) => Promise<ReactElement> | ReactElement, props: object = {}) => sp(renderToStaticMarkup((await pagina(props as never)) as ReactElement));

  /** O formulário da conferência como o navegador manda, com as escolhas do roteiro. */
  const formDaConferencia = (versao: string, intencao: string, extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set('versao', versao);
    f.set('intencao', intencao);
    f.set('data', dataBr(hoje));
    const itens = [
      { n: 1, insumo: c.ids.mucarela, emb: `v:${c.ids.peca}`, fator: '1' },
      { n: 2, insumo: c.ids.bacon, emb: `v:${c.ids.pacote}`, fator: '10' },
      { n: 3, insumo: c.ids.guardanapo, emb: `v:${c.ids.fardo}`, fator: '1' },
    ];
    for (const i of itens) {
      f.append('item_n', String(i.n));
      f.append('item_insumo', i.insumo);
      f.append('item_embalagem', i.emb);
      f.append('item_fator', i.fator);
    }
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const versaoDe = async (id: string) => (await c.a.documentoFiscal.findUnique({ where: { id } }))!.atualizadoEm.toISOString();

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    c = await montarCenario(db, 'nft', sufixo);
    Object.assign(ids, c.ids);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [c.A.id, c.B.id]);
    await db?.$disconnect();
  });

  it('receber pela action: o arquivo vira UM documento aguardando, a frase diz que nada foi lançado; de novo = "já recebida"', async () => {
    comoDona();
    const r = await importar(xmlDe());
    expect(r).toEqual({ redirect: expect.stringMatching(/^\/erp\/compras\/recebidas\/.+\?feito=recebida$/) });
    ids.doc = idDoRedirect(r);
    expect(await c.a.documentoFiscal.count()).toBe(1);
    expect(await c.a.notaEntrada.count()).toBe(0);
    expect(await c.a.movimentoEstoque.count()).toBe(0);
    const outra = await importar(xmlDe());
    expect(feito(outra)).toBe('ja-recebida');
    expect(idDoRedirect(outra)).toBe(ids.doc);
    expect(await c.a.documentoFiscal.count()).toBe(1);
  });

  it('receber o que não presta: sem arquivo, 1,5 MB (sem nem ler), 1.000.001 bytes, DOCTYPE, zip: erro no campo e nada gravado', async () => {
    comoDona();
    const antes = await c.a.documentoFiscal.count();
    expect(await rodar(() => daSessao.acaoImportarXml(null, new FormData()))).toMatchObject({ ok: false, erros: { arquivo: 'Escolha o arquivo XML da nota.' } });
    expect(await importar(new Uint8Array(1_500_000))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/1\.500 KB e o limite é 1 MB/) } });
    expect(await importar(new Uint8Array(1_000_001))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/limite é 1 MB/) } });
    expect(await importar(xmlDe().replace('<nfeProc', '<!DOCTYPE x [<!ENTITY e "x">]><nfeProc'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/DOCTYPE, ENTITY/) } });
    expect(await importar(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0]))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/compactado/) } });
    expect(await c.a.documentoFiscal.count()).toBe(antes);
  });

  it('o operador não recebe nota (a action recusa com a frase do acesso); o gerente do Centro não recebe a nota da Penha', async () => {
    como(alcanceDe('OPERADOR', [c.ids.vp]), 'Caio');
    expect(await importar(xmlDe([], '4700'))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/lançar nota de compra/) } });
    como(alcanceDe('GERENTE', [c.ids.centro]), 'Gil Centro');
    expect(await importar(xmlDe([], '4701'))).toMatchObject({ ok: false, erros: { arquivo: expect.stringMatching(/não é de nenhuma loja sua/) } });
    expect(await c.a.documentoFiscal.count()).toBe(1);
  });

  it('a fila: a dona vê a nota, "0 de 3 itens ligados", o botão Importar XML e nada do XML; o filtro vazio diz que não há nada', async () => {
    comoDona();
    const h = await html(ErpNotasRecebidasPage, { searchParams: {} });
    expect(h).toContain('Notas recebidas');
    expect(h).toContain('1 aguardando conferência');
    expect(h).toContain('Laticínios Exemplo');
    expect(h).toContain('0 de 3 itens ligados');
    expect(h).toContain('Aguardando conferência');
    expect(h).toContain('Importar XML');
    expect(h).toContain(sp('R$ 580,00'));
    expect(h).not.toContain('nfeProc');
    expect(h).not.toContain('SignatureValue');
    const conciliadas = await html(ErpNotasRecebidasPage, { searchParams: { situacao: 'conciliadas' } });
    expect(conciliadas).toContain('Nenhuma nota com esses filtros.');
    // O gerente do Centro não vê nada da Penha.
    como(alcanceDe('GERENTE', [c.ids.centro]), 'Gil Centro');
    const centro = await html(ErpNotasRecebidasPage, { searchParams: { situacao: 'todas' } });
    expect(centro).not.toContain('Nota 4521');
    expect(centro).not.toContain(`/erp/compras/recebidas/${ids.doc}`);
    expect(centro).toContain('Nenhuma nota recebida ainda.');
    // O operador nem abre a tela.
    como(alcanceDe('OPERADOR', [c.ids.vp]), 'Caio');
    await expect(html(ErpNotasRecebidasPage, { searchParams: {} })).rejects.toThrow('SEM_ACESSO');
  });

  it('importar: a tela explica sem pedir senha, certificado ou acesso à SEFAZ; o operador não abre', async () => {
    comoDona();
    const h = await html(ErpImportarXmlPage);
    expect(h).toContain('Importar XML da nota');
    expect(h).toContain('type="file"');
    expect(h).toContain('Ler a nota');
    expect(h).toContain('não pede senha, certificado nem acesso à SEFAZ');
    expect(h).not.toMatch(/type="password"/);
    expect(h).not.toMatch(/<input[^>]+name="(senha|certificado|token|chaveApi)"/i);
    como(alcanceDe('OPERADOR', [c.ids.vp]), 'Caio');
    await expect(html(ErpImportarXmlPage)).rejects.toThrow('SEM_ACESSO');
  });

  it('conferir: a dona recebe os itens, o fornecedor novo "a completar", a chave, os botões e NENHUM trecho do XML; o Centro recebe 404', async () => {
    comoDona();
    const h = await html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: {} });
    expect(h).toContain('Laticínios Exemplo');
    expect(h).toContain('Nota 4521 · série 1');
    expect(h).toContain('QUEIJO MUSSARELA PECA 2KG');
    expect(h).toContain('código QJ-MUS-2K');
    expect(h).toContain('Cadastro do fornecedor a completar.');
    expect(h).toContain('3326 1011 2223 3300 0181 5500 1000 0045 2111 2345 6784');
    expect(h).toContain('Salvar o que escolhi');
    expect(h).toContain('Conferir o impacto');
    expect(h).toContain('Conciliar e lançar a nota');
    expect(h).toContain('0 de 3');
    expect(h).toContain(sp('confere com a nota'));
    expect(h).toContain('Descartar esta nota fiscal');
    expect(h).not.toContain('nfeProc');
    expect(h).not.toContain('<xml');
    como(alcanceDe('GERENTE', [c.ids.centro]), 'Gil Centro');
    await expect(html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: {} })).rejects.toThrow('NOT_FOUND');
    como(alcanceDe('OPERADOR', [c.ids.vp]), 'Caio');
    await expect(html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: {} })).rejects.toThrow('SEM_ACESSO');
    // Outro parceiro, mesmo id: não existe.
    como(alcanceDe('DONO', 'rede'), 'Bia', c.B, c.b);
    await expect(html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: {} })).rejects.toThrow('NOT_FOUND');
  });

  it('quem só vê a nota (compras.ver) recebe os itens sem formulário e sem botão de conciliar', async () => {
    como(soVer(), 'Luna');
    const h = await html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: {} });
    expect(h).toContain('QUEIJO MUSSARELA PECA 2KG');
    expect(h).toContain('Seu acesso permite ver esta nota, não conferir nem lançar.');
    expect(h).not.toContain('Conciliar e lançar a nota');
    expect(h).not.toContain('Descartar esta nota fiscal');
    // E a action dela também recusa.
    expect(await rodar(async () => daSessao.acaoConferirDocumento(ids.doc, null, formDaConferencia(await versaoDe(ids.doc), 'conciliar')))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/lançar nota de compra/) } });
  });

  it('salvar, conferir o impacto e conciliar pelas actions: frases certas, prévia sem gravar, UMA nota depois', async () => {
    comoDona();
    // Conferir o impacto: estado com a prévia; nada gravado.
    const previa = await rodar(async () => daSessao.acaoConferirDocumento(ids.doc, null, formDaConferencia(await versaoDe(ids.doc), 'conferir')));
    expect(previa).toMatchObject({ ok: false, erros: {}, previa: { totalCentavos: 58000, somaItensCentavos: 55000, freteCentavos: 3000 }, contas: { 1: expect.stringContaining('Muçarela') } });
    expect(await c.a.notaEntrada.count()).toBe(0);
    // Salvar: grava a memória e volta com a frase.
    const salvo = await rodar(async () => daSessao.acaoConferirDocumento(ids.doc, null, formDaConferencia(await versaoDe(ids.doc), 'salvar')));
    expect(salvo).toEqual({ redirect: `/erp/compras/recebidas/${ids.doc}?feito=salva` });
    expect(await c.a.vinculoItemFornecedor.count()).toBe(3);
    const h = await html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: { feito: 'salva' } });
    expect(h).toContain('Escolhas salvas.');
    expect(h).toContain('3 de 3');
    expect(h).toContain('Lembrado deste fornecedor');
    // Versão velha: a segunda aba recebe o conflito.
    const velha = await rodar(() => daSessao.acaoConferirDocumento(ids.doc, null, formDaConferencia(new Date(0).toISOString(), 'conciliar')));
    expect(velha).toMatchObject({ ok: false, conflito: true });
    expect(await c.a.notaEntrada.count()).toBe(0);
    // Conciliar.
    const c1 = await rodar(async () => daSessao.acaoConferirDocumento(ids.doc, null, formDaConferencia(await versaoDe(ids.doc), 'conciliar')));
    expect(c1).toEqual({ redirect: `/erp/compras/recebidas/${ids.doc}?feito=conciliada` });
    expect(await c.a.notaEntrada.count()).toBe(1);
    const nota = (await c.a.notaEntrada.findFirst())!;
    expect(nota).toMatchObject({ origem: 'IMPORTACAO', chaveAcesso: CHAVE, totalCentavos: 58000 });
    ids.nota = nota.id;
    const depois = await html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: { feito: 'conciliada' } });
    expect(depois).toContain('Nota conciliada: a nota de compra foi lançada');
    expect(depois).toContain(`/erp/compras/${nota.id}`);
    expect(depois).toContain('3 PC → 6 kg');
    expect(depois).toContain('2 CX → 20 kg');
    expect(depois).toContain('1 FD → 500 un');
    expect(depois).not.toContain('Conciliar e lançar a nota');
    // A fila esvaziou e a nota está em "conciliadas".
    expect(await html(ErpNotasRecebidasPage, { searchParams: {} })).toContain('Nenhuma nota na fila.');
    expect(await html(ErpNotasRecebidasPage, { searchParams: { situacao: 'conciliadas' } })).toContain('Conciliada');
  });

  it('a nota de compra que veio do XML diz isso, leva à nota fiscal e não tem "Editar nota"; a edição direta volta ao detalhe', async () => {
    comoDona();
    const { default: ErpNotaPage } = await import('@/app/erp/compras/[id]/page');
    const { default: ErpEditarNotaPage } = await import('@/app/erp/compras/[id]/editar/page');
    const h = await html(ErpNotaPage as never, { params: { id: ids.nota }, searchParams: {} });
    expect(h).toContain('Esta nota veio da nota fiscal (XML).');
    expect(h).toContain(`/erp/compras/recebidas/${ids.doc}`);
    expect(h).not.toContain('Editar nota');
    expect(h).toContain('Cancelar esta nota');
    await expect(html(ErpEditarNotaPage as never, { params: { id: ids.nota } })).rejects.toMatchObject({ url: `/erp/compras/${ids.nota}` });
  });

  it('descartar pela action (conciliado): cancela a nota e marca o documento; o texto do motivo é obrigatório', async () => {
    comoDona();
    const sem = new FormData();
    sem.set('versao', await versaoDe(ids.doc));
    sem.set('motivo', 'x');
    expect(await rodar(() => daSessao.acaoCancelarDocumento(ids.doc, null, sem))).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    const ok = new FormData();
    ok.set('versao', await versaoDe(ids.doc));
    ok.set('motivo', 'devolvida ao fornecedor');
    expect(await rodar(() => daSessao.acaoCancelarDocumento(ids.doc, null, ok))).toEqual({ redirect: `/erp/compras/recebidas/${ids.doc}?feito=cancelada` });
    expect((await c.a.notaEntrada.findUnique({ where: { id: ids.nota } }))!.status).toBe('CANCELADA');
    const h = await html(ErpNotaRecebidaPage, { params: { id: ids.doc }, searchParams: { feito: 'cancelada' } });
    expect(h).toContain('Nota fiscal descartada.');
    expect(h).toContain('devolvida ao fornecedor');
  });

  it('o nível 1 (/rodolfo) faz o mesmo pelo slug do parceiro: receber, conferir, conciliar; a tela diz de quem é o parceiro', async () => {
    como(alcanceDe('DONO', 'rede'), 'Rodolfo');
    const f = formDoArquivo(xmlDe([], '4800'));
    const r = await rodar(() => doNivel1.acaoImportarXml(c.A.slug, null, f));
    expect(r).toEqual({ redirect: expect.stringMatching(new RegExp(`^/rodolfo/erp/${c.A.slug}/compras/recebidas/.+\\?feito=recebida$`)) });
    const id = idDoRedirect(r);
    const lista = await html(ParceiroNotasRecebidasPage, { params: { slug: c.A.slug }, searchParams: {} });
    expect(lista).toContain(c.A.nome);
    expect(lista).toContain('Nota 4800');
    const tela = await html(ParceiroNotaRecebidaPage, { params: { slug: c.A.slug, id }, searchParams: {} });
    expect(tela).toContain('QUEIJO MUSSARELA PECA 2KG');
    expect(tela).toContain('Conciliar e lançar a nota');
    expect(tela).toContain(`/rodolfo/erp/${c.A.slug}/compras/fornecedores`);
    const conciliou = await rodar(() => doNivel1.acaoConferirDocumento(c.A.slug, id, null, formDaConferencia(null as never, 'conciliar')));
    expect(conciliou).toMatchObject({ ok: false, conflito: true }); // sem a versão lida, nada é lançado
    const v = await versaoDe(id);
    expect(await rodar(() => doNivel1.acaoConferirDocumento(c.A.slug, id, null, formDaConferencia(v, 'conciliar')))).toEqual({ redirect: `/rodolfo/erp/${c.A.slug}/compras/recebidas/${id}?feito=conciliada` });
    expect(await c.a.notaEntrada.count({ where: { chaveAcesso: { not: null }, status: 'LANCADA' } })).toBe(1);
    // O parceiro B pelo nível 1 não alcança o documento de A.
    como(alcanceDe('DONO', 'rede'), 'Rodolfo', c.B, c.b);
    await expect(html(ParceiroNotaRecebidaPage, { params: { slug: c.B.slug, id }, searchParams: {} })).rejects.toThrow('NOT_FOUND');
  });

  it('contatos e credenciais: nada em receber a nota pede ou grava senha, certificado, chave ou token (guarda estática dos arquivos novos)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const arquivos = [
      ['src', 'lib', 'erp', 'nfe-xml.ts'],
      ['src', 'lib', 'erp', 'documentos-fiscais.ts'],
      ['src', 'lib', 'erp', 'documento-fiscal-campos.ts'],
      ['src', 'components', 'erp', 'telas', 'compras', 'form-importar.tsx'],
      ['src', 'components', 'erp', 'telas', 'compras', 'form-conferencia.tsx'],
      ['src', 'components', 'erp', 'telas', 'compras', 'documentos-executar.ts'],
    ];
    for (const a of arquivos) {
      const t = readFileSync(join(process.cwd(), ...a), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(t, a.join('/')).not.toMatch(/\bfetch\(|XMLHttpRequest|node:https?|node:net|node:child_process|\bcertificado\b.*=|password|senha.*name=|nuvemfiscal|distdfe|sefaz\.[a-z]+\.gov|evolution|wa\.me|mailto:/i);
    }
    expect(doParceiro).toBeDefined();
  });
});
