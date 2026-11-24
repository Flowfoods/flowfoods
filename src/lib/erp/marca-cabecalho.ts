/** Preferência visual, separada da visão de lojas e dos filtros de dados. */
export const COOKIE_MARCA_CABECALHO = 'ff_marca_cabecalho';

export interface MarcaDoCabecalho { id: string; nome: string; logoUrl: string | null }
export interface IdentidadeDoCabecalho {
  parceiroId: string;
  nomeParceiro: string;
  marcas: MarcaDoCabecalho[];
  selecionada: string | null;
  perfilHref: string | null;
  /**
   * Decisão 536: de onde o atalho "Trocar logo da marca" do cabeçalho envia a imagem (`${logoBase}/${id}/logo`, a MESMA rota
   * da Identidade visual). Null = quem está vendo não pode alterar a logo (sem `lojas.gerir` ou parceiro bloqueado): o atalho
   * nem aparece. Só esconde; quem decide de novo é a rota, que confere sessão, origem e permissão antes de ler o arquivo.
   */
  logoBase: string | null;
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
