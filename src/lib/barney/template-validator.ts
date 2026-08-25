/**
 * Validador de templates — trava de qualidade da abordagem.
 *
 * Roda em DOIS pontos: ao salvar em `/rodolfo/barney` e de novo antes de
 * enfileirar o corpo já renderizado. O segundo não é redundante: o template
 * passa, mas um lead com `avaliacoes = 0` renderiza um gancho que mente, e é o
 * corpo renderizado que chega no dono do restaurante.
 *
 * Template que falha NÃO entra na fila.
 *
 * Fonte da verdade dos textos: `ledsflowfoods/references/mensagens.md`.
 * Duas regras extras vêm de `evolution-api-sysadmin/references/whatsapp-ban-prevention.md`
 * (máx. 3 emojis, nada de link encurtado) — o Master Prompt manda a fonte mais
 * restritiva vencer, e nesses dois pontos ela é a única que fala.
 *
 * NOTA DE DIVERGÊNCIA NA FONTE (ver docs/AUDITORIA_C3.md, achado #3):
 * `mensagens.md` diz "assinatura obrigatória em TODA mensagem", mas a própria
 * versão de Instagram Direct, no mesmo arquivo, termina sem assinatura. Como o
 * Instagram não é canal do Barney (a plataforma bloqueia mensagem
 * pré-preenchida; o fluxo é copiar → abrir → colar), a assinatura é exigida dos
 * templates de WhatsApp — que são os que entram na fila — e dispensada do texto
 * de Direct, que é ativo de copiar e colar da tela /rodolfo/visitas.
 */

import type { Toque } from './regras';
import { normalizarFrase } from './texto';

export const ASSINATURA = '— Rodolfo, FlowFoods. Gastronomia que flui. Negócio que cresce.';
export const INSTAGRAM_HANDLE = '@rrodolfoac';
export const SITE = 'consultoriaflowfoods.com.br';

export const MAX_EMOJIS = 3;

/** Canal do template. INSTAGRAM não entra na fila do Barney. */
export type CanalTemplate = 'WHATSAPP' | 'INSTAGRAM';

export interface OpcoesValidacao {
  toque: Toque;
  canal?: CanalTemplate;
  /**
   * `true` quando o texto já passou pelo render (placeholders resolvidos).
   * Muda a checagem do gancho: no template basta o placeholder, no renderizado
   * exige-se número de verdade.
   */
  renderizado?: boolean;
}

export interface Violacao {
  regra: string;
  detalhe: string;
}

export interface ResultadoValidacao {
  valido: boolean;
  violacoes: Violacao[];
}

/** R1 — nada gratuito. A FlowFoods vende consultoria; a abordagem pede conversa. */
const TERMOS_GRATUITO = [
  'gratuito',
  'gratuita',
  'gratis',
  'de graca',
  'sem custo',
  'nao tem custo',
  'sem compromisso',
  'contratando ou nao',
  'cortesia',
  'nenhum custo',
  'zero custo',
  'nao cobro nada',
  'nao vou cobrar',
];

/** R2 — primeira pessoa do singular. FlowFoods é projeto solo, sem sócios. */
const TERMOS_PLURAL = [
  /\bnós\b/i,
  /\bnossa equipe\b/i,
  /\bnosso time\b/i,
  /\ba gente atende\b/i,
  /\bnossos clientes\b/i,
  /\bnossa consultoria\b/i,
  /\bestamos à disposição\b/i,
];

/** R8 — encurtador cai no filtro anti-spam do WhatsApp. */
const ENCURTADORES = [
  'bit.ly',
  'tinyurl',
  'goo.gl',
  'ow.ly',
  't.co/',
  'is.gd',
  'cutt.ly',
  'encurtador.com.br',
  'shorturl',
];

/**
 * Marcadores do "pedido" — o momento em que a mensagem pede a conversa.
 * A regra R4 só se aplica quando existe pedido; a mensagem de encerramento
 * (D10) não pede nada, e ali o @ aparece como despedida, não como isca.
 */
const MARCADORES_PEDIDO = [
  'responsavel pela operacao',
  'quem cuida da operacao',
  'falar com o responsavel',
  'minutos de conversa',
  'faz sentido a gente trabalhar junto',
  'faz sentido conversarmos',
];

function contarEmojis(texto: string): number {
  const achados = texto.match(/\p{Extended_Pictographic}/gu);
  return achados ? achados.length : 0;
}

