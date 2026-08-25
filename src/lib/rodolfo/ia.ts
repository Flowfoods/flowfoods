/**
 * Classificação de intenção e rascunho de resposta.
 *
 * Duas coisas que este módulo NÃO faz, de propósito:
 *
 *  1. **Não decide opt-out.** Quem honra o pedido de saída é `optout.ts`, por
 *     palavra-chave, antes de qualquer chamada daqui. Obrigação legal não pode
 *     depender de a Anthropic estar no ar.
 *  2. **Não responde ao lead.** O rascunho é sugestão; quem envia é o Rodolfo,
 *     depois de ler. A regra "resposta ao lead é sempre humana" é do negócio.
 *
 * Sem `ANTHROPIC_API_KEY`, ou com o orçamento do dia estourado, tudo aqui vira
 * no-op e o Inbox mostra a resposta sem classificação. Degradar é o
 * comportamento correto: a resposta já está salva e a cadência já está pausada.
 *
 * Modelos definidos pelo Master Prompt: Haiku 4.5 para classificar (barato, é
 * rótulo curto) e Sonnet 5 para o rascunho (texto na voz do Rodolfo).
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import type { Classificacao, Intencao, MensagemRecebida } from '@/lib/barney/inbound';
import { agoraSP, diaSP } from './estado';

const MODELO_CLASSIFICACAO = 'claude-haiku-4-5';
const MODELO_RASCUNHO = 'claude-sonnet-5';

/** US$ por 1M de tokens, da tabela de preços da API. */
const PRECO = {
  [MODELO_CLASSIFICACAO]: { entrada: 1.0, saida: 5.0 },
  [MODELO_RASCUNHO]: { entrada: 2.0, saida: 10.0 },
} as const;

/** Câmbio para o orçamento em BRL. Configurável — o dólar não é constante. */
const USD_BRL = Number(process.env.USD_BRL ?? '5.40');

const INTENCOES: Intencao[] = ['INTERESSADO', 'PERGUNTA', 'DEPOIS', 'RECUSA', 'OPT_OUT', 'OUTRO'];

