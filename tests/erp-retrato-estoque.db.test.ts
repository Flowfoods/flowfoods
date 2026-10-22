/**
 * ERP I.2a · o retrato do estoque POR INSUMO (Postgres real): toda abertura e todo fechamento de estoque concluídos a partir do deploy
 * gravam, na MESMA transação que os fecha, uma linha por insumo com saldo (quantidade, valor pelo custo de referência da hora, categoria
 * e tipo da hora). A soma dos valores é o `valorTotalCentavos` da contagem, ao centavo. Contagem antiga não é reconstruída.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-retrato-estoque.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { garantirCategoriasPadrao, listarCategorias } from '@/lib/erp/categorias';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura } from '@/lib/erp/estoque';
import { concluirContagem, iniciarCiclo, iniciarFechamento } from '@/lib/erp/contagem';
import { gravarRetrato, somaDoRetrato } from '@/lib/erp/retrato-estoque';
import { listarHistorico } from '@/lib/erp/historico';
import { travarParaFechar } from '@/lib/erp/periodo-trava';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { abertura, BRT, nota, R } from './erp-cmv-apoio';
import { cadastrarInsumoDeTeste as cadastrarInsumo, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DONA = () => resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

describe.skipIf(!URL_TESTE)('ERP I.2a · retrato do estoque por insumo (Postgres real)', { timeout: 240_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const criados: string[] = [];
  let A: { id: string };
  let a: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const cat: Record<string, string> = {};

  const retrato = (contagemId: string) => a.contagemRetratoItem.findMany({ where: { contagemId }, orderBy: { insumoId: 'asc' } });
  const soma = (linhas: { valorCentavos: number | null }[]) => linhas.reduce((s, l) => s + (l.valorCentavos ?? 0), 0);

  async function abrirLoja(cliente: ClienteDoParceiro, lojaId: string, contados: Record<string, string>, quando: Date) {
    expect((await iniciarAbertura(cliente, DONA(), lojaId, 'Marina', quando)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(cliente, DONA(), lojaId))!;
    for (const item of ab.itens) {
      const solto = contados[item.insumoId] ?? '0';
      expect((await contarItem(cliente, DONA(), lojaId, { itemId: item.id, embalagens: '', solto, escala: 'base', versao: item.versao }, 'Marina', { agora: quando })).ok).toBe(true);
    }
    const v = (await cliente.contagem.findFirst({ where: { lojaId, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    return concluirAbertura(cliente, DONA(), lojaId, { versao: v, confirmarNaoContados: true }, 'Marina', quando);
  }

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Retrato I2a', slug: `ret-${sufixo}`, status: 'ATIVO' } });
    criados.push(A.id);
    a = doParceiro(A.id, db);
    await garantirCategoriasPadrao(a);
    for (const c of await listarCategorias(a)) if (c.chave) cat[c.chave] = c.id;
    const l = await cadastrarLoja(a, { nome: 'Loja do retrato' }, 'Marina');
    if (!l.ok) throw new Error(JSON.stringify(l));
    ids.loja = l.id;
    await a.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    const novo = async (chave: string, nome: string, tipo: string, semPreco = false) => {
      const r = await cadastrarInsumo(a, { tipo, escala: 'base', nome, unidade: 'KG', conteudo: '1', ...(semPreco ? { semPreco: 'on' } : { preco: '10,00' }), conservacao: 'SECO', categoriaId: cat[chave] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[nome] = r.id;
    };
    await novo('PROTEINA', 'Frango', 'INGREDIENTE');
    await novo('HORTIFRUTI', 'Tomate', 'INGREDIENTE', true);
    await novo('LIMPEZA', 'Detergente', 'MATERIAL');
    await novo('MERCEARIA', 'Farinha', 'INGREDIENTE');
    await novo('BEBIDAS', 'Suco', 'INGREDIENTE');
  });

  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, criados);
      await db.$disconnect();
    }
  });

  it('a abertura grava o retrato na mesma transação: uma linha por insumo com saldo, valor nulo sem preço, soma = total ao centavo, categoria e tipo da hora', async () => {
    const quando = new Date('2026-09-01T13:00:00Z');
    const r = await abrirLoja(a, ids.loja, { [ids.Frango]: '4', [ids.Tomate]: '3', [ids.Detergente]: '2', [ids.Farinha]: '0' }, quando);
    expect(r.ok).toBe(true);
    const c = (await a.contagem.findFirst({ where: { lojaId: ids.loja, tipo: 'ABERTURA' } }))!;
    ids.abertura = c.id;
    expect(c.status).toBe('FECHADA');
    expect(c.retratoGravadoEm).not.toBeNull();
    const linhas = await retrato(c.id);
    // Frango, Tomate e Detergente têm saldo; Farinha (zero) e Suco (não contado, entra com zero) não entram.
    expect(linhas.map((l) => l.insumoId).sort()).toEqual([ids.Frango, ids.Tomate, ids.Detergente].sort());
    const por = Object.fromEntries(linhas.map((l) => [l.insumoId, l]));
    expect(por[ids.Frango]).toMatchObject({ quantidadeMilesimos: 4000, valorCentavos: 4000, categoriaIdNaHora: cat.PROTEINA, tipoNaHora: 'INGREDIENTE' });
    expect(por[ids.Tomate]).toMatchObject({ quantidadeMilesimos: 3000, valorCentavos: null, categoriaIdNaHora: cat.HORTIFRUTI });
    expect(por[ids.Detergente]).toMatchObject({ quantidadeMilesimos: 2000, valorCentavos: 2000, categoriaIdNaHora: cat.LIMPEZA, tipoNaHora: 'MATERIAL' });
    expect(soma(linhas)).toBe(c.valorTotalCentavos);
    expect(c.valorTotalCentavos).toBe(6000);
    expect(c.itensSemPreco).toBe(1);
    // O histórico conta quantos insumos o retrato guardou.
    const h = await listarHistorico(a, { entidade: 'Contagem', verPrecos: true, limite: 10 });
    expect(JSON.stringify(h)).toContain('estoque guardado por insumo');
  });

  it('concluir a abertura de novo não duplica nada (a segunda aplicação é "já feita")', async () => {
    const antes = await a.contagemRetratoItem.count({ where: { contagemId: ids.abertura } });
    const v = (await a.contagem.findUnique({ where: { id: ids.abertura }, select: { versao: true } }))!.versao;
    expect(await concluirAbertura(a, DONA(), ids.loja, { versao: v, confirmarNaoContados: true }, 'Marina', new Date('2026-09-01T14:00:00Z'))).toMatchObject({ ok: true, jaFeito: true });
    expect(await a.contagemRetratoItem.count({ where: { contagemId: ids.abertura } })).toBe(antes);
  });

  it('reclassificar o insumo depois não mexe no retrato: ele guarda a categoria DA HORA', async () => {
    await a.insumo.update({ where: { id: ids.Frango }, data: { categoriaId: cat.MERCEARIA } });
    const linha = (await retrato(ids.abertura)).find((l) => l.insumoId === ids.Frango)!;
    expect(linha.categoriaIdNaHora).toBe(cat.PROTEINA);
    await a.insumo.update({ where: { id: ids.Frango }, data: { categoriaId: cat.PROTEINA } });
  });

  it('a cíclica não grava retrato (é um pedaço do estoque, não o estoque): retratoGravadoEm fica nulo', async () => {
    const quando = new Date('2026-09-10T15:00:00Z');
    const ini = await iniciarCiclo(a, DONA(), ids.loja, { insumoIds: [ids.Frango], titulo: '' }, 'Marina', quando);
    if (!ini.ok) throw new Error(JSON.stringify(ini));
    const v = (await a.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } }))!.versao;
    expect((await concluirContagem(a, DONA(), ids.loja, ini.id, { versao: v, confirmarNaoContados: true }, 'Marina', quando)).ok).toBe(true);
    const c = (await a.contagem.findUnique({ where: { id: ini.id } }))!;
    expect(c.status).toBe('FECHADA');
    expect(c.retratoGravadoEm).toBeNull();
    expect(await a.contagemRetratoItem.count({ where: { contagemId: ini.id } })).toBe(0);
  });

  it('o fechamento grava o retrato do estoque inteiro de agora (o saldo do livro de cada insumo), soma = total, idempotente', async () => {
    // Entra uma nota de Farinha e de Suco antes do fechamento: o retrato pega o saldo do livro, não só o que foi contado.
    await nota(a, ids.Farinha, { lojaId: ids.loja, numero: 'F1', data: '2026-09-12', centavos: R(30), lancadaEm: BRT('2026-09-12', '12:00'), movimenta: true });
    await nota(a, ids.Suco, { lojaId: ids.loja, numero: 'F2', data: '2026-09-13', centavos: R(50), lancadaEm: BRT('2026-09-13', '12:00'), movimenta: true });
    const agora = new Date('2026-09-30T15:00:00Z');
    const ini = await iniciarFechamento(a, DONA(), ids.loja, { inicio: '2026-09-01' }, 'Marina', agora);
    if (!ini.ok) throw new Error(JSON.stringify(ini));
    ids.fechamento = ini.id;
    const v = (await a.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } }))!.versao;
    const r = await concluirContagem(a, DONA(), ids.loja, ini.id, { versao: v, confirmarNaoContados: true }, 'Marina', agora);
    expect(r.ok).toBe(true);
    const c = (await a.contagem.findUnique({ where: { id: ini.id } }))!;
    expect(c).toMatchObject({ status: 'FECHADA', desfecho: 'APLICADA' });
    expect(c.retratoGravadoEm).not.toBeNull();
    const linhas = await retrato(ini.id);
    const saldos = await a.saldoEstoque.findMany({ where: { lojaId: ids.loja, quantidadeMilesimos: { gt: 0 } } });
    expect(linhas.map((l) => [l.insumoId, l.quantidadeMilesimos]).sort()).toEqual(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos]).sort());
    expect(linhas.length).toBeGreaterThanOrEqual(4);
    expect(soma(linhas)).toBe(c.valorTotalCentavos);
    expect(c.itensSemPreco).toBe(linhas.filter((l) => l.valorCentavos === null).length);
    expect(linhas.find((l) => l.insumoId === ids.Tomate)!.valorCentavos).toBeNull();
    // De novo: já feito, nada duplica.
    const v2 = (await a.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } }))!.versao;
    expect(await concluirContagem(a, DONA(), ids.loja, ini.id, { versao: v2, confirmarNaoContados: true }, 'Marina', agora)).toMatchObject({ ok: true, jaFeito: true });
    expect(await a.contagemRetratoItem.count({ where: { contagemId: ini.id } })).toBe(linhas.length);
  });

  it('abertura sem nenhum saldo: o retrato é vazio e a contagem diz que foi gravado (nulo é "antes da I.2", não "vazio")', async () => {
    const l = await cadastrarLoja(a, { nome: 'Loja vazia' }, 'Marina');
    if (!l.ok) throw new Error(JSON.stringify(l));
    const r = await abrirLoja(a, l.id, {}, new Date('2026-09-02T13:00:00Z'));
    expect(r.ok).toBe(true);
    const c = (await a.contagem.findFirst({ where: { lojaId: l.id, tipo: 'ABERTURA' } }))!;
    expect(c.valorTotalCentavos).toBe(0);
    expect(c.retratoGravadoEm).not.toBeNull();
    expect(await a.contagemRetratoItem.count({ where: { contagemId: c.id } })).toBe(0);
  });

  it('a contagem de antes da I.2 não tem retrato e nunca ganha (fechada não muda): `retratoGravadoEm` nulo', async () => {
    const l = await a.loja.create({ data: { parceiroId: A.id, nome: 'Loja antiga', slug: `antiga-${sufixo}` } });
    const antiga = await abertura(a, l.id, new Date('2026-09-01T13:00:00Z'), 100);
    expect(antiga.retratoGravadoEm).toBeNull();
    await expect(a.contagem.update({ where: { id: antiga.id }, data: { retratoGravadoEm: new Date() } })).rejects.toThrow(/fechada não muda|fotografia/i);
  });

  // ------------------------------------------------------------ o banco
  describe('o banco guarda o retrato (SQL cru, até como o papel do tenant)', () => {
    it('só inclusão: UPDATE, DELETE e TRUNCATE são recusados', async () => {
      const uma = (await a.contagemRetratoItem.findFirst({ where: { contagemId: ids.abertura } }))!;
      await expect(cru(db, perfil, A.id, `UPDATE "ContagemRetratoItem" SET "quantidadeMilesimos" = 1 WHERE "id" = $1`, uma.id)).rejects.toThrow(/só se inclui|permission denied/);
      await expect(cru(db, perfil, A.id, `DELETE FROM "ContagemRetratoItem" WHERE "id" = $1`, uma.id)).rejects.toThrow(/só se inclui|permission denied/);
      await expect(cru(db, perfil, A.id, `TRUNCATE "ContagemRetratoItem"`)).rejects.toThrow(/só se inclui|permission denied/);
      expect(await a.contagemRetratoItem.count({ where: { id: uma.id } })).toBe(1);
    });

    it('só entra enquanto a contagem de abertura ou fechamento está sendo concluída: contagem fechada e cíclica recusam', async () => {
      const insere = (contagemId: string) =>
        cru(db, perfil, A.id, `INSERT INTO "ContagemRetratoItem" ("id","parceiroId","contagemId","insumoId","tipoNaHora","quantidadeMilesimos","valorCentavos") VALUES ($1, $2, $3, $4, 'INGREDIENTE', 1000, 10)`, `x${Math.random().toString(36).slice(2)}`, A.id, contagemId, ids.Suco);
      await expect(insere(ids.abertura)).rejects.toThrow(/contagem de abertura ou de fechamento que está sendo concluída/);
      const ciclica = (await a.contagem.findFirst({ where: { tipo: 'CICLICA', lojaId: ids.loja } }))!;
      await expect(insere(ciclica.id)).rejects.toThrow(/contagem de abertura ou de fechamento que está sendo concluída/);
    });

    it('a contagem só registra `retratoGravadoEm` com a soma igual ao total, ao centavo (o gatilho é o teste mutante da conta)', async () => {
      // Uma abertura aberta, com um retrato que NÃO bate com o valor que vai fotografar: o fechamento da contagem falha, e nada fica.
      const l = await cadastrarLoja(a, { nome: 'Loja da soma' }, 'Marina');
      if (!l.ok) throw new Error(JSON.stringify(l));
      expect((await iniciarAbertura(a, DONA(), l.id, 'Marina', new Date('2026-09-03T13:00:00Z'))).ok).toBe(true);
      const c = (await a.contagem.findFirst({ where: { lojaId: l.id, tipo: 'ABERTURA' } }))!;
      await expect(
        a.transacao(async (tx) => {
          await tx.contagemRetratoItem.create({ data: { parceiroId: A.id, contagemId: c.id, insumoId: ids.Suco, tipoNaHora: 'INGREDIENTE', quantidadeMilesimos: 1000, valorCentavos: 500 } });
          await tx.contagem.update({ where: { id: c.id }, data: { status: 'FECHADA', desfecho: 'APLICADA', fechadaEm: new Date(), valorTotalCentavos: 999, retratoGravadoEm: new Date() } });
        }),
      ).rejects.toThrow(/não é o valor total da contagem/);
      expect(await a.contagemRetratoItem.count({ where: { contagemId: c.id } })).toBe(0);
      expect((await a.contagem.findUnique({ where: { id: c.id } }))!.status).toBe('ABERTA');
      // E a conta em código também recusa antes de gravar.
      await expect(a.transacao((tx) => gravarRetrato(tx, c.id, [{ insumoId: ids.Suco, quantidadeMilesimos: 1000, valorCentavos: 500 }], 999))).rejects.toThrow(/não é o valor total/);
      // Bater, bate: a soma certa fecha.
      await a.transacao(async (tx) => {
        await gravarRetrato(tx, c.id, [{ insumoId: ids.Suco, quantidadeMilesimos: 1000, valorCentavos: 500 }], 500);
        await tx.contagem.update({ where: { id: c.id }, data: { status: 'FECHADA', desfecho: 'APLICADA', fechadaEm: new Date(), valorTotalCentavos: 500, retratoGravadoEm: new Date() } });
      });
      expect(somaDoRetrato(await retrato(c.id))).toBe(500);
    });

    it('`retratoGravadoEm` só vale em contagem FECHADA de abertura ou de fechamento (CHECK)', async () => {
      const ciclica = (await a.contagem.findFirst({ where: { tipo: 'CICLICA', lojaId: ids.loja } }))!;
      await expect(cru(db, perfil, A.id, `UPDATE "Contagem" SET "retratoGravadoEm" = now() WHERE "id" = $1`, ciclica.id)).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------ a trava
  it('o retrato espera a trava do período (teste mutante): com `travarParaFechar` segura por outra transação, concluir o fechamento ESPERA; solta, termina e a soma continua igual ao total', async () => {
    const l = await cadastrarLoja(a, { nome: 'Loja da trava' }, 'Marina');
    if (!l.ok) throw new Error(JSON.stringify(l));
    await a.loja.update({ where: { id: l.id }, data: { criadoEm: new Date('2026-01-10T12:00:00Z') } });
    expect((await abrirLoja(a, l.id, { [ids.Frango]: '5', [ids.Farinha]: '2' }, new Date('2026-10-01T13:00:00Z'))).ok).toBe(true);
    const agora = new Date('2026-10-31T15:00:00Z');
    const ini = await iniciarFechamento(a, DONA(), l.id, { inicio: '2026-10-01' }, 'Marina', agora);
    if (!ini.ok) throw new Error(JSON.stringify(ini));
    const v = (await a.contagem.findUnique({ where: { id: ini.id }, select: { versao: true } }))!.versao;
    let terminou = false;
    let concluindo!: Promise<unknown>;
    await a.transacao(async (tx) => {
      await travarParaFechar(tx); // quem fecha o DRE segura a trava exclusiva do período
      concluindo = concluirContagem(a, DONA(), l.id, ini.id, { versao: v, confirmarNaoContados: true }, 'Marina', agora).then((x) => ((terminou = true), x));
      await new Promise((r) => setTimeout(r, 900));
      expect(terminou).toBe(false); // sem a trava compartilhada o retrato já teria sido gravado em cima de um período que está fechando
      expect(await a.contagemRetratoItem.count({ where: { contagemId: ini.id } })).toBe(0);
    });
    expect(await concluindo).toMatchObject({ ok: true });
    const c = (await a.contagem.findUnique({ where: { id: ini.id } }))!;
    const linhas = await retrato(ini.id);
    expect(linhas.length).toBe(2);
    expect(soma(linhas)).toBe(c.valorTotalCentavos);
    expect(c.retratoGravadoEm).not.toBeNull();
  });
});
