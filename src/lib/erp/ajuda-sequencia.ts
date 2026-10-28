/**
 * Ajuda em sequência guiada (decisão 479; decisão vigente de Rodolfo em 25/10/2026): os pontos de ajuda de uma tela formam uma
 * sequência na ordem de leitura. Fechar a etapa abre a próxima; "Encerrar ajuda" sai de tudo. Aqui fica a parte pura (a ordem
 * dos elementos na página e o que está visível vêm do navegador, em `shell/pontos.tsx`):
 *
 *  - a sequência são os pontos visíveis e permitidos, na ordem da página; ponto com "Não mostrar novamente" fica de fora (ele
 *    continua abrindo pelo próprio botão, e entra quando é ele que a pessoa abriu);
 *  - a próxima etapa é a seguinte na ordem; se o alvo da etapa atual sumiu da tela, vale a ordem de quando a etapa abriu;
 *  - no último passo, fechar conclui (não recomeça);
 *  - o progresso ("2 de 5") conta só os pontos da sequência de agora.
 */

export interface PontoNaTela {
  id: string;
  /** "Não mostrar novamente" (ou, no card da tela, a caixa fechada nesta versão). */
  optouFora: boolean;
}

/**
 * A sequência de agora: os pontos visíveis (já em ordem de leitura), sem os que a pessoa pediu para não ver — fora os de
 * `manter`: o que ela abriu e, ao avançar, os que já estavam na sequência (o progresso não muda de conta no meio do caminho).
 */
export function passosDaSequencia(visiveis: readonly PontoNaTela[], manter: string | readonly string[] | null): string[] {
  const fica = new Set(manter === null ? [] : typeof manter === 'string' ? [manter] : manter);
  const vistos = new Set<string>();
  const passos: string[] = [];
  for (const p of visiveis) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    if (!p.optouFora || fica.has(p.id)) passos.push(p.id);
  }
  return passos;
}

/**
 * A próxima etapa depois de `atual`. `passos` é a sequência de agora; `anterior` é a sequência de quando a etapa atual abriu
 * (para achar o lugar quando o alvo da etapa atual sumiu). Sem próxima: null (fechar conclui).
 */
export function proximoPasso(passos: readonly string[], anterior: readonly string[], atual: string): string | null {
  const aqui = passos.indexOf(atual);
  if (aqui >= 0) return passos[aqui + 1] ?? null;
  const antes = anterior.indexOf(atual);
  if (antes < 0) return null;
  for (const id of anterior.slice(antes + 1)) if (passos.includes(id)) return id;
  return null;
}

/** "2 de 5": só quando há mais de um passo (um ponto só não vira sequência). */
export function progressoDoPasso(passos: readonly string[], atual: string): { n: number; de: number } | null {
  const n = passos.indexOf(atual) + 1;
  if (n === 0 || passos.length < 2) return null;
  return { n, de: passos.length };
}

/**
 * Quais pontos uma sequência que começa sozinha marca como vistos: o primeiro e todos os que vêm depois dele. É a sequência que
 * a regra da 1ª visita e dos 7 dias governa — encerrar no primeiro passo não faz a próxima visita recomeçar do segundo.
 */
export function marcadosAoComecarSozinha(passos: readonly string[], inicio: string): string[] {
  const i = passos.indexOf(inicio);
  return i < 0 ? [inicio] : passos.slice(i);
}

/**
 * A preferência que vale nesta aba: o que ela acabou de gravar (e o servidor ainda não devolveu) vem antes do que veio do
 * servidor, e o mais novo primeiro — `estadoDoPonto` lê o primeiro item de cada ponto. Sem isso, um "visto" antigo do servidor
 * (há 10 dias) venceria o de hoje e a sequência recomeçaria ao voltar para a tela pela navegação do app.
 */
export function pontosComOQueAAbaGravou(doServidor: readonly string[], daAba: readonly string[]): string[] {
  return [...daAba].reverse().concat(doServidor);
}
