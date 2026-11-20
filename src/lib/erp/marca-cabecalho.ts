/** Preferência visual, separada da visão de lojas e dos filtros de dados. */
export const COOKIE_MARCA_CABECALHO = 'ff_marca_cabecalho';

export interface MarcaDoCabecalho { id: string; nome: string; logoUrl: string | null }
export interface IdentidadeDoCabecalho {
  parceiroId: string;
  nomeParceiro: string;
  marcas: MarcaDoCabecalho[];
  selecionada: string | null;
  perfilHref: string | null;
}

export function escolherMarcaDoCookie(valor: string | undefined, escopo: string, marcas: MarcaDoCabecalho[]): string | null {
  try {
    const salvo: unknown = JSON.parse(valor ?? 'null');
    if (Array.isArray(salvo) && salvo[0] === escopo && marcas.some((m) => m.id === salvo[1])) return salvo[1];
  } catch { /* Cookie antigo ou inválido: usar uma marca disponível. */ }
  return marcas[0]?.id ?? null;
}

export function cookieDaMarca(escopo: string, marcaId: string): string {
  return JSON.stringify([escopo, marcaId]);
}
