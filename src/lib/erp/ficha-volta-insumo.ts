import { comDe, deSeguro } from './insumo-campos';
import { pode, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { caminhoDeVolta } from './volta';

/** Origem do link em “Onde é usado”: só o detalhe de um insumo, na mesma área. */
export function origemInsumoDaFicha(valor: unknown, raiz: string): { id: string; href: string } | null {
  const caminho = caminhoDeVolta(valor, `${raiz}/`, 2000);
  if (!caminho || typeof valor !== 'string') return null;
  const url = new URL(caminho, 'http://erp.interno');
  // Não aceitar atalhos normalizados pelo navegador (.., caminho codificado etc.).
  if (valor.split(/[?#]/)[0] !== url.pathname) return null;
  const prefixo = `${raiz}/insumos/`;
  if (!url.pathname.startsWith(prefixo)) return null;
  const id = url.pathname.slice(prefixo.length);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || id === 'novo') return null;
  const filtros = url.searchParams.getAll('de');
  if (filtros.length > 1) return null;
  // Nenhuma cadeia de voltas ou âncora recebida acompanha a navegação.
  return { id, href: `${comDe(`${prefixo}${id}`, deSeguro(filtros[0]))}#onde-e-usado` };
}

/** O id da URL não autoriza nada: existência é lida pelo cliente do parceiro, sem dados financeiros. */
export async function voltaDaFichaAoInsumo(valor: unknown, raiz: string, cliente: ClienteDoParceiro, alcance: Alcance): Promise<string | null> {
  if (!pode(alcance, 'insumos.ver')) return null;
  const origem = origemInsumoDaFicha(valor, raiz);
  if (!origem) return null;
  try {
    const insumo = await cliente.insumo.findUnique({ where: { id: origem.id }, select: { id: true } });
    return insumo?.id === origem.id ? origem.href : null;
  } catch {
    // A origem é opcional: indisponível, conserva o retorno habitual da ficha.
    return null;
  }
}
