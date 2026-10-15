/**
 * Isolamento ponta a ponta, no Postgres de verdade. Dois Parceiros Flow, um
 * insumo em cada, e todas as formas de um tentar alcançar o do outro.
 *
 * Precisa de banco: roda só com ERP_DB_TESTE apontando para um Postgres LOCAL
 * já migrado (`prisma migrate deploy`). Sem a variável, é pulado — a suíte
 * padrão continua sem banco e sem rede, como manda o vitest.config.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-isolamento.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, ErroDeTenant } from '@/lib/erp/tenant';
import { cadastrarInsumo, listarInsumos } from '@/lib/erp/insumos';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP · isolamento entre Parceiros Flow (Postgres real)', () => {
  // Criado no beforeAll: o corpo do describe roda mesmo quando ele é pulado.
  let db: PrismaClient;
  const sufixo = Date.now().toString(36);
  let A: { id: string };
  let B: { id: string };
  let insumoDeA: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    A = await db.parceiroFlow.create({ data: { nome: 'Iso A', slug: `iso-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Iso B', slug: `iso-b-${sufixo}`, status: 'ATIVO' } });
    const r = await cadastrarInsumo(doParceiro(A.id, db), {
      nome: 'Cebola roxa', unidade: 'KG', conteudo: '20', preco: '79,90',
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erros));
    insumoDeA = r.id;
    await cadastrarInsumo(doParceiro(B.id, db), { nome: 'Leite', unidade: 'L', conteudo: '1', preco: '4,99' });
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "Insumo" WHERE "parceiroId" IN ($1, $2)`, A.id, B.id);
    await db.parceiroFlow.deleteMany({ where: { id: { in: [A.id, B.id] } } });
    await db.$disconnect();
  });

  it('cada parceiro lista só o seu', async () => {
    expect((await listarInsumos(doParceiro(A.id, db))).map((i) => i.nome)).toEqual(['Cebola roxa']);
    expect((await listarInsumos(doParceiro(B.id, db))).map((i) => i.nome)).toEqual(['Leite']);
  });

  it('B não acha o insumo de A nem sabendo o id', async () => {
    const b = doParceiro(B.id, db);
    expect(await b.insumo.findUnique({ where: { id: insumoDeA } })).toBeNull();
    expect(await b.insumo.findFirst({ where: { id: insumoDeA } })).toBeNull();
    expect(await b.insumo.count({ where: { nome: 'Cebola roxa' } })).toBe(0);
  });

  it('B não altera nem apaga o insumo de A', async () => {
    const b = doParceiro(B.id, db);
    expect((await b.insumo.updateMany({ where: { id: insumoDeA }, data: { nome: 'hack' } })).count).toBe(0);
    await expect(b.insumo.update({ where: { id: insumoDeA }, data: { nome: 'hack' } })).rejects.toThrow();
    expect((await b.insumo.deleteMany({ where: { id: insumoDeA } })).count).toBe(0);
    await expect(b.insumo.delete({ where: { id: insumoDeA } })).rejects.toThrow();
    const intacto = await doParceiro(A.id, db).insumo.findUnique({ where: { id: insumoDeA } });
    expect(intacto?.nome).toBe('Cebola roxa');
  });

  it('B não grava no parceiro A, nem forjando o parceiroId', async () => {
    const b = doParceiro(B.id, db);
    await expect(
      b.insumo.create({
        data: { parceiroId: A.id, nome: 'Intruso', unidade: 'UN', conteudoMilesimos: 1000, precoEmbalagemCentavos: 1 },
      }),
    ).rejects.toThrow(ErroDeTenant);
    expect(await doParceiro(A.id, db).insumo.count()).toBe(1);
  });

  it('mesmo nome pode existir em parceiros diferentes, nunca repetido no mesmo', async () => {
    const emB = await cadastrarInsumo(doParceiro(B.id, db), {
      nome: 'Cebola roxa', unidade: 'KG', conteudo: '1', preco: '5,00',
    });
    expect(emB.ok).toBe(true);
    const repetidoEmA = await cadastrarInsumo(doParceiro(A.id, db), {
      nome: 'Cebola roxa', unidade: 'KG', conteudo: '1', preco: '5,00',
    });
    expect(repetidoEmA).toEqual({ ok: false, erros: { nome: 'Já existe um insumo com esse nome.' } });
  });

  it('o banco recusa quantidade zero ou negativa, mesmo se a tela falhar', async () => {
    await expect(
      doParceiro(A.id, db).insumo.create({
        data: { parceiroId: A.id, nome: 'Zero', unidade: 'KG', conteudoMilesimos: 0, precoEmbalagemCentavos: 100 },
      }),
    ).rejects.toThrow();
  });
});
