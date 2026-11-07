/** Continuação opcional depois de uma gravação confirmada, nas rotas existentes. */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { concluir, type ResultadoDeCadastro } from '../cadastro/executar';
import type { EstadoCadastro } from '../cadastro/estado';

export function concluirEtapaDaFicha(
  r: ResultadoDeCadastro,
  anterior: EstadoCadastro,
  base: string,
  feito: { mudou: string; igual?: string },
  etapa: 'embalagens' | 'precos' | null,
  retorno?: { de: string; voltarAEdicao?: boolean },
): EstadoCadastro {
  if (r.ok && retorno?.voltarAEdicao) {
    revalidatePath(base, 'layout');
    const busca = new URLSearchParams({ feito: r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou });
    if (retorno.de) busca.set('de', retorno.de);
    redirect(`${base}/${r.id}/editar?${busca}`);
  }
  if (!r.ok || !etapa) return concluir(r, anterior, base, feito, undefined, undefined, 'insumo', retorno ? { de: retorno.de, aLista: false } : undefined);
  revalidatePath(base, 'layout');
  const frase = r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou;
  const busca = new URLSearchParams({ feito: frase });
  if (retorno?.de) busca.set('de', retorno.de);
  // Next 14 pode retirar o hash do redirect de uma Server Action com Flight.
  // O marcador conserva a intenção até o bloco de preços montar no cliente.
  if (etapa === 'precos') busca.set('etapa', 'precos');
  // O formulário escolhe uma etapa conhecida; nunca fornece endereço de retorno.
  const destino = etapa === 'embalagens' ? `${r.id}/canais?${busca}` : `${r.id}?${busca}#preco-por-canal`;
  redirect(`${base}/${destino}`);
}
