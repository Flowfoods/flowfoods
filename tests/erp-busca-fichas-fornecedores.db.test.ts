/**
 * ERP L.3 (herança da L.2) · a busca sem acento também nas FICHAS e nos FORNECEDORES (a mesma de `busca.ts`), no Postgres de verdade:
 * "feijao" acha "Feijão tropeiro", "ze" acha "Frios do Zé" e "laticinios" acha a razão social "Laticínios Rio Ltda"; `%` e `_` continuam letras;
 * o outro parceiro não enxerga. A busca rápida do topo (⌘K) usa a mesma conta.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-busca-fichas-fornecedores.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarFornecedor, listarFornecedores } from '@/lib/erp/compras';
import { buscarFichas, cadastrarFicha, listarFichas } from '@/lib/erp/fichas';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { cadastrarInsumoDeTeste as cadastrarInsumo, limparParceiros, perfilDoBanco, SEM_NOTA_FISCAL, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP L.3 · busca sem acento em fichas e fornecedores (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `bf${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const DONA = () => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'busca A', slug: `busca-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'busca B', slug: `busca-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [c, nomes] of [[a, ['Feijão tropeiro', 'Molho 50% picante', 'Pão de queijo', 'Ação_extra']], [b, ['Feijão do B']]] as const) {
      const i = await cadastrarInsumo(c, { nome: 'Feijão cru', tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '8,00' });
      if (!i.ok) throw new Error(JSON.stringify(i));
      for (const nome of nomes) {
        const f = await cadastrarFicha(c, { nome, tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: i.id, quantidade: '100', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
        if (!f.ok) throw new Error(JSON.stringify(f));
      }
    }
    for (const [c, f] of [[a, { nome: 'Frios do Zé', ...SEM_NOTA_FISCAL }], [a, { nome: 'Laticínios Rio', razaoSocial: 'Laticínios Rio Ltda', documento: '11.222.333/0001-81', email: 'v@lat.com.br', whatsapp: '(21) 99999-0000' }], [a, { nome: 'Açougue 50%', ...SEM_NOTA_FISCAL }], [b, { nome: 'Zé do B', ...SEM_NOTA_FISCAL }]] as const) {
      const r = await cadastrarFornecedor(c, f, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
    }
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  const fichas = async (c: ClienteDoParceiro, q: string) => (await listarFichas(c, { q })).linhas.map((l) => l.nome).sort();
  const fornecedores = async (c: ClienteDoParceiro, q: string) => (await listarFornecedores(c, DONA(), { q })).map((f) => f.nome).sort();

  it('fichas: sem acento acha com acento, em qualquer caixa, e o texto segue literal', async () => {
    expect(await fichas(a, 'feijao')).toEqual(['Feijão tropeiro']);
    expect(await fichas(a, 'FEIJÃO TRO')).toEqual(['Feijão tropeiro']);
    expect(await fichas(a, 'pao de')).toEqual(['Pão de queijo']);
    expect(await fichas(a, 'acao')).toEqual(['Ação_extra']);
    expect(await fichas(a, '50% p')).toEqual(['Molho 50% picante']);
    // % e _ não são curingas.
    expect(await fichas(a, 'fei%')).toEqual([]);
    expect(await fichas(a, 'a_ao')).toEqual([]);
    expect(await fichas(a, "'; DROP TABLE \"FichaTecnica\"; --")).toEqual([]);
    expect((await listarFichas(a, {})).total).toBe(4);
  });

  it('fichas: o contador e a página concordam com o filtro, e o outro parceiro não enxerga', async () => {
    const r = await listarFichas(a, { q: 'feijao' });
    expect([r.total, r.linhas.length]).toEqual([1, 1]);
    expect(await fichas(b, 'feijao')).toEqual(['Feijão do B']);
    expect((await buscarFichas(a, 'feijao')).map((f) => f.nome)).toEqual(['Feijão tropeiro']);
    expect((await buscarFichas(a, 'PAO')).map((f) => f.nome)).toEqual(['Pão de queijo']);
    expect((await buscarFichas(b, 'tropeiro')).length).toBe(0);
  });

  it('fornecedores: nome e razão social sem acento; documento por dígitos; literal; isolado', async () => {
    expect(await fornecedores(a, 'ze')).toEqual(['Frios do Zé']);
    expect(await fornecedores(a, 'laticinios')).toEqual(['Laticínios Rio']);
    expect(await fornecedores(a, 'LATICÍNIOS RIO LTDA')).toEqual(['Laticínios Rio']);
    expect(await fornecedores(a, '11.222.333')).toEqual(['Laticínios Rio']);
    expect(await fornecedores(a, 'acougue 50%')).toEqual(['Açougue 50%']);
    expect(await fornecedores(a, 'acou%')).toEqual([]);
    expect(await fornecedores(a, 'zz')).toEqual([]);
    expect(await fornecedores(b, 'ze')).toEqual(['Zé do B']);
    expect(await fornecedores(a, '')).toHaveLength(3);
  });
});
