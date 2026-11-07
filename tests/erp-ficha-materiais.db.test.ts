import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cadastrarFichaUnificada, editarFichaUnificada, editarFicha, obterFichaComCanais } from '@/lib/erp/fichas';
import type { EntradaFichaUnificada, ResultadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';
import { compararFracoes } from '@/lib/erp/unidades';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { catalogo3c, observarTransacao3c, receita3c, retrato3c, type Catalogo3c } from './erp-ficha-3c-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const materiais = (c: Catalogo3c) => ({ versao: '', linhas: [
  { canal: 'DELIVERY_PROPRIO', insumoId: c.ids.caixa, quantidade: '1', unidade: 'un' },
  { canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '1', unidade: 'un' },
] });
const pedido = (c: Catalogo3c, extras: Partial<EntradaFichaUnificada> = {}): EntradaFichaUnificada => ({ ...receita3c(c), chaveEnvio: crypto.randomUUID(), materiais: materiais(c), ...extras });
const ok = (r: ResultadoFichaUnificada) => { if (!r.ok || r.repetido) throw new Error(JSON.stringify(r)); return r; };

describe.skipIf(!URL_TESTE)('3C · conclusão integral de receita e materiais em Postgres', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco local obrigatório');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  const criar = (c: Catalogo3c, entrada = pedido(c)) => cadastrarFichaUnificada(c.a, entrada, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a');

  it('cria receita, classificação e materiais juntos; físico 10/12/13 por porção sem inventar preço ou baixa', async () => {
    const c = await catalogo3c(db, parceiros);
    const r = ok(await criar(c, pedido(c, { classificacao: { secao: { tipo: 'nova', nome: 'Pratos sintéticos' }, subsecao: { tipo: 'nova', nome: 'Da casa' } } })));
    const salvo = await retrato3c(c.a);
    expect(salvo.fichas).toHaveLength(1); expect(salvo.itens).toHaveLength(1); expect(salvo.produtos).toHaveLength(1); expect(salvo.materiais).toHaveLength(2);
    expect(salvo.secoes).toHaveLength(1); expect(salvo.subsecoes).toHaveLength(1);
    expect(salvo.precos).toEqual([]); expect(salvo.saldos).toEqual([]); expect(salvo.movimentos).toEqual([]);
    expect(salvo.materiais.map(m => m.canal).sort()).toEqual(['DELIVERY_PROPRIO', 'IFOOD']);
    expect(salvo.materiais.every(m => m.quantidadeMilesimos === 1000)).toBe(true);
    const lida = (await obterFichaComCanais(c.a, r.id, { verPrecos: true }))!;
    expect(lida.ficha.classificacao.secao?.nome).toBe('Pratos sintéticos');
    const esperado = { LOJA: 1000n, DELIVERY_PROPRIO: 1200n, IFOOD: 1300n };
    for (const canal of lida.canais!.cmv) {
      expect(compararFracoes(canal.fisico.valor, { num: esperado[canal.canal], den: 1n })).toBe(0);
      expect(canal.precoCentavos).toBeNull(); expect(canal.farol.faixa).toBe('semDados');
    }
  });

  it('edição integral altera receita e materiais, preservando preços manuais, oferta, estoque e snapshots anteriores', async () => {
    const c = await catalogo3c(db, parceiros), r = ok(await criar(c));
    const p = await c.a.produtoVenda.findFirstOrThrow({ where: { fichaId: r.id } });
    await c.a.produtoCanal.createMany({ data: [
      { parceiroId: c.parceiro.id, produtoId: p.id, canal: 'LOJA', precoManualCentavos: 5000, ativo: true },
      { parceiroId: c.parceiro.id, produtoId: p.id, canal: 'DELIVERY_PROPRIO', precoManualCentavos: 6000, ativo: true },
      { parceiroId: c.parceiro.id, produtoId: p.id, canal: 'IFOOD', precoManualCentavos: 6500, ativo: false },
    ] });
    const antes = await retrato3c(c.a);
    const atual = ok(await editarFichaUnificada(c.a, r.id, { ...receita3c(c, { rendimento: '20', descricao: 'Descrição nova', itens: [{ insumoId: c.ids.ingrediente, quantidade: '20', unidade: 'un' }] }), versao: r.versao, materiais: { versao: r.versaoMateriais, linhas: [{ canal: 'IFOOD', insumoId: c.ids.sacola, quantidade: '2', unidade: 'un' }] } }, { tipo: 'manter' }, 'Pessoa sintética'));
    const depois = await retrato3c(c.a);
    expect(atual.repetido).toBe(false); expect(atual.versao).not.toBe(r.versao);
    expect(depois.fichas[0]).toMatchObject({ descricao: 'Descrição nova', rendimentoMilesimos: 20000 });
    expect(depois.itens[0].quantidadeMilesimos).toBe(20000);
    expect(depois.materiais).toHaveLength(1); expect(depois.materiais[0]).toMatchObject({ canal: 'IFOOD', insumoId: c.ids.sacola, quantidadeMilesimos: 2000 });
    expect(depois.precos).toEqual(antes.precos); expect(depois.saldos).toEqual(antes.saldos); expect(depois.movimentos).toEqual(antes.movimentos);
    expect(depois.historico.filter(h => antes.historico.some(a => a.id === h.id))).toEqual(antes.historico);
  });

  it('omissão nas edições moderna e legada mantém materiais; vazio explícito retira sem apagar produto ou preço', async () => {
    const c = await catalogo3c(db, parceiros), r = ok(await criar(c)), antes = await retrato3c(c.a);
    const moderno = ok(await editarFichaUnificada(c.a, r.id, { ...receita3c(c, { descricao: 'Só receita' }), versao: r.versao }, { tipo: 'manter' }, 'Pessoa sintética'));
    expect((await retrato3c(c.a)).materiais).toEqual(antes.materiais);
    expect(await editarFicha(c.a, r.id, { ...receita3c(c, { descricao: 'Receita legada' }), versao: moderno.versao })).toMatchObject({ ok: true });
    const legado = await c.a.fichaTecnica.findUniqueOrThrow({ where: { id: r.id } });
    expect((await retrato3c(c.a)).materiais).toEqual(antes.materiais);
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c, { descricao: 'Receita legada' }), versao: legado.atualizadoEm.toISOString(), materiais: { versao: moderno.versaoMateriais, linhas: [] } }, { tipo: 'manter' }, 'Pessoa sintética')).toMatchObject({ ok: true });
    const final = await retrato3c(c.a); expect(final.materiais).toEqual([]); expect(final.produtos).toEqual(antes.produtos); expect(final.precos).toEqual(antes.precos);
  });

  it('reenvio atual igual não troca versões, IDs ou histórico', async () => {
    const c = await catalogo3c(db, parceiros), r = ok(await criar(c)), antes = await retrato3c(c.a);
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c), versao: r.versao, materiais: { ...materiais(c), versao: r.versaoMateriais } }, { tipo: 'manter' }, 'Pessoa sintética')).toMatchObject({ ok: true, mudou: [], repetido: false, versao: r.versao, versaoMateriais: r.versaoMateriais });
    expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('CSV antigo altera somente receita e preserva materiais, identidade durável, preços e estoque', async () => {
    const c = await catalogo3c(db, parceiros), entrada = pedido(c), r = ok(await criar(c, entrada)), antes = await retrato3c(c.a);
    const csv = 'ficha;tipo;rende;insumo;quantidade;unidade\nPrato sintético;prato;10;Ingrediente de dez reais;20;un';
    expect((await previaDaImportacao(c.a, csv)).contagem).toEqual({ nova: 0, muda: 1, igual: 0, erro: 0 });
    expect(await importarFichas(c.a, csv, 'Pessoa sintética')).toMatchObject({ ok: true, alteradas: 1 });
    const depois = await retrato3c(c.a); expect(depois.itens[0].quantidadeMilesimos).toBe(20000); expect(depois.fichas[0].atualizadoEm.getTime()).toBeGreaterThan(antes.fichas[0].atualizadoEm.getTime());
    for (const campo of ['materiais', 'precos', 'saldos', 'movimentos'] as const) expect(depois[campo]).toEqual(antes[campo]);
    expect(depois.fichas[0].chaveEnvio).toBe(antes.fichas[0].chaveEnvio); expect(depois.fichas[0].hashEnvio).toBe(antes.fichas[0].hashEnvio);
    expect(await criar(c, entrada)).toEqual({ ok: true, id: r.id, repetido: true, mudou: [] }); expect(await retrato3c(c.a)).toEqual(depois);
  });

  it('material já associado que foi desativado ou mudou de tipo permanece no seu canal; novo canal recusa', async () => {
    const c = await catalogo3c(db, parceiros), r = ok(await criar(c));
    await c.a.insumo.update({ where: { id: c.ids.sacola }, data: { ativo: false, tipo: 'MATERIAL' } });
    const antes = await retrato3c(c.a);
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c), versao: r.versao, materiais: { ...materiais(c), versao: r.versaoMateriais } }, { tipo: 'manter' })).toMatchObject({ ok: true, mudou: [] });
    expect(await retrato3c(c.a)).toEqual(antes);
    expect(await editarFichaUnificada(c.a, r.id, { ...receita3c(c), versao: r.versao, materiais: { versao: r.versaoMateriais, linhas: [...materiais(c).linhas, { canal: 'DELIVERY_PROPRIO', insumoId: c.ids.sacola, quantidade: '1', unidade: 'un' }] } }, { tipo: 'manter' })).toMatchObject({ ok: false });
    expect(await retrato3c(c.a)).toEqual(antes);
  });

  for (const caso of ['outro parceiro', 'desativada', 'material de limpeza', 'unidade incompatível', 'canal loja', 'duplicada', 'quantidade inválida', 'pré-preparo'] as const) it(`validação de materiais: ${caso} não deixa receita ou classificação pela metade`, async () => {
    const c = await catalogo3c(db, parceiros), entrada = pedido(c, { classificacao: { secao: { tipo: 'nova', nome: 'Não deve persistir' }, subsecao: { tipo: 'nenhuma' } } });
    const linha = { canal: 'DELIVERY_PROPRIO', insumoId: c.ids.caixa, quantidade: '1', unidade: 'un' };
    if (caso === 'outro parceiro') linha.insumoId = (await catalogo3c(db, parceiros)).ids.caixa;
    if (caso === 'desativada') await c.a.insumo.update({ where: { id: c.ids.caixa }, data: { ativo: false } });
    if (caso === 'material de limpeza') linha.insumoId = c.ids.material;
    if (caso === 'unidade incompatível') linha.unidade = 'kg';
    if (caso === 'canal loja') linha.canal = 'LOJA';
    if (caso === 'quantidade inválida') linha.quantidade = '0';
    if (caso === 'pré-preparo') { entrada.tipo = 'PRE_PREPARO'; entrada.rendimentoUnidade = 'un'; }
    entrada.materiais = { versao: '', linhas: caso === 'duplicada' ? [linha, linha] : [linha] };
    const antes = await retrato3c(c.a);
    expect(await criar(c, entrada)).toMatchObject({ ok: false }); expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('falha SQL real depois de gravar receita/classificação/material desfaz tudo e libera a chave para corrigir', async () => {
    const c = await catalogo3c(db, parceiros), entrada = pedido(c, { classificacao: { secao: { tipo: 'nova', nome: 'Seção transacional' }, subsecao: { tipo: 'nova', nome: 'Filha transacional' } } });
    const antes = await retrato3c(c.a); let atingiu = false;
    const observado = observarTransacao3c(c.a, tx => ({ ...tx, produtoEmbalagem: new Proxy({ ...tx.produtoEmbalagem }, { get(alvo, prop, receptor) {
      if (prop !== 'createMany') return Reflect.get(alvo, prop, receptor);
      return async (...args: Parameters<typeof alvo.createMany>) => {
        const r = await alvo.createMany(...args);
        expect(await tx.fichaTecnica.count()).toBe(1); expect(await tx.secaoFicha.count()).toBe(1); expect(await tx.produtoEmbalagem.count()).toBe(2); atingiu = true;
        await tx.sql`UPDATE "ProdutoEmbalagem" SET "quantidadeMilesimos"=0 WHERE "parceiroId"=${tx.parceiroId}`;
        return r;
      };
    } }) }));
    const [resultado] = await Promise.allSettled([cadastrarFichaUnificada(observado, entrada, { tipo: 'manter' }, 'Pessoa sintética', 'pessoa-a')]);
    expect(atingiu).toBe(true); expect(resultado.status === 'rejected' || !resultado.value.ok).toBe(true);
    expect(await retrato3c(c.a)).toEqual(antes);
    expect(await criar(c, entrada)).toMatchObject({ ok: true, repetido: false });
  });
});
