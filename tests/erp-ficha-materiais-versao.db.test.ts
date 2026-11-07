import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cadastrarFicha, editarFicha, mudarSituacaoFicha } from '@/lib/erp/fichas';
import { custoPorCanal, salvarEmbalagens } from '@/lib/erp/canais';
import { obterFicha } from '@/lib/erp/fichas';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { catalogo3c, receita3c, retrato3c } from './erp-ficha-3c-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
describe.skipIf(!URL_TESTE)('3C · materiais invalidam a origem unificada sem versão regressiva', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  const parceiros: string[] = [];
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Banco de teste precisa ser local');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } }); perfil = await perfilDoBanco(db);
  });
  afterAll(async () => { if (db) { await limparParceiros(db, perfil, parceiros); await db.$disconnect(); } }, 120_000);
  async function nova() {
    const c = await catalogo3c(db, parceiros);
    const r = await cadastrarFicha(c.a, receita3c(c)); if (!r.ok) throw new Error(JSON.stringify(r));
    // Relógio da última versão no futuro: Date.now() sozinho regrediria a origem.
    await c.a.fichaTecnica.update({ where: { id: r.id }, data: { atualizadoEm: new Date('2050-01-01T00:00:00Z') } });
    const ficha = () => obterFicha(c.a, r.id);
    const materiais = async (quantidade: string | null) => {
      const lida = (await ficha())!, conta = (await custoPorCanal(c.a, lida))!;
      return salvarEmbalagens(c.a, r.id, { impressao: conta.impressao, linhas: quantidade === null ? [] : [{ canal: 'DELIVERY_PROPRIO', insumoId: c.ids.caixa, quantidade, unidade: 'un' }] });
    };
    return { ...c, id: r.id, ficha, materiais };
  }

  it('mudança real de materiais avança a ficha; reenvio igual mantém versão, IDs e histórico', async () => {
    const c = await nova(), antes = (await c.ficha())!;
    expect(await c.materiais('1')).toMatchObject({ ok: true });
    const depois = (await c.ficha())!;
    expect(Date.parse(depois.versao)).toBeGreaterThan(Date.parse(antes.versao));
    const salvo = await retrato3c(c.a);
    expect(await c.materiais('1')).toMatchObject({ ok: true, mudou: [] });
    expect(await retrato3c(c.a)).toEqual(salvo);
  });

  it('A→B→A pela action legada não torna válida a origem antiga da edição unificada', async () => {
    const c = await nova(); await c.materiais('1');
    const origem = (await c.ficha())!;
    const tokenA = (await custoPorCanal(c.a, origem))!.impressao;
    expect(await c.materiais('2')).toMatchObject({ ok: true });
    expect(await c.materiais('1')).toMatchObject({ ok: true });
    const atual = (await c.ficha())!;
    expect((await custoPorCanal(c.a, atual))!.impressao).toBe(tokenA);
    expect(Date.parse(atual.versao)).toBeGreaterThan(Date.parse(origem.versao));
    const antes = await retrato3c(c.a);
    expect(await editarFicha(c.a, c.id, { ...receita3c(c, { descricao: 'Rascunho antigo' }), versao: origem.versao })).toMatchObject({ ok: false, conflito: true });
    expect(await retrato3c(c.a)).toEqual(antes);
  });

  it('receita e situação posteriores não regridem a versão avançada pelos materiais', async () => {
    const c = await nova(); await c.materiais('1');
    let anterior = (await c.ficha())!.versao;
    expect(await editarFicha(c.a, c.id, { ...receita3c(c, { descricao: 'Descrição atual' }), versao: anterior })).toMatchObject({ ok: true });
    let atual = (await c.ficha())!.versao; expect(Date.parse(atual)).toBeGreaterThan(Date.parse(anterior)); anterior = atual;
    expect(await mudarSituacaoFicha(c.a, c.id, false, 'Pausa sintética')).toMatchObject({ ok: true });
    atual = (await c.ficha())!.versao; expect(Date.parse(atual)).toBeGreaterThan(Date.parse(anterior)); anterior = atual;
    expect(await mudarSituacaoFicha(c.a, c.id, true, 'Retomada sintética')).toMatchObject({ ok: true });
    expect(Date.parse((await c.ficha())!.versao)).toBeGreaterThan(Date.parse(anterior));
  });
});
