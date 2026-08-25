/**
 * Render das mensagens — porte de `gancho` / `dor` do `montar_pacote.py`,
 * com os textos de `references/mensagens.md` como fonte da verdade.
 *
 * DIVERGÊNCIA CONHECIDA (ver docs/AUDITORIA_C3.md, achado #4): `mensagens.md`
 * manda trocar o ângulo no Centro por giro de almoço, fila e ticket executivo —
 * o `montar_pacote.py` não implementa isso. Aqui está implementado, porque o
 * `.md` é a fonte declarada. Registrado como pendência de sincronizar de volta
 * no script.
 */

import type { DateTime } from 'luxon';
import { nomeCurto } from './scoring';
import { normalizar } from './texto';
import { ASSINATURA } from './template-validator';

export interface DadosLead {
  nome: string;
  bairro: string;
  categoria: string;
  nota: number;
  avaliacoes: number;
  /** Quando conhecido, troca a abertura e muda a taxa de resposta mais que o resto. */
  donoNome?: string | null;
}

/** Bom dia até 12h, Boa tarde até 18h, Boa noite depois. */
export function saudacao(dt: DateTime): string {
  const h = dt.hour;
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Nota no formato brasileiro: 4.75 → "4,8". */
export function formatarNota(nota: number): string {
  return nota.toFixed(1).replace('.', ',');
}

/**
 * Gancho factual. Escolhe o primeiro padrão que casar — a ordem é a de
 * `mensagens.md` e não é arbitrária: o primeiro é o mais forte que existe,
 * porque diz uma verdade incômoda sem ofender e defende o dono ao apontar
 * processo em vez de comida.
 */
export function gancho(nome: string, nota: number, avaliacoes: number, bairro: string): string {
  const curto = nomeCurto(nome);
  const n = Number(nota);
  const a = Math.trunc(Number(avaliacoes));
  const notabr = formatarNota(n);

  if (a >= 3000 && n < 4.4) {
    return (
      `Vi que o ${curto} tem mais de ${Math.floor(a / 1000)} mil avaliações no Google — isso é ` +
      `volume que pouca casa do Rio tem. E a nota está em ${notabr}. Normalmente esse ` +
      `desencontro não é a comida: é processo.`
    );
  }
  if (n >= 4.7 && a >= 800) {
    return (
      `Vi que o ${curto} está com ${notabr} e mais de ${a} avaliações. Sinceramente, é das ` +
      `melhores marcas de ${bairro} no Google.`
    );
  }
  if (n >= 4.8) {
    return (
      `Vi que o ${curto} está com ${notabr} no Google. Nota nesse patamar é difícil de ` +
      `conquistar e mais difícil ainda de segurar.`
    );
  }
  if (a >= 1500) {
    return (
      `Vi que o ${curto} tem mais de ${a} avaliações no Google — a casa claramente já tem ` +
      `público formado em ${bairro}.`
    );
  }
  if (n <= 4.2 && a >= 250) {
    return (
      `Vi o perfil do ${curto} no Google: ${notabr} com ${a} avaliações. Tem movimento, mas a ` +
      `nota está abaixo do que a operação parece entregar.`
    );
  }
  return `Vi o perfil do ${curto} no Google — ${notabr} com ${a} avaliações e presença firme em ${bairro}.`;
}

const ANGULO_CENTRO =
  'No Centro o jogo é giro de almoço: fila que anda, ticket executivo e mesa que vira. ' +
  'Delivery noturno ali quase nunca é o que paga a conta.';

/** Ângulo de valor por categoria. Centro tem regra própria e vem antes. */
export function angulo(categoria: string, bairro?: string | null): string {
  if (bairro && normalizar(bairro).includes('centro')) return ANGULO_CENTRO;

  const c = normalizar(categoria);
  const tem = (...termos: string[]) => termos.some((t) => c.includes(t));

  if (tem('hamburgueria'))
    return 'O que costumo encontrar em hamburgueria com esse movimento é margem presa no marketplace e cardápio que poderia vender mais por pedido.';
  if (tem('japon', 'asiat'))
    return 'Japonês costuma ter o ticket mais alto da região e o cliente mais fiel — mas quase ninguém tem base de dados pra chamar esse cliente de volta.';
  if (tem('pizza'))
    return 'Pizzaria vive de recorrência. Quando não existe canal próprio, cada pedido paga comissão de novo pro mesmo cliente.';
  if (tem('frutos do mar', 'peixe'))
    return 'Frutos do mar concentra faturamento em poucos dias. Dá pra puxar movimento pro meio da semana sem baixar preço.';
  if (tem('buffet', 'self', 'churrascaria'))
    return 'Em buffet e churrascaria o resultado mora no CMV. Ficha técnica e controle de desperdício mudam a margem sem mexer no preço.';
  if (tem('cafeteria', 'confeitaria', 'padaria', 'brunch'))
    return 'Cafeteria tem a maior frequência de retorno do food service — e é onde mais se perde cliente por falta de um programa de fidelidade.';
  if (tem('acai', 'sorvet'))
    return 'Açaí é altíssima recorrência e ticket baixo. Sem CRM, você paga aquisição toda vez pelo mesmo cliente.';
  if (tem('bar', 'boteco', 'petisc', 'chopp'))
    return 'Bar depende de ocupação de mesa em dias específicos. Dá pra construir calendário e recorrência com o que já existe na casa.';
  if (tem('esfiha', 'crepe', 'tapioca', 'salgado', 'doce'))
    return 'Nesse segmento o delivery costuma responder rápido a ajuste de cardápio e precificação — é dos ganhos mais imediatos que vejo.';
  if (tem('nordestino', 'brasileiro', 'italiano', 'portugu'))
    return 'Casa com identidade forte costuma ter margem melhor do que imagina — o que falta é leitura de DRE e precificação por ficha técnica.';

  return 'O que costumo encontrar em casa com esse movimento é margem espremida no delivery e cliente que compra uma vez e não volta.';
}

// ------------------------------------------------------------------ templates

export const TEMPLATE_D0 = `{{saudacao}}! Aqui é o Rodolfo, da FlowFoods — consultoria de gastronomia aqui do Rio. Peguei o contato de vocês no Google.

{{gancho}}

{{angulo}}

Trabalho há 14 anos em operação de restaurante aqui no Rio, hoje cuido do delivery de 16 lojas e tenho assento no Fórum de Restaurantes do iFood. É exatamente isso que faço na FlowFoods: estrutura de operação, performance no iFood, controle financeiro, treinamento de equipe e retenção de cliente.

Queria entender como está a operação de vocês e ver se faz sentido a gente trabalhar junto.

Consigo falar com o responsável pela operação?

Se quiser me conhecer antes de responder: ${'@rrodolfoac'} no Instagram e consultoriaflowfoods.com.br

${ASSINATURA}`;

export const TEMPLATE_D4 = `Oi! Rodolfo aqui de novo, da FlowFoods. Sei que rotina de restaurante não dá trégua.

Só retomando: trabalho com donos que já têm casa boa e querem tirar mais resultado da mesma operação — margem, performance no iFood e cliente que volta.

Se fizer sentido, 15 minutos de conversa com quem cuida da operação já dá pra ver se tem encaixe.

Instagram ${'@rrodolfoac'} · consultoriaflowfoods.com.br

${ASSINATURA}`;

export const TEMPLATE_D10 = `Rodolfo, da FlowFoods — última vez que apareço por aqui, prometo.

Se não for o momento, tudo certo. Fico como ${'@rrodolfoac'} no Instagram pra quando fizer sentido.

Se preferir que eu não escreva mais, é só me avisar que retiro da lista na hora.

${ASSINATURA}`;

export const TEMPLATE_INSTAGRAM = `Oi! Aqui é o Rodolfo, da FlowFoods — consultoria de gastronomia no Rio. Cheguei pelo perfil de vocês.

{{gancho}}

Trabalho há 14 anos com operação de restaurante, hoje cuido do delivery de 16 lojas e tenho assento no Fórum de Restaurantes do iFood. Na FlowFoods cuido de operação, iFood, financeiro e retenção de cliente.

Queria entender como está a operação de vocês e ver se faz sentido conversarmos.

Consigo falar com o responsável pela operação?

Meu perfil: ${'@rrodolfoac'} · consultoriaflowfoods.com.br`;

export const SEED_TEMPLATES = [
  { toque: 'D0' as const, canal: 'WHATSAPP' as const, corpo: TEMPLATE_D0 },
  { toque: 'D4' as const, canal: 'WHATSAPP' as const, corpo: TEMPLATE_D4 },
  { toque: 'D10' as const, canal: 'WHATSAPP' as const, corpo: TEMPLATE_D10 },
  { toque: 'D0' as const, canal: 'INSTAGRAM' as const, corpo: TEMPLATE_INSTAGRAM },
];

/**
 * Resolve os placeholders. Deixa intacto o que não conhece — o validador
 * (R9) recusa a mensagem depois, em vez de mandar `{{algo}}` para o dono do
 * restaurante.
 */
export function renderizar(template: string, lead: DadosLead, quando: DateTime): string {
  const abertura = lead.donoNome
    ? `${saudacao(quando)}, ${lead.donoNome.split(' ')[0]}`
    : saudacao(quando);

  const valores: Record<string, string> = {
    saudacao: abertura,
    nome: nomeCurto(lead.nome),
    nomeCompleto: lead.nome,
    bairro: lead.bairro,
    categoria: lead.categoria,
    nota: formatarNota(lead.nota),
    avaliacoes: String(Math.trunc(lead.avaliacoes)),
    gancho: gancho(lead.nome, lead.nota, lead.avaliacoes, lead.bairro),
    angulo: angulo(lead.categoria, lead.bairro),
  };

  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (original, chave: string) =>
    chave in valores ? valores[chave] : original,
  );
}
