/** Fixtures sintéticas compartilhadas pelos testes DB de 3C; não escolhem o contrato moderno. */
import type { PrismaClient } from '@prisma/client';
import type { EntradaDaFicha } from '@/lib/erp/ficha-campos';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste } from './erp-db-apoio';

export async function catalogo3c(db: PrismaClient, parceiros: string[]) {
  const parceiro = await db.parceiroFlow.create({ data: { nome: 'Receita e materiais sintéticos', slug: `ficha3c-${crypto.randomUUID()}`, status: 'ATIVO' } });
  parceiros.push(parceiro.id);
  const a = doParceiro(parceiro.id, db);
  async function insumo(nome: string, tipo: string, preco: string, semPreco = false) {
    const r = await cadastrarInsumoDeTeste(a, { nome, tipo, unidade: 'UN', escala: 'base', conteudo: '1', preco, ...(semPreco ? { semPreco: 'on' } : {}) });
    if (!r.ok) throw new Error(JSON.stringify(r)); return r.id;
  }
  const ingrediente = await insumo('Ingrediente de dez reais', 'INGREDIENTE', '10');
  const caixa = await insumo('Caixa de dois reais', 'EMBALAGEM', '2');
  const sacola = await insumo('Sacola de três reais', 'EMBALAGEM', '3');
  const semCusto = await insumo('Embalagem sem custo conhecido', 'EMBALAGEM', '', true);
  const material = await insumo('Material de limpeza', 'MATERIAL', '1');
  return { parceiro, a, ids: { ingrediente, caixa, sacola, semCusto, material } };
}

export type Catalogo3c = Awaited<ReturnType<typeof catalogo3c>>;

/** Dez unidades a R$10 / dez porções = R$10 de receita por porção. */
export function receita3c(c: Catalogo3c, extras: Partial<EntradaDaFicha> = {}): EntradaDaFicha {
  return {
    nome: 'Prato sintético', tipo: 'PRATO', rendimento: '10', descricao: 'Receita de teste',
    passos: ['Separar os ingredientes.', 'Misturar e servir.'], consumoImediato: 'sim',
    itens: [{ insumoId: c.ids.ingrediente, quantidade: '10', unidade: 'un', fator: '1' }],
    ...extras,
  };
}

/** Fotografia de todas as partes da operação e das estruturas que ela não pode alterar. */
export async function retrato3c(a: ClienteDoParceiro) {
  return a.transacao(async tx => {
    const [fichas, itens, produtos, materiais, precos, historico, secoes, subsecoes, saldos, movimentos] = await Promise.all([
      tx.fichaTecnica.findMany({ orderBy: { id: 'asc' } }),
      tx.fichaItem.findMany({ orderBy: { id: 'asc' } }),
      tx.produtoVenda.findMany({ orderBy: { id: 'asc' } }),
      tx.produtoEmbalagem.findMany({ orderBy: { id: 'asc' } }),
      tx.produtoCanal.findMany({ orderBy: { id: 'asc' } }),
      tx.historicoAlteracao.findMany({ orderBy: { id: 'asc' } }),
      tx.secaoFicha.findMany({ orderBy: { id: 'asc' } }),
      tx.subsecaoFicha.findMany({ orderBy: { id: 'asc' } }),
      tx.saldoEstoque.findMany({ orderBy: { id: 'asc' } }),
      tx.movimentoEstoque.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return { fichas, itens, produtos, materiais, precos, historico, secoes, subsecoes, saldos, movimentos };
  }, { repetivel: true });
}

/** Intercepta uma fronteira mantendo todos os delegates/SQL reais e a mesma transação interna. */
export function observarTransacao3c(a: ClienteDoParceiro, decorar: (tx: ClienteDoParceiro) => ClienteDoParceiro): ClienteDoParceiro {
  return { ...a, transacao: (fn, opcoes) => a.transacao(tx => {
    const interno = decorar(tx);
    const mesma: ClienteDoParceiro = { ...interno, transacao: f => f(mesma) };
    return fn(mesma);
  }, opcoes) };
}
