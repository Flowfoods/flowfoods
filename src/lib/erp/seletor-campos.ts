/**
 * F4 — a busca do item na ficha (regras puras): acha pelo nome ou pela categoria, sem ligar para acento nem caixa,
 * e agrupa por categoria na ordem da casa. Cada palavra digitada precisa aparecer no nome ou na categoria
 * ("frango peito" acha "Peito de frango"; "hortifruti ceb" acha a cebola da categoria Hortifruti).
 */

export interface OpcaoDoSeletor {
  valor: string;
  nome: string;
  /** O título do grupo (categoria ou "Pré-preparos"). */
  grupo: string;
  /** Ordem do grupo (menor primeiro); empate pelo nome do grupo. */
  ordemDoGrupo: number;
  /** Complemento curto depois do nome ("desativado", "custo não informado"). */
  detalhe?: string | null;
}

export interface GrupoDoSeletor {
  grupo: string;
  opcoes: OpcaoDoSeletor[];
}

export const dobrar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const LIMITE_DO_SELETOR = 200;

/** Grupos na ordem, opções por nome; no máximo `limite` opções (`cortadas` diz quantas ficaram de fora). */
export function filtrarOpcoes(opcoes: readonly OpcaoDoSeletor[], texto: string, limite = LIMITE_DO_SELETOR): { grupos: GrupoDoSeletor[]; total: number; cortadas: number } {
  const palavras = dobrar(texto.slice(0, 80)).split(' ').filter(Boolean);
  const achadas = opcoes.filter((o) => {
    if (palavras.length === 0) return true;
    const alvo = `${dobrar(o.nome)} ${dobrar(o.grupo)}`;
    return palavras.every((p) => alvo.includes(p));
  });
  const ordenadas = [...achadas].sort(
    (a, b) => a.ordemDoGrupo - b.ordemDoGrupo || a.grupo.localeCompare(b.grupo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  const mostradas = ordenadas.slice(0, limite);
  const grupos: GrupoDoSeletor[] = [];
  for (const o of mostradas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === o.grupo) ultimo.opcoes.push(o);
    else grupos.push({ grupo: o.grupo, opcoes: [o] });
  }
  return { grupos, total: achadas.length, cortadas: achadas.length - mostradas.length };
}
