import { LIMITES_DO_CANAL, type CanalComEmbalagem } from './canal-campos';
import type { LinhaMaterialDaFicha } from './ficha-unificada-campos';

/** Copiar adiciona os itens ausentes; nunca substitui quantidades já ajustadas no destino. */
export function planejarCopiaEmbalagens<T extends LinhaMaterialDaFicha>(
  linhas: readonly T[], destino: CanalComEmbalagem, ativas: ReadonlySet<string>,
) {
  const origem: CanalComEmbalagem = destino === 'IFOOD' ? 'DELIVERY_PROPRIO' : 'IFOOD';
  const presentes = new Set(linhas.filter(l => l.canal === destino).map(l => l.insumoId));
  const novas: LinhaMaterialDaFicha[] = [];
  for (const l of linhas) {
    if (l.canal !== origem || !ativas.has(l.insumoId) || presentes.has(l.insumoId)) continue;
    presentes.add(l.insumoId);
    novas.push({ canal: destino, insumoId: l.insumoId, quantidade: l.quantidade, unidade: l.unidade });
  }
  // Só a linha inicial intacta pode ceder lugar à cópia. Rascunhos parciais são preservados.
  const manter = novas.length ? linhas.filter(l => !(l.canal === destino && !l.insumoId && l.quantidade === '1' && l.unidade === 'un')) : [...linhas];
  const excedeLimite = manter.filter(l => l.canal === destino).length + novas.length > LIMITES_DO_CANAL.embalagens;
  return { origem, novas, manter, excedeLimite };
}
