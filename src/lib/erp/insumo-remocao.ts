/**
 * L.1 — Remover insumo: o que está LIGADO a ele. Regra pura de frase + a leitura dos vínculos (uma consulta por tipo, dentro do
 * contexto do parceiro). Quem apaga é `excluirInsumo` (insumos.ts), que lê isto de novo DENTRO da transação, com a linha travada.
 *
 * Princípio: com qualquer vínculo o insumo só se DESATIVA (some da lista padrão e da busca; ficha, nota, estoque, produção e
 * histórico seguem exatamente como estão). Excluir de vez só quando nada, em lugar nenhum, aponta para ele. Os movimentos de
 * estoque e as fichas nunca são apagados nem invalidados por esta tela.
 */

import type { ClienteDoParceiro } from './tenant';

export type ChaveDeVinculo =
  | 'fichas'
  | 'embalagensDePrato'
  | 'notas'
  | 'documentos'
  | 'memoria'
  | 'saldos'
  | 'movimentos'
  | 'contagens'
  | 'retratos'
  | 'requisicoes'
  | 'producao'
  | 'etiquetas'
  | 'embalagens'
  | 'custoNoHistorico';

export interface VinculoDoInsumo {
  chave: ChaveDeVinculo;
  n: number;
  /** A frase para quem não programa: "usado em 3 fichas técnicas". */
  frase: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Chave -> frase. Uma só fonte: a tela e a mensagem de recusa dizem as mesmas palavras. */
const FRASE_DO_VINCULO: Record<ChaveDeVinculo, (n: number) => string> = {
  fichas: (n) => `Usado em ${plural(n, 'ficha técnica', 'fichas técnicas')}`,
  embalagensDePrato: (n) => `Na embalagem de ${plural(n, 'prato', 'pratos')} (custo por canal)`,
  notas: (n) => `${plural(n, 'item', 'itens')} de notas de compra (é daqui que vem o histórico de preço pago)`,
  documentos: (n) => `${plural(n, 'item', 'itens')} de notas fiscais recebidas por XML`,
  memoria: (n) => `${plural(n, 'código', 'códigos')} de fornecedor lembrado${n === 1 ? '' : 's'} para as próximas notas fiscais`,
  saldos: (n) => `${plural(n, 'saldo', 'saldos')} de estoque`,
  movimentos: (n) => `${plural(n, 'movimento', 'movimentos')} de estoque (entradas, saídas, perdas, ajustes)`,
  contagens: (n) => `${plural(n, 'item', 'itens')} de contagem de estoque`,
  retratos: (n) => `${plural(n, 'linha', 'linhas')} do estoque guardado em abertura ou fechamento`,
  requisicoes: (n) => `${plural(n, 'item', 'itens')} de requisição`,
  producao: (n) => `${plural(n, 'lote', 'lotes')} de produção deste item`,
  etiquetas: (n) => `${plural(n, 'etiqueta', 'etiquetas')}`,
  embalagens: (n) => `${plural(n, 'outra embalagem', 'outras embalagens')} de compra cadastrada${n === 1 ? '' : 's'}`,
  custoNoHistorico: (n) => `${plural(n, 'mudança', 'mudanças')} de custo no histórico do insumo`,
};

export interface VinculosDoInsumo {
  vinculos: VinculoDoInsumo[];
  /** Soma de tudo (0 = nada aponta para o insumo: dá para excluir de vez). */
  total: number;
  /** Pré-preparo: nasce e muda pela ficha técnica; não se remove por aqui. */
  preparo: { fichaId: string; nome: string } | null;
}

/** As frases dos vínculos de uma recusa: "usado em 2 fichas técnicas; 3 movimentos de estoque". */
export function resumoDosVinculos(v: readonly VinculoDoInsumo[]): string {
  return v.map((x) => x.frase.charAt(0).toLowerCase() + x.frase.slice(1)).join('; ');
}

/**
 * Lê os vínculos AGORA. Cada contagem é do parceiro do cliente (o portão e a RLS), nunca de outro. Fora de transação serve à tela;
 * dentro da transação com a linha travada (`FOR UPDATE`) é a conferência que decide a exclusão.
 */
export async function vinculosDoInsumo(tx: ClienteDoParceiro, id: string): Promise<VinculosDoInsumo | null> {
  const i = await tx.insumo.findUnique({
    where: { id },
    select: {
      fichaQueProduz: { select: { id: true, nome: true } },
      _count: {
        select: {
          variantes: true,
          usosComoEmbalagem: true,
          notaItens: true,
          documentoItens: true,
          vinculosDeItem: true,
          saldos: true,
          movimentos: true,
          contagemItens: true,
          retratos: true,
          requisicaoItens: true,
          producoes: true,
          etiquetas: true,
        },
      },
    },
  });
  if (!i) return null;
  // Fichas: quantas FICHAS (não linhas) usam o insumo. Ficha desativada continua contando: ela segue válida.
  const fichas = await tx.sql<{ n: number }>`
    SELECT count(DISTINCT "fichaId")::int AS "n" FROM "FichaItem" WHERE "parceiroId" = ${tx.parceiroId} AND "insumoId" = ${id}`;
  // Custo no histórico: uma alteração do insumo que mexeu em custo, embalagem ou frete (as chaves só entram em `depois` se mudaram).
  const custo = await tx.sql<{ n: number }>`
    SELECT count(*)::int AS "n" FROM "HistoricoAlteracao"
    WHERE "parceiroId" = ${tx.parceiroId} AND "entidade" = 'Insumo' AND "entidadeId" = ${id} AND "acao" = 'ALTEROU'
      AND jsonb_exists_any("depois", ARRAY['precoEmbalagemCentavos', 'taxaEntregaCentavos', 'custoPorUnidade', 'custoPorUnidadeCentavos']::text[])`;
  const c = i._count;
  const contagens: Record<ChaveDeVinculo, number> = {
    fichas: fichas[0]?.n ?? 0,
    embalagensDePrato: c.usosComoEmbalagem,
    notas: c.notaItens,
    documentos: c.documentoItens,
    memoria: c.vinculosDeItem,
    saldos: c.saldos,
    movimentos: c.movimentos,
    contagens: c.contagemItens,
    retratos: c.retratos,
    requisicoes: c.requisicaoItens,
    producao: c.producoes,
    etiquetas: c.etiquetas,
    embalagens: c.variantes,
    custoNoHistorico: custo[0]?.n ?? 0,
  };
  const vinculos = (Object.keys(contagens) as ChaveDeVinculo[])
    .filter((k) => contagens[k] > 0)
    .map((k) => ({ chave: k, n: contagens[k], frase: FRASE_DO_VINCULO[k](contagens[k]) }));
  return {
    vinculos,
    total: vinculos.reduce((s, v) => s + v.n, 0),
    preparo: i.fichaQueProduz ? { fichaId: i.fichaQueProduz.id, nome: i.fichaQueProduz.nome } : null,
  };
}

export interface InsumoParaRemover extends VinculosDoInsumo {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: string;
  categoria: string | null;
}

/** A tela "Remover insumo": o insumo e o que está ligado a ele, lidos na mesma transação. null = não existe (para este parceiro). */
export async function lerRemocao(cliente: ClienteDoParceiro, id: string): Promise<InsumoParaRemover | null> {
  return cliente.transacao(async (tx) => {
    const i = await tx.insumo.findUnique({ where: { id }, select: { id: true, nome: true, ativo: true, tipo: true, categoria: { select: { nome: true } } } });
    if (!i) return null;
    const v = await vinculosDoInsumo(tx, id);
    if (!v) return null;
    return { ...v, id: i.id, nome: i.nome, ativo: i.ativo, tipo: i.tipo, categoria: i.categoria?.nome ?? null };
  });
}
