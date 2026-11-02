/**
 * Ficha técnica no papel (N.5 + decisão de 31/10/2026): só o que a impressão usa. A tela de impressão é componente de
 * cliente, então tudo o que ela recebe chega ao navegador — histórico (autores, antes e depois), usos em outras fichas,
 * fotos de apoio e o custo de cada insumo do pré-preparo não entram. Os valores (`custo`, `itens[].custo`) só existem
 * na versão com preços e custos, que vem de `fichaNaTela(…, true)` depois da escolha explícita.
 */

import type { FichaNaTela } from './fichas';

export function fichaNoPapel(f: FichaNaTela) {
  return {
    id: f.id,
    nome: f.nome,
    tipo: f.tipo,
    ativa: f.ativa,
    versao: f.versao,
    descricao: f.descricao,
    rendimentoMilesimos: f.rendimentoMilesimos,
    unidadeRendimento: f.unidadeRendimento,
    validades: f.validades,
    consumoImediato: f.consumoImediato,
    foto: f.foto,
    passosPreparo: f.passosPreparo,
    modoPreparo: f.modoPreparo,
    verCustos: f.verCustos,
    custo: f.custo,
    itens: f.itens.map((i) => ({
      id: i.id,
      nome: i.nome,
      /** Só se é pré-preparo: a composição e os custos dele não vão ao papel. */
      preparo: i.preparo !== null,
      quantidadeMilesimos: i.quantidadeMilesimos,
      unidade: i.unidade,
      fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos,
      custo: i.custo,
    })),
  };
}

export type FichaNoPapel = ReturnType<typeof fichaNoPapel>;
