import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cadastrarFicha, cadastrarFichaUnificada, editarFichaUnificada, mudarSituacaoFicha } from '@/lib/erp/fichas';
import type { EntradaFichaUnificada, ResultadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';
import { salvarFoto, caminhoDaFoto } from '@/lib/erp/arquivos';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { mudarFotosDaFicha } from '@/lib/erp/ficha-fotos';
import { PNG_LIMPO } from './erp-fotos-teste';
import { catalogo3c, observarTransacao3c, receita3c, retrato3c, type Catalogo3c } from './erp-ficha-3c-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const pedido = (c: Catalogo3c): EntradaFichaUnificada => ({ ...receita3c(c), chaveEnvio: crypto.randomUUID(), materiais: { versao: '', linhas: [{ canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '1', unidade: 'un' }] } });
const nova = (r: ResultadoFichaUnificada) => { if (!r.ok || r.repetido) throw new Error(JSON.stringify(r)); return r; };
const confirmarReplay = (r: ResultadoFichaUnificada, id: string) => expect(r).toEqual({ ok: true, id, mudou: [], repetido: true });

describe.skipIf(!URL_TESTE)('3C · reenvio durável, resposta perdida e ciclo real da foto', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, pasta: string;
  const parceiros: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório.');
    pasta = await mkdtemp(join(tmpdir(), 'ff-ficha-envio-')); vi.stubEnv('ERP_ARQUIVOS_DIR', pasta);
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
  });
  afterAll(async () => {
    try { if (db) await limparParceiros(db, perfil, parceiros); } finally { await db?.$disconnect(); vi.unstubAllEnvs(); }
    const absoluta = resolve(pasta);
    if (!absoluta.startsWith(resolve(tmpdir()) + sep) || !basename(absoluta).startsWith('ff-ficha-envio-')) throw new Error('Pasta temporária fora do limite.');
    await rm(absoluta, { recursive: true, force: true });
  }, 120_000);
  const criar = (c: Catalogo3c, e: EntradaFichaUnificada, pessoa = 'pessoa-a') => cadastrarFichaUnificada(c.a, e, { tipo: 'manter' }, 'Nome sintético', pessoa);

  it('dois pedidos concorrentes iguais confirmam uma única criação e um único histórico', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c);
    let liberar!: () => void, pronto!: () => void, falhou!: (e: unknown) => void, pid = 0;
    const liberarPrimeira = new Promise<void>(r => { liberar = r; });
    const primeiraTravou = new Promise<void>((r, rejeitar) => { pronto = r; falhou = rejeitar; });
    const observado = observarTransacao3c(c.a, tx => ({ ...tx, sql: new Proxy(tx.sql, { apply: async (alvo, contexto, args) => {
      const resposta = await Reflect.apply(alvo, contexto, args);
      if (!pid && (args[0] as readonly string[]).join('').includes('pg_advisory_xact_lock')) {
        pid = (await tx.sql<{ pid: number }>`SELECT pg_backend_pid()::int AS pid`)[0].pid; pronto(); await liberarPrimeira;
      }
      return resposta;
    } }) }));
    const primeiraPendente = cadastrarFichaUnificada(observado, e, { tipo: 'manter' }, 'Nome sintético', 'pessoa-a');
    void primeiraPendente.catch(falhou); await primeiraTravou;
    const segundaPendente = criar(c, e); let bloqueou = false;
    try {
      const limite = Date.now() + 2000;
      do {
        const [r] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity a WHERE ${pid} = ANY(pg_blocking_pids(a.pid))`;
        bloqueou = r.n > 0; if (!bloqueou) await new Promise(r => setTimeout(r, 15));
      } while (!bloqueou && Date.now() < limite);
    } finally { liberar(); }
    const resultados = await Promise.all([primeiraPendente, segundaPendente]);
    expect(bloqueou, 'Postgres observou a segunda conexão aguardando a trava da primeira').toBe(true);
    expect(resultados.every(r => r.ok)).toBe(true);
    const primeira = nova(resultados.find(r => r.ok && !r.repetido)!);
    confirmarReplay(resultados.find(r => r.ok && r.repetido)!, primeira.id);
    const salvo = await retrato3c(c.a); expect(salvo.fichas).toHaveLength(1); expect(salvo.produtos).toHaveLength(1); expect(salvo.materiais).toHaveLength(1);
    expect(salvo.historico.filter(h => h.entidade === 'FichaTecnica' && h.acao === 'CRIOU')).toHaveLength(1);
    expect(salvo.fichas[0].chaveEnvio).toMatch(/^[0-9a-f]{40}$/); expect(salvo.fichas[0].chaveEnvio).not.toBe(e.chaveEnvio);
    expect(salvo.fichas[0].hashEnvio).toMatch(/^[0-9a-f]{64}$/);
    confirmarReplay(await criar(c, e), primeira.id); expect(await retrato3c(c.a)).toEqual(salvo);
  });

  it('mesma chave e pessoa com outro conteúdo recusa sem alterações; identidade inclui pessoa e tenant', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c); nova(await criar(c, e));
    const antes = await retrato3c(c.a);
    expect(await criar(c, { ...e, rendimento: '20' })).toMatchObject({ ok: false, conflito: true });
    expect(await retrato3c(c.a)).toEqual(antes);
    const segunda = nova(await criar(c, { ...e, nome: 'Prato de outra pessoa' }, 'pessoa-b'));
    expect(segunda.id).not.toBe(antes.fichas[0].id);
    const outro = await catalogo3c(db, parceiros), terceiro = nova(await criar(outro, { ...pedido(outro), chaveEnvio: e.chaveEnvio }));
    expect(terceiro.id).not.toBe(segunda.id); expect((await retrato3c(outro.a)).fichas).toHaveLength(1);
  });

  it('resposta de criação descartada após commit pode ser repetida sem duplicação ou nova validação do catálogo', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c);
    // A fronteira de transporte descarta a confirmação; o domínio já terminou seu commit real.
    await criar(c, e).then(r => { nova(r); throw new Error('Resposta perdida após commit'); }).catch(e => expect(e.message).toBe('Resposta perdida após commit'));
    await c.a.insumo.update({ where: { id: c.ids.sacola }, data: { ativo: false } });
    await c.a.insumo.update({ where: { id: c.ids.ingrediente }, data: { precoEmbalagemCentavos: 99000 } });
    const antes = await retrato3c(c.a);
    confirmarReplay(await criar(c, e), antes.fichas[0].id); expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('replay após edição e arquivamento devolve apenas a identidade original, sem afirmar estado ativo ou restaurar receita', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c), r = nova(await criar(c, e));
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c, { nome: 'Nome posterior', descricao: 'Conteúdo posterior' }), versao: r.versao }, { tipo: 'manter' }, 'Outra pessoa')).toMatchObject({ ok: true });
    expect(await mudarSituacaoFicha(c.a, r.id, false, 'Pausa sintética')).toMatchObject({ ok: true });
    const antes = await retrato3c(c.a); confirmarReplay(await criar(c, e), r.id); expect(await retrato3c(c.a)).toEqual(antes);
    expect(antes.fichas[0]).toMatchObject({ nome: 'Nome posterior', ativa: false });
  });

  it('chave sem confirmação não fica reservada quando a validação falha', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c), antes = await retrato3c(c.a);
    expect(await criar(c, { ...e, materiais: { versao: '', linhas: [{ canal: 'IFOOD', insumoId: c.ids.material, quantidade: '1', unidade: 'un' }] } })).toMatchObject({ ok: false });
    expect(await retrato3c(c.a)).toEqual(antes); expect(nova(await criar(c, e)).repetido).toBe(false);
  });

  it('foto pendente assumida no primeiro commit não é assumida outra vez no replay', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const enviar = () => cadastrarFichaUnificada(c.a, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética', 'pessoa-a');
    const r = nova(await enviar());
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).rejects.toMatchObject({ code: 'ENOENT' });
    const definitivo = caminhoDaFoto(c.parceiro.id, arquivo, pasta), antes = await retrato3c(c.a), atributos = await stat(definitivo);
    confirmarReplay(await enviar(), r.id);
    expect(await retrato3c(c.a)).toEqual(antes); expect(await readFile(definitivo)).toEqual(Buffer.from(PNG_LIMPO));
    expect((await stat(definitivo)).mtimeMs).toBe(atributos.mtimeMs);
    expect((await readdir(join(pasta, c.parceiro.id, 'fichas'))).filter(n => n.endsWith('.png'))).toEqual([arquivo]);
  });

  it('material inválido com foto pendente não consome arquivo nem confirma a chave', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true), antes = await retrato3c(c.a);
    const ruim = { ...e, materiais: { versao: '', linhas: [{ canal: 'IFOOD', insumoId: c.ids.material, quantidade: '1', unidade: 'un' }] } };
    expect(await cadastrarFichaUnificada(c.a, ruim, { tipo: 'enviada', arquivo }, 'Pessoa sintética', 'pessoa-a')).toMatchObject({ ok: false });
    expect(await retrato3c(c.a)).toEqual(antes);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).toEqual(Buffer.from(PNG_LIMPO));
    expect(nova(await cadastrarFichaUnificada(c.a, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética', 'pessoa-a')).repetido).toBe(false);
  });

  it('resposta de edição perdida não vira replay: origem antiga conflita sem duplicar materiais, foto ou histórico', async () => {
    const c = await catalogo3c(db, parceiros), r = nova(await criar(c, pedido(c))), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const e: EntradaFichaUnificada = { ...receita3c(c, { descricao: 'Edição confirmada no banco' }), versao: r.versao, materiais: { versao: r.versaoMateriais, linhas: [{ canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '2', unidade: 'un' }] } };
    const enviar = () => editarFichaUnificada(c.a, r.id, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética');
    await enviar().then(r => { nova(r); throw new Error('Resposta perdida após commit'); }).catch(e => expect(e.message).toBe('Resposta perdida após commit'));
    const antes = await retrato3c(c.a);
    expect(await enviar()).toMatchObject({ ok: false, conflito: true }); expect(await retrato3c(c.a)).toEqual(antes);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).toEqual(Buffer.from(PNG_LIMPO));
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('erro ao receber confirmação do COMMIT é reconciliado fora da transação sem devolver foto já confirmada', async () => {
    const c = await catalogo3c(db, parceiros), e = pedido(c), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    let retornos = 0;
    const transporte: ClienteDoParceiro = { ...c.a, transacao: async (fn, opcoes) => {
      const retorno = await c.a.transacao(fn, opcoes);
      if (++retornos === 1) throw new Error('Confirmação do COMMIT perdida');
      return retorno;
    } };
    const r = await cadastrarFichaUnificada(transporte, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética', 'pessoa-a');
    expect(retornos).toBe(2);
    const salvo = await retrato3c(c.a); expect(salvo.fichas).toHaveLength(1); confirmarReplay(r, salvo.fichas[0].id);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).toEqual(Buffer.from(PNG_LIMPO));
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('duas edições da mesma origem têm um vencedor integral; nunca misturam receita de uma com material da outra', async () => {
    const c = await catalogo3c(db, parceiros), r = nova(await criar(c, pedido(c)));
    const editar = (quantidade: string) => editarFichaUnificada(c.a, r.id, { ...receita3c(c, { descricao: `Edição ${quantidade}` }), versao: r.versao, materiais: { versao: r.versaoMateriais, linhas: [{ canal: 'IFOOD', insumoId: c.ids.sacola, quantidade, unidade: 'un' }] } }, { tipo: 'manter' }, 'Pessoa sintética');
    const resultados = await Promise.all([editar('2'), editar('3')]);
    expect(resultados.filter(r => r.ok)).toHaveLength(1);
    expect(resultados.find(r => !r.ok)).toMatchObject({ ok: false, conflito: true });
    const salvo = await retrato3c(c.a), quantidade = resultados[0].ok ? 2 : 3;
    expect(salvo.fichas[0].descricao).toBe(`Edição ${quantidade}`); expect(salvo.materiais[0].quantidadeMilesimos).toBe(quantidade * 1000);
    expect(salvo.fichas).toHaveLength(1); expect(salvo.materiais).toHaveLength(1);
  });

  it('gestão independente das fotos avança versão mesmo com relógio anterior e invalida a edição da receita', async () => {
    const c = await catalogo3c(db, parceiros), r = nova(await criar(c, pedido(c))), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const origem = new Date('2050-01-01T00:00:00Z'); await c.a.fichaTecnica.update({ where: { id: r.id }, data: { atualizadoEm: origem } });
    expect(await mudarFotosDaFicha(c.a, r.id, origem.toISOString(), { tipo: 'adicionar', enviada: arquivo, legenda: 'Modo de servir' }, 'Pessoa sintética')).toMatchObject({ ok: true });
    const salvo = await retrato3c(c.a); expect(salvo.fichas[0].atualizadoEm.getTime()).toBeGreaterThan(origem.getTime());
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c), versao: origem.toISOString() }, { tipo: 'manter' }, 'Pessoa sintética')).toMatchObject({ ok: false, conflito: true });
    expect(await retrato3c(c.a)).toEqual(salvo);
  });

  it('CHECK real após foto/receita/materiais na edição devolve pendente e preserva a ficha confirmada inteira', async () => {
    const c = await catalogo3c(db, parceiros), original = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const r = nova(await cadastrarFichaUnificada(c.a, pedido(c), { tipo: 'enviada', arquivo: original }, 'Pessoa sintética', 'pessoa-a'));
    const arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true), antes = await retrato3c(c.a); let atingiu = false;
    const observado = observarTransacao3c(c.a, tx => ({ ...tx, produtoEmbalagem: new Proxy({ ...tx.produtoEmbalagem }, { get(alvo, prop, receptor) {
      if (prop !== 'createMany') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.createMany>) => {
        const r = await alvo.createMany(...args), ficha = await tx.fichaTecnica.findUniqueOrThrow({ where: { id: antes.fichas[0].id } });
        expect(ficha.fotoArquivo).toBe(arquivo); expect(ficha.descricao).toBe('Edição que vai reverter');
        expect((await tx.produtoEmbalagem.findFirstOrThrow()).quantidadeMilesimos).toBe(2000); atingiu = true;
        await tx.sql`UPDATE "ProdutoEmbalagem" SET "quantidadeMilesimos"=0 WHERE "parceiroId"=${tx.parceiroId}`;
        return r;
      };
    } }) }));
    const resultado = await editarFichaUnificada(observado, r.id, { ...receita3c(c, { descricao: 'Edição que vai reverter' }), versao: r.versao,
      materiais: { versao: r.versaoMateriais, linhas: [{ canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '2', unidade: 'un' }] } }, { tipo: 'enviada', arquivo }, 'Pessoa sintética');
    expect(atingiu).toBe(true); expect(resultado).toMatchObject({ ok: false });
    expect(await retrato3c(c.a)).toEqual(antes);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).toEqual(Buffer.from(PNG_LIMPO));
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(caminhoDaFoto(c.parceiro.id, original, pasta))).toEqual(Buffer.from(PNG_LIMPO));
    expect(resultado).not.toHaveProperty('indeterminado');
  });

  it('galeria não reassume pendente ao repetir versão antiga; legenda igual mantém versão e histórico', async () => {
    const c = await catalogo3c(db, parceiros), r = nova(await criar(c, pedido(c))), arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const adicionar = () => mudarFotosDaFicha(c.a, r.id, r.versao, { tipo: 'adicionar', enviada: arquivo, legenda: 'Apoio' }, 'Pessoa sintética');
    expect(await adicionar()).toMatchObject({ ok: true }); const antes = await retrato3c(c.a);
    expect(await adicionar()).toMatchObject({ ok: false, conflito: true }); expect(await retrato3c(c.a)).toEqual(antes);
    expect(await mudarFotosDaFicha(c.a, r.id, antes.fichas[0].atualizadoEm.toISOString(), { tipo: 'legenda', arquivo, legenda: 'Apoio' }, 'Pessoa sintética')).toMatchObject({ ok: true });
    expect(await retrato3c(c.a)).toEqual(antes); expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).toEqual(Buffer.from(PNG_LIMPO));
  });

  for (const origem of ['galeria', 'legado'] as const) it(`${origem}: confirmação de COMMIT perdida preserva arquivo já referenciado`, async () => {
    const c = await catalogo3c(db, parceiros), r = origem === 'galeria' ? nova(await criar(c, pedido(c))) : null, arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true);
    const transporte: ClienteDoParceiro = { ...c.a, transacao: async (fn, opcoes) => { await c.a.transacao(fn, opcoes); throw new Error('COMMIT confirmado, resposta perdida'); } };
    const gravar = origem === 'galeria'
      ? mudarFotosDaFicha(transporte, r!.id, r!.versao, { tipo: 'adicionar', enviada: arquivo }, 'Pessoa sintética')
      : cadastrarFicha(transporte, receita3c(c), { tipo: 'enviada', arquivo }, 'Pessoa sintética');
    await expect(gravar).rejects.toThrow('COMMIT confirmado, resposta perdida');
    const f = await c.a.fichaTecnica.findFirstOrThrow();
    if (origem === 'galeria') expect(f.fotosApoio).toMatchObject([{ arquivo }]); else expect(f.fotoArquivo).toBe(arquivo);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).toEqual(Buffer.from(PNG_LIMPO));
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  for (const modo of ['criação', 'edição'] as const) it(`${modo}: confirmação incerta preserva foto referenciada e não inventa sucesso nem versão`, async () => {
    const c = await catalogo3c(db, parceiros), origem = modo === 'edição' ? nova(await criar(c, pedido(c))) : null;
    const arquivo = await salvarFoto(c.parceiro.id, PNG_LIMPO, 'png', true), e = pedido(c);
    if (origem) { e.versao = origem.versao; e.materiais!.versao = origem.versaoMateriais; e.descricao = 'Conteúdo confirmado sem resposta'; }
    let chamadas = 0;
    const transporte: ClienteDoParceiro = { ...c.a, transacao: async (fn, opcoes) => {
      if (++chamadas > 1) throw new Error('Conexão indisponível para reconciliar');
      await c.a.transacao(fn, opcoes); throw new Error('Confirmação do COMMIT perdida');
    } };
    const enviar = (a: ClienteDoParceiro) => origem ? editarFichaUnificada(a, origem.id, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética')
      : cadastrarFichaUnificada(a, e, { tipo: 'enviada', arquivo }, 'Pessoa sintética', 'pessoa-a');
    const resultado = await enviar(transporte);
    expect(resultado).toMatchObject({ ok: false, indeterminado: true }); expect(resultado).not.toHaveProperty('versao');
    const salvo = await retrato3c(c.a); expect(salvo.fichas).toHaveLength(1); expect(salvo.fichas[0].fotoArquivo).toBe(arquivo);
    expect(await readFile(caminhoDaFoto(c.parceiro.id, arquivo, pasta))).toEqual(Buffer.from(PNG_LIMPO));
    await expect(stat(caminhoDaFoto(c.parceiro.id, arquivo, pasta, true))).rejects.toMatchObject({ code: 'ENOENT' });
    if (origem) expect(await enviar(c.a)).toMatchObject({ ok: false, conflito: true }); else confirmarReplay(await enviar(c.a), salvo.fichas[0].id);
    expect(await retrato3c(c.a)).toEqual(salvo);
  });
});
