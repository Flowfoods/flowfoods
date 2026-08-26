import type { Avaliacao, Respostas } from "../tipos";

/**
 * Versão do prompt. Sobe a cada mudança de texto e fica gravada em cada
 * `Assessment` (`promptVersion`): sem isso não dá para saber se um
 * pré-diagnóstico ruim veio do modelo ou de uma instrução que já foi trocada.
 */
export const PROMPT_VERSION = "c2-prediagnostico-v1";

/**
 * O modelo. Confirmado contra a doc da API (não chutado): Claude Sonnet 5 é
 * `claude-sonnet-5`, sem sufixo de data.
 */
export const MODELO_PADRAO = "claude-sonnet-5";

export const SYSTEM_PROMPT = `Você é o analista interno da FlowFoods, consultoria gastronômica de Rodolfo Cavalcante
(Rio de Janeiro; 14 anos de operação; gestor do delivery de 16 lojas do Grupo Bibi Sucos;
conselheiro do Fórum de Restaurantes do iFood). Seu leitor é SOMENTE o Rodolfo. Nada do
que você escreve vai para o dono do restaurante sem revisão dele.

ENTRADA: respostas normalizadas do formulário, scores (financeiro, operação, digital),
momento calculado e sua razão, módulos ranqueados, flags, texto livre do dono e, quando
existir, dados do Raio-X do iFood.

TAREFA: produzir o pré-diagnóstico que deixa o Rodolfo pronto para uma conversa de 30 min
que ataca a dor principal já na primeira semana de trabalho.

REGRAS:
1. Responda SOMENTE com JSON válido no schema abaixo. Sem markdown, sem preâmbulo.
2. Não contradiga o momento calculado pelo motor. Se discordar, argumente em "observacoes".
3. Toda afirmação sobre o negócio cita a resposta que a sustenta ("disse que fecha DRE às
   vezes e não sabe a margem"). Sem evidência é hipótese — marque como hipótese.
4. Nunca invente números, resultados, percentuais ou preços. Investimento não é com você.
5. Use os 6 módulos pelo nome oficial: Estrutura de Restaurante · iFood & Delivery ·
   Treinamento de Equipe · Gestão Financeira · Fidelidade & CRM · SaaS com IA.
6. Sequência importa: o que estanca perda vem antes do que gera crescimento. Justifique.
7. Tom do Rodolfo: primeira pessoa do singular, direto, carioca, jargão traduzido.
   "aberturaDaCall" tem no máximo 4 frases e começa pelo que o dono escreveu no texto livre.
8. Se houver flag CONFLITO, REDE ou OBJEÇÃO_ALTA, trate em "riscos" com a ação recomendada.
9. Tamanho: resumo ≤ 5 linhas; listas de 3 a 5 itens; perguntasParaCall exatamente 5.

SCHEMA:
{ "resumo": "", "momento": { "valor": "", "porque": "" },
  "dores": [ { "dor": "", "evidencia": "", "modulo": "" } ],
  "plano30dias": [ "" ],
  "propostaSugerida": { "nivel": "", "modulos": [ "" ], "sequencia": [ "" ],
                        "duracaoSemanas": 0, "justificativa": "" },
  "perguntasParaCall": [ "" ], "riscos": [ "" ], "aberturaDaCall": "", "observacoes": "" }`;

export interface RaioXIfood {
  nota?: number;
  avaliacoes?: number;
  tempoEntrega?: string;
  categorias?: string[];
  fotos?: number;
}

/**
 * A entrada que vai para o modelo, já normalizada.
 *
 * O texto livre do dono ("o que tira o seu sono") entra aqui porque é o melhor
 * material da conversa — e é exatamente por isso que ele NUNCA pode ir para log
 * em claro. Quem chama esta função manda o resultado para a API e mais nada.
 */
export function montarEntradaIA(
  r: Respostas,
  a: Avaliacao,
  raioX?: RaioXIfood,
): string {
  const entrada = {
    negocio: {
      restaurante: r.restaurante,
      categoria: r.categoria,
      lojas: r.lojas,
      tempoOperacao: r.tempoOperacao,
      bairroCidade: r.bairroCidade,
      canais: r.canais,
      percentualDelivery: r.percentualDelivery,
      faturamento: r.faturamento,
      equipePorLoja: r.equipePorLoja,
    },
    respostas: {
      cmv: r.cmv,
      dre: r.dre,
      margemPrato: r.margemPrato,
      resultado3Meses: r.resultado3Meses,
      gerente: r.gerente,
      rotatividade: r.rotatividade,
      treinamento: r.treinamento,
      fichasTecnicas: r.fichasTecnicas,
      horasOperacao: r.horasOperacao,
      delivery: r.delivery ?? "não vende por app",
      baseClientes: r.baseClientes,
      fidelidade: r.fidelidade,
      mensagens: r.mensagens,
      sistema: r.sistema,
      dores: r.dores,
      objetivo6meses: r.objetivo6meses,
      urgencia: r.urgencia,
      quemDecide: r.quemDecide,
      jaContratouConsultoria: r.jaContratouConsultoria,
    },
    textoLivreDoDono: r.tiraSono ?? "(não respondeu)",
    scores: a.scores,
    momentoCalculado: { valor: a.momento, razao: a.momentoRazao },
    modulosRanqueados: a.modulosRanqueados.map((m) => ({
      modulo: m.nome,
      pontos: m.pontos,
      razoes: m.razoes,
    })),
    nivelSugeridoPeloMotor: a.nivelOferta,
    flags: a.flags,
    raioXIfood: raioX ?? "(não coletado)",
  };
  return JSON.stringify(entrada, null, 2);
}