export function validarTemplate(corpo: string, opts: OpcoesValidacao): ResultadoValidacao {
  const violacoes: Violacao[] = [];
  const texto = String(corpo ?? '');
  const plano = normalizarFrase(texto);
  const canal = opts.canal ?? 'WHATSAPP';

  const falta = (regra: string, detalhe: string) => violacoes.push({ regra, detalhe });

  if (!texto.trim()) {
    return { valido: false, violacoes: [{ regra: 'R0_VAZIO', detalhe: 'Corpo vazio.' }] };
  }

  // R1 — nada gratuito.
  for (const termo of TERMOS_GRATUITO) {
    if (plano.includes(termo)) {
      falta(
        'R1_NADA_GRATUITO',
        `Promessa de gratuidade: "${termo}". A abordagem pede conversa, não entrega o produto.`,
      );
    }
  }

  // R2 — primeira pessoa do singular.
  for (const re of TERMOS_PLURAL) {
    const m = texto.match(re);
    if (m) {
      falta('R2_PRIMEIRA_PESSOA', `Plural de equipe: "${m[0]}". FlowFoods é projeto solo.`);
    }
  }

  // R3 — assinatura. Exigida no WhatsApp; ver nota de divergência no topo.
  if (canal === 'WHATSAPP') {
    if (!texto.includes(ASSINATURA)) {
      falta('R3_ASSINATURA', `Falta a assinatura exata: "${ASSINATURA}"`);
    } else if (!texto.trimEnd().endsWith(ASSINATURA)) {
      falta('R3_ASSINATURA', 'A assinatura existe mas não é a última linha da mensagem.');
    }
  }

  // R4 — Instagram e site DEPOIS do pedido, nunca antes.
  const temContato = texto.includes(INSTAGRAM_HANDLE) || plano.includes(normalizarFrase(SITE));
  const marcador = MARCADORES_PEDIDO.find((m) => plano.includes(m));
  if (temContato && marcador) {
    const posPedido = plano.indexOf(marcador);
    const posContato = Math.min(
      ...[normalizarFrase(INSTAGRAM_HANDLE), normalizarFrase(SITE)]
        .map((t) => plano.indexOf(t))
        .filter((i) => i >= 0),
    );
    if (posContato < posPedido) {
      falta(
        'R4_CONTATO_DEPOIS_DO_PEDIDO',
        'Instagram/site aparecem antes do pedido. Prova social vem depois de pedir a conversa.',
      );
    }
  }

  // R5 — gancho com dado real. Só onde existe gancho: abertura (D0) e Direct.
  const exigeGancho = opts.toque === 'D0';
  if (exigeGancho) {
    if (opts.renderizado) {
      // Renderizado: precisa de número de verdade — nota (4,7 / 4.7) e contagem.
      const temNota = /\b\d[.,]\d\b/.test(texto);
      const temAvaliacoes = /\b\d{2,}\b/.test(texto.replace(/\b\d[.,]\d\b/g, ''));
      if (!temNota || !temAvaliacoes) {
        falta(
          'R5_GANCHO_COM_DADO_REAL',
          'Mensagem renderizada sem nota e/ou número de avaliações. O gancho é o que prova que o Rodolfo olhou a casa.',
        );
      }
    } else {
      const temPlaceholder = /\{\{\s*(nota|avaliacoes|gancho)\s*\}\}/i.test(texto);
      if (!temPlaceholder) {
        falta(
          'R5_GANCHO_COM_DADO_REAL',
          'Template de abertura sem {{nota}}/{{avaliacoes}}/{{gancho}}. Sem dado real vira disparo em massa.',
        );
      }
    }
  }

  // R7 — teto de emojis (ban-prevention.md).
  const emojis = contarEmojis(texto);
  if (emojis > MAX_EMOJIS) {
    falta('R7_EMOJIS', `${emojis} emojis (teto ${MAX_EMOJIS}). Excesso aumenta score de spam.`);
  }

  // R8 — encurtadores.
  for (const enc of ENCURTADORES) {
    if (texto.toLowerCase().includes(enc)) {
      falta('R8_LINK_ENCURTADO', `Link encurtado ("${enc}") cai no filtro anti-spam do WhatsApp.`);
    }
  }

  // R9 — placeholder não resolvido não sai para o cliente.
  if (opts.renderizado && /\{\{[^}]+\}\}/.test(texto)) {
    const m = texto.match(/\{\{[^}]+\}\}/g) ?? [];
    falta('R9_PLACEHOLDER_ABERTO', `Placeholder não resolvido: ${m.join(', ')}`);
  }

  return { valido: violacoes.length === 0, violacoes };
}