function cliente(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function custoBRL(
  modelo: keyof typeof PRECO,
  uso: { input_tokens?: number; output_tokens?: number } | undefined,
): number {
  const p = PRECO[modelo];
  const entrada = ((uso?.input_tokens ?? 0) / 1_000_000) * p.entrada;
  const saida = ((uso?.output_tokens ?? 0) / 1_000_000) * p.saida;
  return (entrada + saida) * USD_BRL;
}

/** Soma o custo de IA já gasto hoje, em BRL. */
async function gastoDoDia(): Promise<number> {
  const inicio = diaSP();
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

  const r = await prisma.inboundClassification.aggregate({
    _sum: { custoIA: true },
    where: { criadoEm: { gte: inicio, lt: fim } },
  });

  return Number(r._sum.custoIA ?? 0);
}

async function orcamentoDisponivel(): Promise<boolean> {
  const teto = Number(process.env.AI_DAILY_BUDGET_BRL ?? '0');
  // Sem teto configurado, não há trava — é decisão explícita do Rodolfo.
  if (!teto || Number.isNaN(teto)) return true;
  return (await gastoDoDia()) < teto;
}

const SISTEMA_CLASSIFICACAO = `Você classifica respostas de donos de restaurante a uma abordagem comercial fria de consultoria de gastronomia.

Classifique a intenção em UMA destas:
- INTERESSADO: quer saber mais, pede detalhes, aceita conversar, pergunta preço
- PERGUNTA: dúvida pontual sem sinal claro de interesse ou recusa
- DEPOIS: interesse adiado ("agora não dá", "me chama mês que vem")
- RECUSA: não quer, mas sem pedir para sair da lista
- OPT_OUT: pede explicitamente para não receber mais mensagens
- OUTRO: fora do assunto, engano, mensagem automática, ou vazio

Responda apenas com o JSON pedido. Não invente contexto que a mensagem não tem.`;

function sistemaRascunho(lead: { nome?: string; bairro?: string; categoria?: string }): string {
  return `Você escreve o RASCUNHO de uma resposta do Rodolfo, consultor de gastronomia da FlowFoods, no Rio.

Contexto do lead: ${lead.nome ?? 'restaurante'}${lead.bairro ? `, ${lead.bairro}` : ''}${lead.categoria ? `, ${lead.categoria}` : ''}.

Regras que não se quebram:
- Primeira pessoa do singular. A FlowFoods é projeto solo, sem sócios. Nunca "nós" ou "nossa equipe".
- NUNCA prometa nada gratuito: proibido "gratuito", "sem custo", "sem compromisso", "contratando ou não", "de graça", "cortesia".
- Tom de parceiro de trabalho: direto, curto, sem venda agressiva e sem formalidade de e-mail corporativo.
- No máximo 3 emojis. Sem links encurtados.
- Frases curtas. WhatsApp, não carta.
- Não invente números, cases, resultados ou nomes de clientes.

Escreva apenas o texto da mensagem, pronto para o Rodolfo revisar e enviar.`;
}

/**
 * Classifica e, quando faz sentido, sugere um rascunho.
 *
 * Encaixa na porta `classificar` do pipeline de entrada. Erros sobem para o
 * pipeline, que já os trata sem derrubar o processamento da resposta.
 */
export async function classificarResposta(m: MensagemRecebida): Promise<Classificacao> {
  const anthropic = cliente();

  // Sem chave ou sem orçamento: devolve OUTRO com confiança zero. O Inbox
  // mostra a resposta crua, que continua sendo o essencial.
  if (!anthropic || !m.texto.trim() || !(await orcamentoDisponivel())) {
    return { intencao: 'OUTRO', confianca: 0 };
  }

  const classificacao = await anthropic.messages.create({
    model: MODELO_CLASSIFICACAO,
    max_tokens: 256,
    system: SISTEMA_CLASSIFICACAO,
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            intencao: { type: 'string', enum: INTENCOES },
            confianca: { type: 'number', minimum: 0, maximum: 1 },
            resumo: { type: 'string' },
          },
          required: ['intencao', 'confianca'],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: 'user', content: m.texto.slice(0, 2000) }],
  });

  const bloco = classificacao.content.find((b) => b.type === 'text');
  let intencao: Intencao = 'OUTRO';
  let confianca = 0;

  if (bloco && bloco.type === 'text') {
    try {
      const j = JSON.parse(bloco.text) as { intencao?: string; confianca?: number };
      if (j.intencao && INTENCOES.includes(j.intencao as Intencao)) {
        intencao = j.intencao as Intencao;
      }
      confianca = Number(j.confianca ?? 0);
    } catch {
      // Schema estruturado quase nunca falha, mas se falhar o pior resultado é
      // "sem classificação" — nunca uma decisão errada tomada em cima de lixo.
    }
  }

  let custo = custoBRL(MODELO_CLASSIFICACAO, classificacao.usage);
  let rascunhoSugerido: string | undefined;

  // Rascunho só onde ele ajuda. Em RECUSA e OPT_OUT insistir é o erro clássico
  // que vira denúncia — e OPT_OUT nem chega aqui.
  if (intencao === 'INTERESSADO' || intencao === 'PERGUNTA' || intencao === 'DEPOIS') {
    const lead = m.leadId
      ? await prisma.lead.findUnique({
          where: { id: m.leadId },
          select: { restaurante: true, nome: true, bairro: true, categoria: true },
        })
      : null;

    const rascunho = await anthropic.messages.create({
      model: MODELO_RASCUNHO,
      max_tokens: 1000,
      system: sistemaRascunho({
        nome: lead?.restaurante ?? lead?.nome ?? undefined,
        bairro: lead?.bairro ?? undefined,
        categoria: lead?.categoria ?? undefined,
      }),
      messages: [
        {
          role: 'user',
          content: `O dono respondeu isto à minha abordagem:\n\n"${m.texto.slice(0, 2000)}"\n\nIntenção classificada: ${intencao}. Escreva minha resposta.`,
        },
      ],
    });

    const t = rascunho.content.find((b) => b.type === 'text');
    if (t && t.type === 'text') rascunhoSugerido = t.text.trim();
    custo += custoBRL(MODELO_RASCUNHO, rascunho.usage);
  }

  return { intencao, confianca, rascunhoSugerido, custoIA: custo };
}
