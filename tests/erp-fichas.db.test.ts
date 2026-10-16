/**
 * ERP 1.2 · Ficha técnica no Postgres de verdade: criar com foto e insumo sem
 * preço (custo incompleto); isolamento entre parceiros em ficha, item e foto
 * (ficha de B com insumo de A recusada pela regra E pelo banco; foto de A não
 * sai pela rota de B); operador sem "criar e editar fichas" recusado chamando a
 * action de verdade; foto com tipo/tamanho inválido recusada sem gravar nada;
 * edição concorrente recusada; trocar foto apaga a antiga; importação por
 * planilha com prévia (nada gravado), erro por linha e reimportação que não
 * duplica.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-fichas.db.test.ts
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  return {
    exigirParceiroDaSessao: async () => atual.ctx!(),
    exigirParceiro: async () => atual.ctx!(),
    parceiroDaSessaoOuNada: async () => (atual.ctx ? atual.ctx() : null),
    recusaDaAcao,
    exigirPermissao,
    pode,
  };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarFicha, editarFicha, MENSAGEM_CONFLITO_FICHA, MENSAGEM_FOTO_SUMIU, mudarSituacaoFicha, obterFicha } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { responderFoto } from '@/lib/erp/foto-resposta';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { centavosDaFracao } from '@/lib/erp/unidades';
import * as daSessao from '@/app/erp/fichas/actions';
import { GET as fotoDaSessao } from '@/app/erp/fichas/[id]/foto/route';
import { POST as envioDaSessao } from '@/app/erp/fichas/fotos/route';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { JPG_LIMPO, jpgComGps, PNG_LIMPO, temGps } from './erp-fotos-teste';

const URL_TESTE = process.env.ERP_DB_TESTE;
const JPG = JPG_LIMPO;
const PNG = PNG_LIMPO;

describe.skipIf(!URL_TESTE)('ERP 1.2 · ficha técnica (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let pasta: string;
  const sufixo = `f${Date.now().toString(36)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let B: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  const vinculo = (perfilBase: 'DONO' | 'OPERADOR') =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const ctxDe = (parceiro: typeof A, perfilBase: 'DONO' | 'OPERADOR', bloqueio: string | null = null) => ({
    parceiro,
    alcance: vinculo(perfilBase),
    cliente: doParceiro(parceiro.id, db, { somenteLeitura: bloqueio !== null }),
    bloqueio,
    podeEscrever: bloqueio === null,
    sessao: { userId: 'u', autorNome: perfilBase === 'DONO' ? 'Marina Dona' : 'Paulo Operador' },
  });
  async function rodar<T>(p: Promise<T>): Promise<{ destino: string } | T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('REDIRECT ')) return { destino: (e as Error & { url: string }).url };
      throw e;
    }
  }
  /** POST na rota de envio da foto (/erp/fichas/fotos), com o corpo vigiado: diz se alguém o leu. */
  function pedidoDeFoto(bytes: Uint8Array, cabecalhos: Record<string, string> = {}) {
    const vigia = { lido: false };
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        vigia.lido = true;
        c.enqueue(bytes);
        c.close();
      },
    }, { highWaterMark: 0 }); // só puxa quando alguém LÊ
    const req = new Request('http://localhost:3100/erp/fichas/fotos', {
      method: 'POST',
      body: corpo,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length), host: 'localhost:3100', ...cabecalhos },
      duplex: 'half',
    } as RequestInit);
    return { req, vigia };
  }
  const enviarFoto = (bytes: Uint8Array) => envioDaSessao(pedidoDeFoto(bytes).req);
  const fotosDe = (parceiroId: string) => {
    const p = join(pasta, parceiroId, 'fichas');
    return existsSync(p) ? readdirSync(p) : [];
  };
  const xburger = (extra: Record<string, unknown> = {}) => ({
    nome: 'X-Burger',
    tipo: 'PRATO',
    rendimento: '1',
    descricao: 'Pão brioche, blend 180 g e picles',
    modoPreparo: 'Selar o blend.\nMontar.',
    itens: [
      { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
      { insumoId: ids.blend, quantidade: '180', unidade: 'g' },
      { insumoId: ids.picles, quantidade: '20', unidade: 'g' },
    ],
    ...extra,
  });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    pasta = mkdtempSync(join(tmpdir(), 'erp-fotos-'));
    process.env.ERP_ARQUIVOS_DIR = pasta;
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Fic A', slug: `fic-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Fic B', slug: `fic-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      blend: { nome: 'Blend bovino', unidade: 'KG', conteudo: '5', preco: '89,90', frete: '5,00' },
      picles: { nome: 'Picles', unidade: 'KG', conteudo: '2', semPreco: 'on' },
      oleo: { nome: 'Óleo de soja', unidade: 'L', conteudo: '900', escala: 'menor', preco: '8,49' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', conservacao: 'SECO', escala: 'base', ...campos });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const rb = await cadastrarInsumo(b, { nome: 'Pão de B', tipo: 'INGREDIENTE', unidade: 'UN', conservacao: 'SECO', conteudo: '10', escala: 'base', preco: '10,00' });
    if (!rb.ok) throw new Error('insumo de B');
    ids.paoB = rb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  it('cria com foto e 3 insumos (um sem preço): custo incompleto, por porção, histórico e foto na pasta de A', async () => {
    // Foto de celular, com GPS no EXIF: vai para o disco SEM ele.
    const r = await cadastrarFicha(a, xburger(), { tipo: 'trocar', bytes: jpgComGps(JPG, 1) }, 'Marina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.xburger = r.id;
    const gravada = readFileSync(join(pasta, A.id, 'fichas', fotosDe(A.id)[0]));
    expect(temGps(gravada)).toBe(false);
    expect(gravada.equals(Buffer.from(JPG))).toBe(true);
    const f = (await obterFicha(a, r.id))!;
    expect(f.itens.map((i) => [i.nome, i.quantidadeMilesimos])).toEqual([
      ['Pão brioche', 1000],
      ['Blend bovino', 180],
      ['Picles', 20],
    ]);
    expect(f.custo.semPreco).toEqual(['Picles']);
    // pão 150 c + 180 g de (94,90 / 5 kg) = 341,64 c → 491,64 c, arredondado só aqui
    expect(centavosDaFracao(f.custo.total)).toBe(492n);
    expect(f.itens[2].custo).toBeNull();
    expect(f.foto).toMatch(/^[0-9a-f]{12}$/);
    expect(fotosDe(A.id)).toHaveLength(1);
    const [h] = await listarHistorico(a, { entidade: 'FichaTecnica' });
    expect(h.acao).toBe('CRIOU');
    expect(h.mudancas.find((m) => m.campo === 'insumos')?.depois).toBe('Pão brioche 1 un · Blend bovino 180 g · Picles 20 g');
  });

  it('isolamento: ficha de B com insumo de A é recusada pela regra E pelo banco (FK composta)', async () => {
    const r = await cadastrarFicha(b, { ...xburger(), itens: [{ insumoId: ids.blend, quantidade: '100', unidade: 'g' }] });
    expect(r).toMatchObject({ ok: false, erros: { 'item-0': 'Insumo não encontrado neste cadastro.' } });
    expect(await b.fichaTecnica.count()).toBe(0);
    // Mesmo pulando a regra: o banco recusa o item de B apontando para insumo de A.
    const fb = await b.fichaTecnica.create({ data: { parceiroId: B.id, nome: 'Furo', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' } });
    await expect(b.fichaItem.create({ data: { parceiroId: B.id, fichaId: fb.id, insumoId: ids.blend, quantidadeMilesimos: 100 } })).rejects.toThrow();
    // E B não lê nem a ficha nem os itens de A.
    expect(await obterFicha(b, ids.xburger)).toBeNull();
    expect(await b.fichaItem.count({ where: { fichaId: ids.xburger } })).toBe(0);
    await b.fichaTecnica.delete({ where: { id: fb.id } });
  });

  it('foto: servida para A; ficha de A pela sessão de B é 404; sem "ver fichas" é 403', async () => {
    const okA = await responderFoto(a, ids.xburger, true);
    expect(okA.status).toBe(200);
    expect(okA.headers.get('content-type')).toBe('image/jpeg');
    expect(okA.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await okA.arrayBuffer())).toEqual(JPG);
    // A rota de verdade, com a sessão de B: o id de A não é achado pelo portão de B.
    atual.ctx = () => ctxDe(B, 'DONO');
    const deB = await fotoDaSessao(new Request('http://x'), { params: { id: ids.xburger } });
    expect(deB.status).toBe(404);
    atual.ctx = () => ({ ...ctxDe(A, 'DONO'), alcance: resolverAlcance({ perfilBase: null, perfilProprio: ['insumos.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }) });
    expect((await fotoDaSessao(new Request('http://x'), { params: { id: ids.xburger } })).status).toBe(403);
    atual.ctx = () => ctxDe(A, 'OPERADOR');
    expect((await fotoDaSessao(new Request('http://x'), { params: { id: ids.xburger } })).status).toBe(200);
  });

  it('foto com tipo ou tamanho inválido é recusada: nada gravado, nada no disco', async () => {
    const antes = fotosDe(A.id).length;
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const r = await cadastrarFicha(a, xburger({ nome: 'Com SVG' }), { tipo: 'trocar', bytes: svg });
    expect(r).toEqual({ ok: false, erros: { foto: 'Use uma foto em JPG, PNG ou WebP.' } });
    const grande = new Uint8Array(8 * 1024 * 1024 + 1);
    grande.set(JPG);
    const r2 = await cadastrarFicha(a, xburger({ nome: 'Foto enorme' }), { tipo: 'trocar', bytes: grande });
    expect(r2.ok).toBe(false);
    // Pela rota de envio (arquivo de verdade): GIF recusado, nada no disco.
    atual.ctx = () => ctxDe(A, 'DONO');
    const gif = await enviarFoto(new TextEncoder().encode('GIF89a......'));
    expect(gif.status).toBe(422);
    expect(await gif.json()).toEqual({ erro: 'Use uma foto em JPG, PNG ou WebP.' });
    // E a action não aceita mais arquivo no formulário: só o nome da foto já enviada.
    const form = new FormData();
    form.set('nome', 'Pela action');
    form.set('tipo', 'PRATO');
    form.append('item_insumo', ids.pao);
    form.append('item_quantidade', '1');
    form.append('item_unidade', 'un');
    form.set('fotoNova', '../../../etc/passwd');
    const e = await rodar(daSessao.acaoCadastrarFicha(null, form));
    expect(e).toMatchObject({ ok: false, erros: { foto: 'Escolha a foto de novo.' } });
    expect(await a.fichaTecnica.count({ where: { nome: { in: ['Com SVG', 'Foto enorme', 'Pela action'] } } })).toBe(0);
    expect(fotosDe(A.id).length).toBe(antes);
  });

  it('operador (só vê fichas) chamando a action é recusado; nada gravado', async () => {
    atual.ctx = () => ctxDe(A, 'OPERADOR');
    const form = new FormData();
    form.set('nome', 'Do operador');
    form.set('tipo', 'PRATO');
    form.append('item_insumo', ids.pao);
    form.append('item_quantidade', '1');
    form.append('item_unidade', 'un');
    const r = await rodar(daSessao.acaoCadastrarFicha(null, form));
    expect(r).toMatchObject({ ok: false });
    expect((r as unknown as { erros: { geral: string } }).erros.geral).toMatch(/fichas técnicas/i);
    const sit = await rodar(daSessao.acaoSituacaoFicha(ids.xburger, null, new FormData()));
    expect(sit).toMatchObject({ ok: false });
    const imp = await daSessao.acaoPreviaDaPlanilha(null, new FormData());
    expect(imp?.erro).toBeTruthy();
    expect(await a.fichaTecnica.count({ where: { nome: 'Do operador' } })).toBe(0);
    expect((await obterFicha(a, ids.xburger))!.ativa).toBe(true);
  });

  it('envio da foto (rota própria): sem sessão, operador, suspenso e acima de 8 MB recusados SEM ler o corpo', async () => {
    const corpo = jpgComGps(JPG);
    atual.ctx = null;
    const sem = pedidoDeFoto(corpo);
    const r0 = await envioDaSessao(sem.req);
    expect(r0.status).toBe(401);
    expect(sem.vigia.lido).toBe(false);
    for (const [ctx, status] of [
      [() => ctxDe(A, 'OPERADOR'), 403],
      [() => ctxDe(A, 'DONO', 'Parceiro suspenso: insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar.'), 403],
    ] as const) {
      atual.ctx = ctx;
      const p = pedidoDeFoto(corpo);
      expect((await envioDaSessao(p.req)).status).toBe(status);
      expect(p.vigia.lido).toBe(false);
    }
    atual.ctx = () => ctxDe(A, 'DONO');
    const grande = pedidoDeFoto(corpo, { 'content-length': String(8 * 1024 * 1024 + 1) });
    expect((await envioDaSessao(grande.req)).status).toBe(413);
    expect(grande.vigia.lido).toBe(false);
    const deFora = pedidoDeFoto(corpo, { origin: 'https://outro-site.example' });
    expect((await envioDaSessao(deFora.req)).status).toBe(403);
    expect(deFora.vigia.lido).toBe(false);
    // Tamanho declarado mentindo (pequeno) e corpo grande: a leitura corta no teto.
    const mentira = new Uint8Array(8 * 1024 * 1024 + 10);
    mentira.set(JPG);
    expect((await envioDaSessao(pedidoDeFoto(mentira, { 'content-length': '100' }).req)).status).toBe(413);
  });

  it('envio da foto: a dona envia foto de celular (com GPS), salva a ficha com o nome, e o disco fica sem GPS', async () => {
    atual.ctx = () => ctxDe(A, 'DONO');
    const p = pedidoDeFoto(jpgComGps(JPG, 6));
    const r = await envioDaSessao(p.req);
    expect(r.status).toBe(201);
    expect(p.vigia.lido).toBe(true); // o vigia funciona: com sessão e permissão, o corpo é lido
    const { arquivo } = (await r.json()) as { arquivo: string };
    expect(arquivo).toMatch(/^[0-9a-f]{32}\.jpg$/);
    const pendente = readFileSync(join(pasta, A.id, 'fichas', 'pendentes', arquivo));
    expect(temGps(pendente)).toBe(false);
    // B não consegue usar a pendente de A (o caminho é do parceiro DA SESSÃO).
    expect(await cadastrarFicha(b, { nome: 'Roubo', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ids.paoB, quantidade: '1', unidade: 'un' }] }, { tipo: 'enviada', arquivo })).toEqual({
      ok: false,
      erros: { foto: MENSAGEM_FOTO_SUMIU },
    });
    // Erro no formulário: a foto volta a ser pendente e o segundo envio do formulário a usa.
    const form = new FormData();
    form.set('nome', '');
    form.set('tipo', 'PRATO');
    form.append('item_insumo', ids.pao);
    form.append('item_quantidade', '1');
    form.append('item_unidade', 'un');
    form.set('fotoNova', arquivo);
    expect(await rodar(daSessao.acaoCadastrarFicha(null, form))).toMatchObject({ ok: false, erros: { nome: expect.any(String) } });
    expect(existsSync(join(pasta, A.id, 'fichas', 'pendentes', arquivo))).toBe(true);
    form.set('nome', 'Com foto enviada');
    expect(await rodar(daSessao.acaoCadastrarFicha(null, form))).toMatchObject({ destino: expect.stringMatching(/feito=criada$/) });
    expect(existsSync(join(pasta, A.id, 'fichas', 'pendentes', arquivo))).toBe(false);
    const gravada = readFileSync(join(pasta, A.id, 'fichas', arquivo));
    expect(temGps(gravada)).toBe(false);
    const f = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Com foto enviada' } });
    expect(f.fotoArquivo).toBe(arquivo);
    expect(f.fotoBytes).toBe(gravada.length);
  });

  it('dona pela action: cria e cai no detalhe; parceiro suspenso não grava', async () => {
    atual.ctx = () => ctxDe(A, 'DONO');
    const form = new FormData();
    form.set('nome', 'Fritas');
    form.set('tipo', 'PRATO');
    form.set('rendimento', '2');
    form.append('item_insumo', ids.oleo);
    form.append('item_quantidade', '50');
    form.append('item_unidade', 'ml');
    // Linha deixada em branco no formulário não vira item nem erro.
    form.append('item_insumo', '');
    form.append('item_quantidade', '');
    form.append('item_unidade', 'g');
    const r = await rodar(daSessao.acaoCadastrarFicha(null, form));
    expect(r).toMatchObject({ destino: expect.stringMatching(/^\/erp\/fichas\/.+\?feito=criada$/) });
    atual.ctx = () => ctxDe(A, 'DONO', 'Parceiro suspenso.');
    form.set('nome', 'Suspensa');
    expect(await rodar(daSessao.acaoCadastrarFicha(null, form))).toMatchObject({ ok: false, erros: { geral: 'Parceiro suspenso.' } });
  });

  it('editar: só o que mudou; duas abas, a segunda é recusada; trocar a foto apaga a antiga', async () => {
    const lida = (await obterFicha(a, ids.xburger))!;
    const fotoAntiga = fotosDe(A.id).find((n) => n.startsWith(lida.foto!))!;
    const r = await editarFicha(a, ids.xburger, { ...xburger({ rendimento: '2' }), versao: lida.versao }, { tipo: 'trocar', bytes: PNG }, 'Marina');
    expect(r).toMatchObject({ ok: true, mudou: ['rendimento', 'foto'] });
    expect(fotosDe(A.id)).not.toContain(fotoAntiga);
    const [h] = await listarHistorico(a, { entidade: 'FichaTecnica' });
    expect(h.mudancas.map((m) => [m.campo, m.antes, m.depois])).toEqual([
      ['rende', '1 porção', '2 porções'],
      ['foto', 'foto anterior', 'foto nova'],
    ]);
    // Segunda aba, com a versão velha: recusada, nada sobrescrito.
    const segunda = await editarFicha(a, ids.xburger, { ...xburger({ rendimento: '9' }), versao: lida.versao });
    expect(segunda).toEqual({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FICHA }, conflito: true });
    expect((await obterFicha(a, ids.xburger))!.rendimentoMilesimos).toBe(2000);
    // Tirar a foto: o arquivo some do disco.
    const v2 = (await obterFicha(a, ids.xburger))!.versao;
    expect(await editarFicha(a, ids.xburger, { ...xburger({ rendimento: '2' }), versao: v2 }, { tipo: 'remover' })).toMatchObject({ ok: true, mudou: ['foto'] });
    expect((await obterFicha(a, ids.xburger))!.foto).toBeNull();
  });

  it('desativar/reativar com histórico; desativada não edita', async () => {
    expect(await mudarSituacaoFicha(a, ids.xburger, false, 'saiu do cardápio')).toMatchObject({ ok: true });
    const v = (await obterFicha(a, ids.xburger))!.versao;
    expect(await editarFicha(a, ids.xburger, { ...xburger(), versao: v })).toMatchObject({ ok: false, erros: { geral: /desativada/ } });
    expect(await mudarSituacaoFicha(a, ids.xburger, true, null)).toMatchObject({ ok: true });
  });

  const PLANILHA = [
    'ficha;tipo;rende;unidade_rende;descricao;modo_de_preparo;insumo;quantidade;unidade',
    'Smash duplo;prato;1;;Dois smash;Prensar;Pão brioche;1;un',
    'Smash duplo;;;;;;blend bovino;200;g',
    'Molho;pré-preparo;1;kg;Base;Bater;Óleo de soja;300;ml',
    'Batata;prato;2;;;;Óleo de soja;100;ml',
    'Picles na brasa;prato;1;;;;Picles;50;g',
    'Combo;prato;1;;;;Pão brioche;1;un',
    'Combo;;;;;;Cebola roxa;30;g',
  ].join('\n');

  it('importar: prévia não grava; linha ruim só tira a ficha dela; reimportar não duplica', async () => {
    const antes = await a.fichaTecnica.count();
    const p = await previaDaImportacao(a, PLANILHA);
    expect(await a.fichaTecnica.count()).toBe(antes);
    expect(p.contagem).toEqual({ nova: 4, muda: 0, igual: 0, erro: 1 });
    const combo = p.fichas.find((f) => f.nome === 'Combo')!;
    expect(combo.erros).toEqual([{ linha: 8, mensagem: 'Insumo “Cebola roxa” não está cadastrado.' }]);
    expect(combo.faltam).toEqual(['Cebola roxa']);
    expect(p.fichas.find((f) => f.nome === 'Picles na brasa')).toMatchObject({ situacao: 'nova', incompleto: true });

    const r = await importarFichas(a, PLANILHA, 'Marina');
    expect(r).toEqual({ ok: true, criadas: 4, alteradas: 0, iguais: 0, comErro: 1 });
    expect(await a.fichaTecnica.count()).toBe(antes + 4);
    const smash = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Smash duplo' }, include: { itens: true } });
    expect(smash.origem).toBe('IMPORTACAO');
    expect(smash.itens.map((i) => i.quantidadeMilesimos).sort((x, y) => x - y)).toEqual([200, 1000]);
    const [h] = await listarHistorico(a, { entidade: 'FichaTecnica' });
    expect(h.motivo).toBe('Importada por planilha');

    // Reimportar a MESMA planilha: nada novo, nada alterado, nada duplicado.
    const historicoAntes = await a.historicoAlteracao.count();
    expect((await previaDaImportacao(a, PLANILHA)).contagem).toEqual({ nova: 0, muda: 0, igual: 4, erro: 1 });
    expect(await importarFichas(a, PLANILHA)).toEqual({ ok: false, erro: 'Nenhuma ficha da planilha pode entrar: corrija os erros e envie de novo.' });
    expect(await a.fichaTecnica.count()).toBe(antes + 4);
    expect(await a.historicoAlteracao.count()).toBe(historicoAntes);

    // Mudou uma quantidade: só aquela ficha muda; descrição vazia não apaga a que existe.
    const nova = PLANILHA.replace('blend bovino;200;g', 'blend bovino;220;g').replace('Dois smash', '');
    const p2 = await previaDaImportacao(a, nova);
    expect(p2.fichas.find((f) => f.nome === 'Smash duplo')).toMatchObject({ situacao: 'muda', mudancas: ['insumos e quantidades'] });
    expect(await importarFichas(a, nova)).toEqual({ ok: true, criadas: 0, alteradas: 1, iguais: 3, comErro: 1 });
    const smash2 = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Smash duplo' } });
    expect(smash2.descricao).toBe('Dois smash');
  });

  it('importar em B com nome de insumo que só existe em A: não encontrado (isolamento)', async () => {
    const p = await previaDaImportacao(b, 'ficha;insumo;quantidade;unidade\nXis;Pão brioche;1;un\nYakisoba;Pão de B;1;un');
    expect(p.fichas.map((f) => [f.nome, f.situacao])).toEqual([
      ['Xis', 'erro'],
      ['Yakisoba', 'nova'],
    ]);
    expect(await importarFichas(b, 'ficha;insumo;quantidade;unidade\nYakisoba;Pão de B;1;un')).toMatchObject({ ok: true, criadas: 1 });
    expect(await a.fichaTecnica.count({ where: { nome: 'Yakisoba' } })).toBe(0);
  });
});
