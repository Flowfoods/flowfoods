/**
 * Reorganização de 24/10/2026 · "Onde é usado" no Postgres de verdade:
 * - lista as fichas que levam o insumo na receita (com a quantidade) e os pratos que o usam como embalagem de um canal;
 * - uma ficha aparece uma vez só, mesmo usando o insumo na receita e na embalagem; ativas primeiro;
 * - isolamento: o cliente de outro parceiro não vê nada (nem conta);
 * - junção pura: soma linhas repetidas, ordem fixa dos canais.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-onde-e-usado.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFicha, mudarSituacaoFicha } from '@/lib/erp/fichas';
import { salvarEmbalagens } from '@/lib/erp/canais';
import { juntarUsos, ondeOInsumoEUsado } from '@/lib/erp/onde-e-usado';
import type { ItemDigitado } from '@/lib/erp/ficha-campos';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe('onde é usado · junção pura', () => {
  it('soma linhas repetidas da mesma ficha, junta receita e embalagem e ordena (ativas primeiro, depois o nome)', () => {
    const r = juntarUsos(
      [
        { fichaId: 'b', nome: 'Burger', tipo: 'PRATO', ativa: true, quantidadeMilesimos: 100 },
        { fichaId: 'b', nome: 'Burger', tipo: 'PRATO', ativa: true, quantidadeMilesimos: 50 },
        { fichaId: 'z', nome: 'Antigo', tipo: 'PRATO', ativa: false, quantidadeMilesimos: 10 },
      ],
      [
        { fichaId: 'b', nome: 'Burger', tipo: 'PRATO', ativa: true, canal: 'IFOOD' },
        { fichaId: 'a', nome: 'Açaí', tipo: 'PRATO', ativa: true, canal: 'IFOOD' },
        { fichaId: 'a', nome: 'Açaí', tipo: 'PRATO', ativa: true, canal: 'DELIVERY_PROPRIO' },
        { fichaId: 'a', nome: 'Açaí', tipo: 'PRATO', ativa: true, canal: 'IFOOD' },
      ],
    );
    expect(r.map((u) => u.nome)).toEqual(['Açaí', 'Burger', 'Antigo']);
    expect(r[0]).toMatchObject({ naReceitaMilesimos: null, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] });
    expect(r[1]).toMatchObject({ naReceitaMilesimos: 150, embalagemEm: ['IFOOD'] });
  });
});

describe.skipIf(!URL_TESTE)('onde é usado · Postgres real', { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `o${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Onde A', slug: `onde-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Onde B', slug: `onde-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      queijo: { tipo: 'INGREDIENTE', nome: 'Queijo', unidade: 'KG', conteudo: '1', preco: '40,00' },
      pao: { tipo: 'INGREDIENTE', nome: 'Pão', unidade: 'UN', conteudo: '1', preco: '1,50' },
      caixa: { tipo: 'EMBALAGEM', nome: 'Caixa', unidade: 'UN', conteudo: '1', preco: '0,30' },
      sobra: { tipo: 'INGREDIENTE', nome: 'Sem uso', unidade: 'KG', conteudo: '1', preco: '1,00' },
    })) {
      const r = await cadastrarInsumo(a, { conservacao: 'SECO', escala: 'base', ...campos });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    const prato = async (nome: string, itens: ItemDigitado[]) => {
      const r = await cadastrarFicha(a, { nome, tipo: 'PRATO', rendimento: '1', itens }, { tipo: 'manter' }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    ids.burger = await prato('Burger', [
      { insumoId: ids.queijo, quantidade: '80', unidade: 'g' },
      { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
    ]);
    ids.misto = await prato('Misto', [{ insumoId: ids.queijo, quantidade: '30', unidade: 'g' }]);
    ids.antigo = await prato('Antigo', [{ insumoId: ids.queijo, quantidade: '10', unidade: 'g' }]);
    const d = await mudarSituacaoFicha(a, ids.antigo, false, 'saiu do cardápio', 'Marina');
    if (!(d as { ok: boolean }).ok) throw new Error(JSON.stringify(d));
    const em = await salvarEmbalagens(a, ids.burger, { impressao: '', linhas: [{ canal: 'IFOOD', insumoId: ids.caixa, quantidade: '1', unidade: 'un' }, { canal: 'DELIVERY_PROPRIO', insumoId: ids.caixa, quantidade: '1', unidade: 'un' }] }, 'Marina');
    if (!em.ok) throw new Error(JSON.stringify(em));
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('receita: as fichas que levam o insumo, com a quantidade; a desativada vem por último', async () => {
    const o = await ondeOInsumoEUsado(a, ids.queijo, 'KG');
    expect(o.total).toBe(3);
    expect(o.cortada).toBe(false);
    expect(o.usos.map((u) => [u.nome, u.ativa, u.naReceitaMilesimos])).toEqual([
      ['Burger', true, 80],
      ['Misto', true, 30],
      ['Antigo', false, 10],
    ]);
  });

  it('embalagem: o prato aparece com os canais, na ordem fixa, sem quantidade de receita', async () => {
    const o = await ondeOInsumoEUsado(a, ids.caixa, 'UN');
    expect(o.total).toBe(1);
    expect(o.usos).toEqual([{ fichaId: ids.burger, nome: 'Burger', tipo: 'PRATO', ativa: true, naReceitaMilesimos: null, embalagemEm: ['DELIVERY_PROPRIO', 'IFOOD'] }]);
  });

  it('insumo sem uso: lista vazia e total zero', async () => {
    expect(await ondeOInsumoEUsado(a, ids.sobra, 'KG')).toMatchObject({ usos: [], total: 0, cortada: false });
  });

  it('isolamento: o cliente de outro parceiro não vê nem conta as fichas de A', async () => {
    expect(await ondeOInsumoEUsado(b, ids.queijo, 'KG')).toMatchObject({ usos: [], total: 0 });
  });
});
