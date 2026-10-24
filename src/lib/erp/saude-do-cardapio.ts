/**
 * Saúde do cardápio (24/10/2026, referência: "Ficha técnica completa" da
 * Nina): quantos pratos ativos estão prontos para decidir preço, por canal, e
 * o que falta nos outros — na ordem em que se resolve (custo → meta → preço).
 *
 * Usa as MESMAS contas da lista de fichas (`custosEmCascata` + `cmvDaLista`):
 * nenhuma fórmula nova. "Pronto" = CMV calculado ao preço definido (dentro ou
 * acima da meta). Canal não ofertado sai do denominador daquele canal. Só para
 * quem vê preços: a página decide; aqui não há permissão.
 */

import type { CanalVenda } from '@prisma/client';
import { ORDEM_DOS_CANAIS } from './canal-campos';
import { cmvDaLista } from './canais';
import type { CmvDoCanal } from './cmv-produto-campos';
import { custosEmCascata } from './ficha-custos';
import { custoIncompleto } from './ficha-campos';
import type { ClienteDoParceiro } from './tenant';

export interface SaudeDoCanal {
  canal: CanalVenda;
  /** Pratos ativos que vendem neste canal (o denominador). */
  ofertados: number;
  dentro: number;
  acima: number;
  /** Sem dados, pela primeira coisa que falta, na ordem de resolver. */
  semCusto: number;
  semMeta: number;
  semPreco: number;
}

export interface SaudeDoCardapio {
  pratos: number;
  /** Pratos com o custo dos ingredientes incompleto (falta preço de insumo). */
  custoIncompleto: number;
  canais: SaudeDoCanal[];
  /** Pratos com CMV calculado em todos os canais que oferecem. */
  prontos: number;
}

/** Pura: junta o CMV de cada prato. `cmv` = o que `cmvDaLista` devolve (por id). */
export function resumirSaude(pratos: readonly { id: string; custoCompleto: boolean }[], cmv: ReadonlyMap<string, readonly CmvDoCanal[]>): SaudeDoCardapio {
  const canais = new Map<CanalVenda, SaudeDoCanal>(ORDEM_DOS_CANAIS.map((c) => [c, { canal: c, ofertados: 0, dentro: 0, acima: 0, semCusto: 0, semMeta: 0, semPreco: 0 }]));
  let prontos = 0;
  for (const p of pratos) {
    const contas = cmv.get(p.id) ?? [];
    let todos = contas.some((x) => x.ofertado);
    for (const x of contas) {
      if (!x.ofertado || x.status === 'naoOfertado') continue;
      const s = canais.get(x.canal)!;
      s.ofertados++;
      if (x.status === 'dentro') s.dentro++;
      else if (x.status === 'acima') s.acima++;
      else {
        todos = false;
        if (!x.fisico.completo) s.semCusto++;
        else if (x.metaBp === null) s.semMeta++;
        else s.semPreco++;
      }
    }
    if (todos) prontos++;
  }
  return {
    pratos: pratos.length,
    custoIncompleto: pratos.filter((p) => !p.custoCompleto).length,
    canais: ORDEM_DOS_CANAIS.map((c) => canais.get(c)!),
    prontos,
  };
}

/** Lê os pratos ativos do parceiro (todos, não só a página) e resume. */
export async function saudeDoCardapio(cliente: ClienteDoParceiro): Promise<SaudeDoCardapio> {
  const base = await cliente.transacao(async (tx) => {
    const ids = (await tx.fichaTecnica.findMany({ where: { tipo: 'PRATO', ativa: true }, select: { id: true }, take: 5000 })).map((x) => x.id);
    if (ids.length === 0) return [];
    const c = await custosEmCascata(tx, ids);
    return ids.map((id) => ({ id, tipo: 'PRATO', custo: c.custo(id)! }));
  });
  if (base.length === 0) return resumirSaude([], new Map());
  const cmv = await cmvDaLista(cliente, base);
  return resumirSaude(
    base.map((b) => ({ id: b.id, custoCompleto: !custoIncompleto(b.custo) })),
    cmv,
  );
}
