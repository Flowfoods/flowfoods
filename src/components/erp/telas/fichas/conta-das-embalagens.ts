/**
 * Embalagens por canal → preço, sem sair da tela (Ficha primeiro, 02/11/2026). Enquanto a pessoa ajusta as embalagens de
 * Delivery próprio e iFood, a tela mostra a meta de CMV, a sugestão pela meta, o preço já escolhido e o CMV a esse preço.
 *
 * Não há conta nova: as embalagens que estão na tela (ainda não salvas) entram no MESMO `cmvDoCanal` do detalhe, com o
 * custo de referência que o servidor também usa (`custoDoInsumo` → último preço pago). Só leitura: o preço continua
 * sendo escolhido no passo de preços, e salvar embalagens não movimenta estoque (custo previsto não é uso real).
 *
 * Regras fixas: Delivery próprio = receita + embalagens, sem taxa; iFood = receita + embalagens, e a taxa sobre o preço
 * fica FORA do custo físico, da sugestão e do CMV (o resultado P − C − tP é do passo de preços, nunca "lucro"). Taxa
 * ausente não vira zero porque aqui ela não entra em conta nenhuma.
 */

import type { CanalComEmbalagem } from '@/lib/erp/canal-campos';
import { cmvDoCanal, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import type { CustoExato, Fracao, Unidade } from '@/lib/erp/unidades';

/** O que a ficha já tem para o canal: lido no servidor junto com as embalagens (quem chega aqui tem `precos.ver`). */
export interface PrecoDoCanalNaFicha {
  metaBp: number | null;
  /** Preço DEFINIDO pela pessoa; null = não definido (a sugestão não é preço). */
  precoCentavos: number | null;
  /** N.3: o prato é vendido neste canal. */
  ofertado: boolean;
}

export type PrecosDasEmbalagens = Record<CanalComEmbalagem, PrecoDoCanalNaFicha>;

/** Uma linha válida da tela: embalagem escolhida e quantidade lida (em milésimos da unidade). */
export interface EmbalagemNaTela {
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  /** Custo de referência (o mesmo que o formulário recebe); null = sem custo informado. */
  custo: CustoExato | null;
}

/** A conta do canal sem o resultado: aqui não se mostra P − C − tP (é do passo de preços, com a taxa). */
export type ContaDasEmbalagens = Omit<CmvDoCanal, 'resultado'>;

/** Meta, preço e oferta dos dois canais com embalagem, a partir da conta que a página já leu. Faltou canal: null. */
export function precosDasEmbalagens(cmv: readonly Pick<CmvDoCanal, 'canal' | 'metaBp' | 'precoCentavos' | 'ofertado'>[]): PrecosDasEmbalagens | null {
  const de = (canal: CanalComEmbalagem): PrecoDoCanalNaFicha | null => {
    const x = cmv.find((c) => c.canal === canal);
    return x ? { metaBp: x.metaBp, precoCentavos: x.precoCentavos, ofertado: x.ofertado } : null;
  };
  const delivery = de('DELIVERY_PROPRIO');
  const ifood = de('IFOOD');
  return delivery && ifood ? { DELIVERY_PROPRIO: delivery, IFOOD: ifood } : null;
}

export function contaDasEmbalagensNaTela(p: {
  canal: CanalComEmbalagem;
  /** Custo de uma porção da receita salva (a parte conhecida, se faltar preço). */
  porcao: Fracao;
  faltaPreco: readonly string[];
  embalagens: readonly EmbalagemNaTela[];
  preco: PrecoDoCanalNaFicha;
}): ContaDasEmbalagens {
  // O resultado calculado aqui não tem a taxa: fica de fora para não escapar daqui.
  const { resultado: _semTaxa, ...conta } = cmvDoCanal(
    {
      canal: p.canal,
      custoDaFicha: { porRendimento: p.porcao, faltaPreco: [...p.faltaPreco] },
      embalagens: p.embalagens.map((e, n) => ({
        insumoId: `tela-${n}`,
        nome: e.nome,
        unidade: e.unidade,
        quantidadeMilesimos: e.quantidadeMilesimos,
        // `custoDoInsumo` devolve o último preço pago quando há; sem ele, embalagem zerada = sem custo (nunca R$ 0,00).
        insumo: { ultimaCompra: e.custo, precoEmbalagemCentavos: 0, taxaEntregaCentavos: 0, conteudoMilesimos: 0 },
      })),
      taxa: null,
    },
    { metaBp: p.preco.metaBp, precoCentavos: p.preco.precoCentavos, ofertado: p.preco.ofertado },
  );
  return conta;
}
