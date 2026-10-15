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
import { travarTenant } from '@/lib/db';
import { cadastrarInsumo, listarInsumos } from '@/lib/erp/insumos';
import { cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP · isolamento entre Parceiros Flow (Postgres real)', () => {
  // Criado no beforeAll: o corpo do describe roda mesmo quando ele é pulado.
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = Date.now().toString(36);
  let A: { id: string };
  let B: { id: string };
  let insumoDeA: string;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
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
    // Só linhas destes dois parceiros (ver tests/erp-db-apoio.ts).
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
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

  // ------------------------------------------------ tabelas da fundação (0.1)

  it('loja: cada parceiro só vê as suas', async () => {
    await doParceiro(A.id, db).loja.create({ data: { parceiroId: A.id, nome: 'Penha', slug: 'penha' } });
    await doParceiro(B.id, db).loja.create({ data: { parceiroId: B.id, nome: 'Méier', slug: 'meier' } });
    expect((await doParceiro(A.id, db).loja.findMany()).map((l) => l.nome)).toEqual(['Penha']);
    expect((await doParceiro(B.id, db).loja.findMany()).map((l) => l.nome)).toEqual(['Méier']);
  });

  it('ficha de B não aponta para insumo de A — o BANCO recusa (FK composta)', async () => {
    const b = doParceiro(B.id, db);
    const ficha = await b.fichaTecnica.create({
      data: { parceiroId: B.id, nome: 'Burger B', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' },
    });
    // O portão carimba parceiroId = B; o insumo é de A: (B, insumoDeA) não existe em Insumo.
    await expect(
      b.fichaItem.create({ data: { parceiroId: B.id, fichaId: ficha.id, insumoId: insumoDeA, quantidadeMilesimos: 150 } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // Nem por SQL cru, sem portão nenhum: a trava é do banco.
    await expect(
      cru(
        db, perfil, B.id,
        `INSERT INTO "FichaItem" ("id","parceiroId","fichaId","insumoId","quantidadeMilesimos") VALUES ($1,$2,$3,$4,150)`,
        `iso-${sufixo}`, B.id, ficha.id, insumoDeA,
      ),
    ).rejects.toThrow(/foreign key/i);
    expect(await b.fichaItem.count()).toBe(0);
  });

  it('item de ficha é insumo OU subficha, nunca os dois nem nenhum (CHECK)', async () => {
    const a = doParceiro(A.id, db);
    const ficha = await a.fichaTecnica.create({
      data: { parceiroId: A.id, nome: 'Burger A', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' },
    });
    await expect(a.fichaItem.create({ data: { parceiroId: A.id, fichaId: ficha.id, quantidadeMilesimos: 10 } })).rejects.toThrow();
    const ok = await a.fichaItem.create({ data: { parceiroId: A.id, fichaId: ficha.id, insumoId: insumoDeA, quantidadeMilesimos: 150 } });
    expect(ok.fatorCorrecaoMilesimos).toBe(1000);
    // include aninhado pelo cliente do parceiro devolve só o que é dele.
    const comItens = await a.fichaTecnica.findUnique({ where: { id: ficha.id }, include: { itens: { include: { insumo: true } } } });
    expect(comItens?.itens.map((i) => i.insumo?.nome)).toEqual(['Cebola roxa']);
  });

  it('transacao continua amarrada ao parceiro e desfaz tudo se algo falha', async () => {
    const b = doParceiro(B.id, db);
    expect(await b.transacao((tx) => tx.insumo.findUnique({ where: { id: insumoDeA } }))).toBeNull();
    await expect(
      b.transacao(async (tx) => {
        await tx.marca.create({ data: { parceiroId: B.id, nome: 'Marca que não fica' } });
        await tx.marca.create({ data: { parceiroId: A.id, nome: 'Intrusa' } });
      }),
    ).rejects.toThrow(ErroDeTenant);
    expect(await b.marca.count()).toBe(0);
    expect(await doParceiro(A.id, db).marca.count()).toBe(0);
  });

  it('faturamento é idempotente: a mesma chave não entra duas vezes no parceiro', async () => {
    const a = doParceiro(A.id, db);
    const [loja] = await a.loja.findMany();
    const lanc = {
      parceiroId: A.id, lojaId: loja.id, canal: 'IFOOD' as const, data: new Date('2026-10-14'), valorCentavos: 123456,
      pedidos: 30, clientes: 28, origem: 'INTEGRACAO' as const, chaveIdempotencia: 'ifood:2026-10-14:penha',
    };
    await a.faturamentoLancamento.create({ data: lanc });
    await expect(a.faturamentoLancamento.create({ data: lanc })).rejects.toMatchObject({ code: 'P2002' });
    expect(await a.faturamentoLancamento.count()).toBe(1);
  });

  it('movimento de estoque: saldo antes/depois fecha, sinal do tipo vale e não se edita', async () => {
    const a = doParceiro(A.id, db);
    const [loja] = await a.loja.findMany();
    const base = {
      parceiroId: A.id, lojaId: loja.id, insumoId: insumoDeA, insumoNomeSnapshot: 'Cebola roxa', unidadeSnapshot: 'KG' as const,
    };
    const mov = await a.movimentoEstoque.create({
      data: { ...base, tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 20000, valorCentavos: 7990, saldoAntesMilesimos: 0, saldoDepoisMilesimos: 20000 },
    });
    // Conta que não fecha.
    await expect(
      a.movimentoEstoque.create({
        data: { ...base, tipo: 'AJUSTE', quantidadeMilesimos: -500, valorCentavos: -200, saldoAntesMilesimos: 20000, saldoDepoisMilesimos: 20000 },
      }),
    ).rejects.toThrow();
    // Requisição com sinal positivo.
    await expect(
      a.movimentoEstoque.create({
        data: { ...base, tipo: 'REQUISICAO', quantidadeMilesimos: 500, valorCentavos: 0, saldoAntesMilesimos: 20000, saldoDepoisMilesimos: 20500 },
      }),
    ).rejects.toThrow();
    // Livro-razão: UPDATE é recusado pelo banco. Com a RLS, o papel erp_tenant
    // nem tem GRANT de UPDATE (0.2); sem ela, o trigger recusa.
    await expect(a.movimentoEstoque.update({ where: { id: mov.id }, data: { motivo: 'mexi' } })).rejects.toThrow(
      perfil.rls ? /permission denied/ : /só aceita INSERT/,
    );
    // E o trigger segue valendo para quem tem GRANT (o usuário do app, fora do papel).
    if (perfil.superusuario || !perfil.rls) {
      await expect(
        db.$executeRawUnsafe(`UPDATE "MovimentoEstoque" SET "motivo" = 'mexi' WHERE "id" = $1`, mov.id),
      ).rejects.toThrow(/só aceita INSERT/);
    }
  });

  // ------------------------------------------------ reprovação 1 dos fiscais

  it('ataque: produto de B não "conecta" a ficha de A (nem lê, nem muda de dono)', async () => {
    const a = doParceiro(A.id, db);
    const b = doParceiro(B.id, db);
    const fichaA = await a.fichaTecnica.create({
      data: { parceiroId: A.id, nome: 'SEGREDO A', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN', modoPreparo: 'receita de A' },
    });
    const fichaB = await b.fichaTecnica.create({
      data: { parceiroId: B.id, nome: 'Ficha B', tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' },
    });
    const prodB = await b.produtoVenda.create({ data: { parceiroId: B.id, nome: 'Prod B', fichaId: fichaB.id } });

    await expect(
      b.produtoVenda.update({
        where: { id: prodB.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ficha: { connect: { id: fichaA.id } } } as any,
        include: { ficha: true },
      }),
    ).rejects.toThrow(ErroDeTenant);
    // Pelo escalar, quem barra é a FK composta: (B, fichaDeA) não existe.
    await expect(
      b.produtoVenda.update({ where: { id: prodB.id }, data: { fichaId: fichaA.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const linha = await b.produtoVenda.findUnique({ where: { id: prodB.id } });
    expect(linha).toMatchObject({ parceiroId: B.id, fichaId: fichaB.id });
    expect(await a.produtoVenda.count()).toBe(0);
  });

  it('ataque: insumo de B não aponta fornecedor de A por connect (nem por upsert)', async () => {
    const a = doParceiro(A.id, db);
    const b = doParceiro(B.id, db);
    const fornA = await a.fornecedor.create({ data: { parceiroId: A.id, nome: 'Forn A' } });
    const [insB] = await b.insumo.findMany({ take: 1 });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.insumo.update({ where: { id: insB.id }, data: { fornecedorPadrao: { connect: { id: fornA.id } } } as any }),
    ).rejects.toThrow(ErroDeTenant);
    await expect(
      b.insumo.upsert({
        where: { id: insB.id },
        create: { parceiroId: B.id, nome: 'x', unidade: 'KG', conteudoMilesimos: 1, precoEmbalagemCentavos: 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: { fornecedorPadrao: { connect: { id: fornA.id } } } as any,
      }),
    ).rejects.toThrow(ErroDeTenant);
    await expect(
      b.insumo.update({ where: { id: insB.id }, data: { fornecedorPadraoId: fornA.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect((await b.insumo.findUnique({ where: { id: insB.id } }))?.fornecedorPadraoId).toBeNull();
  });

  it('o banco não deixa UPDATE trocar o parceiroId, nem por SQL cru, nem em cascata', async () => {
    await expect(
      cru(db, perfil, A.id, `UPDATE "Insumo" SET "parceiroId" = $1 WHERE "id" = $2`, B.id, insumoDeA),
    ).rejects.toThrow(/parceiroId é imutável/);
    await expect(
      cru(db, perfil, A.id, `UPDATE "Loja" SET "parceiroId" = $1 WHERE "parceiroId" = $2`, B.id, A.id),
    ).rejects.toThrow(/parceiroId é imutável/);
    // ON UPDATE CASCADE das FKs esbarra no mesmo trigger.
    await expect(
      db.$executeRawUnsafe(`UPDATE "ParceiroFlow" SET "id" = $1 WHERE "id" = $2`, `novo-${sufixo}`, A.id),
    ).rejects.toThrow(/parceiroId é imutável/);
  });

  it('prisma do portal: modelo de tenant estoura também dentro de $transaction', async () => {
    const portal = travarTenant(db);
    await expect(portal.loja.findMany()).rejects.toThrow(ErroDeTenant);
    await expect(portal.$transaction(async (tx) => tx.loja.findMany())).rejects.toThrow(ErroDeTenant);
    await expect(portal.$transaction([portal.insumo.count()])).rejects.toThrow(ErroDeTenant);
    // O resto do portal segue normal.
    expect(await portal.parceiroFlow.count({ where: { id: A.id } })).toBe(1);
  });

  it('farol: 5 faixas por linha × canal; canal nulo (rede) também não repete cor', async () => {
    const a = doParceiro(A.id, db);
    const cmv = await a.dreLinha.create({ data: { parceiroId: A.id, nome: 'CMV', grupo: 'CMV', sentido: 'MENOR_MELHOR' } });
    const faixa = { parceiroId: A.id, linhaId: cmv.id, cor: 'VERDE' as const, desvioMinimoBp: 0 };
    await a.farolFaixa.create({ data: { ...faixa, canal: null } });
    await expect(a.farolFaixa.create({ data: { ...faixa, canal: null, desvioMinimoBp: 50 } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await a.farolFaixa.create({ data: { ...faixa, canal: 'IFOOD' } });
    await expect(a.farolFaixa.create({ data: { ...faixa, canal: 'IFOOD' } })).rejects.toMatchObject({ code: 'P2002' });
    // Faixa de B não aponta linha de A (FK composta).
    await expect(
      doParceiro(B.id, db).farolFaixa.create({ data: { ...faixa, parceiroId: B.id, canal: 'LOJA' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // Meta de rede (canal nulo) também é única por vigência.
    const meta = { parceiroId: A.id, linhaId: cmv.id, percentualBp: 3000, vigenteDesde: new Date('2026-10-01') };
    await a.dreMeta.create({ data: meta });
    await expect(a.dreMeta.create({ data: meta })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('produto sem marca não repete nome; despesa importada exige chave idempotente', async () => {
    const a = doParceiro(A.id, db);
    const ficha = await a.fichaTecnica.findFirstOrThrow({ where: { nome: 'Burger A' } });
    await a.produtoVenda.create({ data: { parceiroId: A.id, nome: 'X-Burger', fichaId: ficha.id } });
    await expect(
      a.produtoVenda.create({ data: { parceiroId: A.id, nome: 'X-Burger', fichaId: ficha.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const linha = await a.dreLinha.create({ data: { parceiroId: A.id, nome: 'Aluguel', grupo: 'OCUPACAO' } });
    const desp = {
      parceiroId: A.id, linhaId: linha.id, descricao: 'Aluguel out', competencia: new Date('2026-10-05'),
      valorCentavos: 500000, origem: 'IMPORTACAO' as const,
    };
    await expect(a.despesa.create({ data: desp })).rejects.toThrow();
    await a.despesa.create({ data: { ...desp, chaveIdempotencia: 'planilha:out:linha7' } });
    await expect(
      a.despesa.create({ data: { ...desp, chaveIdempotencia: 'planilha:out:linha7' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
