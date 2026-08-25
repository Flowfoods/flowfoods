import { chaveDeComparacao, semAcento } from "../texto";
import type { Avaliacao, Respostas } from "../tipos";
import { MODELO_PADRAO, montarEntradaIA, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import type { RaioXIfood } from "./prompt";
import { custoEmBRL, podeGerar, precoSonnet5 } from "./orcamento";
import type { EstadoDoOrcamento, UsoDeTokens } from "./orcamento";
import { lerPreDiagnostico } from "./schema";
import type { PreDiagnostico } from "./schema";

/**
 * Os parâmetros da chamada, prontos para o `client.messages.parse()` do SDK.
 *
 * Sai daqui montado, e não escrito à mão na rota, para que o teste possa
 * afirmar duas coisas que quebram silenciosamente em produção: que o modelo é o
 * certo, e que `temperature` NÃO vai junto.
 *
 * Sobre a temperatura: o plano pedia "temperatura baixa", mas `temperature` foi
 * REMOVIDA no Claude Sonnet 5 — mandar o campo devolve 400 e derruba a chamada.
 * O controle equivalente hoje é `output_config.effort`, e é o que usamos.
 */
export interface RequisicaoIA {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" };
}

export function montarRequisicao(
  respostas: Respostas,
  avaliacao: Avaliacao,
  raioX?: RaioXIfood,
  modelo: string = MODELO_PADRAO,
): RequisicaoIA {
  return {
    model: modelo,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: montarEntradaIA(respostas, avaliacao, raioX) }],
    // Análise curta e estruturada, sem raciocínio longo: "low" é a leitura
    // barata e estável. Subir isso custa dinheiro do teto diário.
    output_config: { effort: "low" },
  };
}

export interface RespostaDoModelo {
  /** O texto cru devolvido pelo modelo. */
  texto: string;
  uso: UsoDeTokens;
}

/**
 * A porta de saída para a Anthropic. O pacote não importa o SDK: quem chama
 * injeta o transporte. É o que deixa todo o resto — orçamento, retry, coerência —
 * testável sem chave de API e sem rede.
 */
export type Transporte = (req: RequisicaoIA) => Promise<RespostaDoModelo>;

export interface OpcoesGeracao {
  respostas: Respostas;
  avaliacao: Avaliacao;
  raioX?: RaioXIfood;
  transporte: Transporte;
  orcamento: EstadoDoOrcamento;
  /** `AAAA-MM-DD` — decide a tabela de preço vigente. */
  hojeISO: string;
  cambioUsdBrl: number;
  modelo?: string;
}

export type ResultadoGeracao =
  | {
      status: "ok";
      preDiagnostico: PreDiagnostico;
      promptVersion: string;
      custoBRL: number;
      uso: UsoDeTokens;
      tentativas: number;
      divergencias: string[];
    }
  | { status: "orcamento"; aviso: string }
  | { status: "falha"; erro: string; custoBRL: number; tentativas: number };

/**
 * Gera o pré-diagnóstico.
 *
 * Três caminhos, todos previstos:
 *  • orçamento estourado → devolve aviso, não chama a API, não é erro;
 *  • JSON fora do schema → tenta MAIS UMA vez e, falhando, devolve "falha"
 *    para a tela oferecer o modo manual;
 *  • sucesso → devolve os dados, o custo e as divergências em relação ao motor.
 *
 * O custo é somado mesmo quando a resposta é inválida: a Anthropic cobra pela
 * tentativa, e um teto diário que ignora tentativa perdida não é teto.
 */
export async function gerarPreDiagnostico(o: OpcoesGeracao): Promise<ResultadoGeracao> {
  const decisao = podeGerar(o.orcamento);
  if (!decisao.pode) return { status: "orcamento", aviso: decisao.aviso };

  const req = montarRequisicao(o.respostas, o.avaliacao, o.raioX, o.modelo);
  const preco = precoSonnet5(o.hojeISO);

  let custoBRL = 0;
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let resposta: RespostaDoModelo;
    try {
      resposta = await o.transporte(req);
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : "falha na chamada à API";
      continue;
    }

    custoBRL += custoEmBRL(resposta.uso, preco, o.cambioUsdBrl);

    const lido = lerPreDiagnostico(resposta.texto);
    if (lido.ok) {
      return {
        status: "ok",
        preDiagnostico: lido.dados,
        promptVersion: PROMPT_VERSION,
        custoBRL,
        uso: resposta.uso,
        tentativas: tentativa,
        divergencias: conferirCoerencia(lido.dados, o.avaliacao),
      };
    }
    ultimoErro = lido.erro;
  }

  return { status: "falha", erro: ultimoErro, custoBRL, tentativas: 2 };
}

/**
 * Confere se a IA não contradisse o motor.
 *
 * O motor é a fonte da verdade sobre momento e prioridade — ele é determinístico
 * e auditável, a IA não é. Divergência não invalida o pré-diagnóstico (a regra 2
 * do prompt permite discordar em "observacoes"), mas aparece marcada na tela do
 * Rodolfo: ele precisa VER que os dois discordam antes de levar para a call.
 */
export function conferirCoerencia(pre: PreDiagnostico, a: Avaliacao): string[] {
  const divergencias: string[] = [];

  const momentoIA = pre.momento.valor.toUpperCase().replace(/[\s-]/gu, "_");
  const momentoMotor = a.momento;
  const iguais =
    momentoIA === momentoMotor ||
    semAcento(momentoIA) === momentoMotor;
  if (!iguais) {
    divergencias.push(
      `momento: o motor calculou ${momentoMotor} e a IA escreveu "${pre.momento.valor}"`,
    );
  }

  const moduloTopMotor = a.modulosRanqueados[0]?.nome;
  const moduloTopIA = pre.dores[0]?.modulo;
  if (moduloTopMotor && moduloTopIA && !mesmoModulo(moduloTopIA, moduloTopMotor)) {
    divergencias.push(
      `módulo #1: o motor apontou ${moduloTopMotor} e a IA começou por ${moduloTopIA}`,
    );
  }

  return divergencias;
}

/** Compara nome de módulo ignorando acento, caixa e espaço sobrando. */
function mesmoModulo(a: string, b: string): boolean {
  return chaveDeComparacao(a) === chaveDeComparacao(b);
}
