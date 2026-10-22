import { deSeguro } from '@/lib/erp/insumo-campos';

/**
 * L.1: o "de onde eu vim" que os formulários de insumo mandam (`de` = a lista como estava; `origem=lista` = a caneta da linha).
 * Dado de fora: só os filtros que a lista conhece sobrevivem (`deSeguro`), e o destino é sempre a lista do próprio `base`.
 */
export function retornoDaLista(form: FormData): { de: string; aLista: boolean } {
  return { de: deSeguro(form.get('de')), aLista: form.get('origem') === 'lista' };
}
