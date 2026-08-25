import { config } from "../config";
import { chaveDeComparacao as normalizar } from "../texto";
import type { Flag, Respostas } from "../tipos";


/**
 * Flags são avisos operacionais para o Rodolfo — nenhuma delas aparece para o
 * dono. Elas mudam COMO ele conduz a conversa, não o que o motor calculou.
 *
 *  • REDE                  — rede de verdade; a conversa é outra.
 *  • CONFLITO              — suco/açaí/salada no território do Grupo Bibi Sucos.
 *                            Não impede nada: só não dá pra fingir que não existe.
 *  • PRIORIDADE            — dói agora e sangra agora. Liga hoje.
 *  • OBJECAO_ALTA          — não disse faturamento, está só planejando e já se
 *                            queimou com consultoria. Vai precisar de prova.
 *  • DECISAO_COMPARTILHADA — quem decide não está sozinho na call.
 */
export function detectarFlags(r: Respostas): Flag[] {
  const flags: Flag[] = [];

  if (r.lojas === "sete_mais") flags.push("REDE");

  const territorio = normalizar(r.bairroCidade);
  const noTerritorioBibi = config.conflitoBibi.territorios.some((t) =>
    territorio.includes(normalizar(t)),
  );
  if (noTerritorioBibi) {
    const categoriaConflitante = config.conflitoBibi.categorias.includes(r.categoria);
    const nome = normalizar(r.restaurante);
    const nomeConflitante = config.conflitoBibi.palavrasChave.some((p) =>
      nome.includes(normalizar(p)),
    );
    if (categoriaConflitante || nomeConflitante) flags.push("CONFLITO");
  }

  if (r.urgencia === "pra_ontem" && r.resultado3Meses === "prejuizo") {
    flags.push("PRIORIDADE");
  }

  if (
    r.faturamento === "nao_dizer" &&
    r.urgencia === "planejando" &&
    r.jaContratouConsultoria === "nao_deu_certo"
  ) {
    flags.push("OBJECAO_ALTA");
  }

  if (r.quemDecide === "socios" || r.quemDecide === "familia") {
    flags.push("DECISAO_COMPARTILHADA");
  }

  return flags;
}
