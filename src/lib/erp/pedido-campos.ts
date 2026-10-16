/**
 * Pedido de acesso (0.5) — regras PURAS, sem banco e sem Next: limpar o que o
 * lead digitou, validar, montar os links (WhatsApp, e-mail) e contar o atraso.
 * O banco fica em `pedidos.ts` (e a ativação, em `credenciais.ts`).
 *
 * Tudo que vem do lead é texto: nada vira HTML (React escapa), os caracteres
 * invisíveis e de controle (inclusive os que invertem a direção do texto) saem
 * antes de gravar, e os links são montados aqui, no servidor, só com dígitos
 * (WhatsApp) ou com o e-mail já validado (mailto).
 */

import { normalizarEmail } from './acesso';
import { normalizarTelefone } from '../barney/telefone';
import { hojeNoRio } from './compra-campos';
import { diasEntre } from './contagem-campos';
import { gerarSlug, SLUG_VALIDO } from './slug';
import {
  CAMPO_ARMADILHA,
  CONSENTIMENTO,
  LIMITES_DO_PEDIDO as L,
  PRAZO_DO_ATRASO_DIAS,
  RETENCAO_DO_RECUSADO_DIAS,
  ROTULO_DA_ETAPA,
  type EtapaDoPedido,
} from './pedido-textos';

export * from './pedido-textos';

// ----------------------------------------------------------------- limpar

/** Tamanho máximo lido de qualquer campo antes de limpar (o resto é lixo). */
const LEITURA_MAXIMA = 500;

/**
 * Texto de uma linha: quebra e tabulação viram espaço; caracteres de controle
 * (\p{Cc}) e de formato (\p{Cf}: zero-width, marcas e isolantes bidi) somem;
 * espaços repetidos viram um; aparado.
 */
export function limparTexto(bruto: unknown): string {
  if (typeof bruto !== 'string') return '';
  return bruto
    .slice(0, LEITURA_MAXIMA)
    .replace(/[\t\n\r\f\v\u2028\u2029]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- validar

export interface DadosDoPedido {
  nomeGrupo: string;
  responsavel: string;
  /** E.164 sem o "+". */
  whatsapp: string;
  email: string;
  lojas: number;
  marcas: number;
  cidade: string;
}

export type CampoDoPedido = keyof DadosDoPedido | 'consentimento' | 'geral';
export type ErrosDoPedido = Partial<Record<CampoDoPedido, string>>;

export type PedidoLido = { ok: true; dados: DadosDoPedido } | { ok: false; erros: ErrosDoPedido };

function inteiro(bruto: unknown, min: number, max: number): number | null {
  const t = limparTexto(bruto);
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/**
 * Lê o formulário (landing ou "cadastrar pedido manual"). `exigirConsentimento`:
 * a landing exige a caixa marcada; quem o Rodolfo digita não aceitou nada ainda.
 */
export function lerPedido(entrada: Record<string, unknown>, opcoes: { exigirConsentimento: boolean }): PedidoLido {
  const erros: ErrosDoPedido = {};

  const nomeGrupo = limparTexto(entrada.nomeGrupo);
  if (nomeGrupo.length < L.nome.min || nomeGrupo.length > L.nome.max) {
    erros.nomeGrupo = `Escreva o nome do grupo ou do restaurante (${L.nome.min} a ${L.nome.max} letras).`;
  }
  const responsavel = limparTexto(entrada.responsavel);
  if (responsavel.length < L.nome.min || responsavel.length > L.nome.max) {
    erros.responsavel = `Escreva o seu nome (${L.nome.min} a ${L.nome.max} letras).`;
  }
  const tel = normalizarTelefone(limparTexto(entrada.whatsapp).slice(0, 40));
  if (tel.tipo !== 'CELULAR') erros.whatsapp = 'Informe um celular com DDD. Ex.: (21) 99999-9999';
  const email = normalizarEmail(limparTexto(entrada.email));
  if (!email) erros.email = 'E-mail inválido. Ex.: maria@restaurante.com.br';
  const lojas = inteiro(entrada.lojas, L.lojas.min, L.lojas.max);
  if (lojas === null) erros.lojas = `Informe de ${L.lojas.min} a ${L.lojas.max} lojas.`;
  const marcas = inteiro(entrada.marcas, L.marcas.min, L.marcas.max);
  if (marcas === null) erros.marcas = `Informe de ${L.marcas.min} a ${L.marcas.max} marcas.`;
  const cidade = limparTexto(entrada.cidade);
  if (cidade.length < L.cidade.min || cidade.length > L.cidade.max) {
    erros.cidade = 'Informe a cidade e o estado. Ex.: Rio de Janeiro/RJ';
  }
  if (opcoes.exigirConsentimento && limparTexto(entrada.consentimento) !== 'sim') {
    erros.consentimento = 'Para enviar, marque a autorização acima.';
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { nomeGrupo, responsavel, whatsapp: tel.e164, email: email!, lojas: lojas!, marcas: marcas!, cidade } };
}

/** O robô preencheu o campo que a pessoa não vê? */
export function caiuNaArmadilha(entrada: Record<string, unknown>): boolean {
  const v = entrada[CAMPO_ARMADILHA];
  return typeof v === 'string' && v.trim() !== '';
}

/** Os campos de texto que voltam para o formulário quando há erro (sem a armadilha nem o consentimento). */
export function valoresParaOFormulario(entrada: Record<string, unknown>): Record<string, string> {
  const v: Record<string, string> = {};
  for (const k of ['nomeGrupo', 'responsavel', 'whatsapp', 'email', 'lojas', 'marcas', 'cidade']) v[k] = limparTexto(entrada[k]).slice(0, 160);
  return v;
}

export const CONSENTIMENTO_GRAVADO = CONSENTIMENTO.versao;

// -------------------------------------------------------------- decisões

/** Motivo da recusa: 3 a 200 letras, obrigatório. */
export function lerMotivo(bruto: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = limparTexto(bruto);
  if (motivo.length < L.motivo.min) return { ok: false, erro: 'Diga em poucas palavras por que está recusando.' };
  if (motivo.length > L.motivo.max) return { ok: false, erro: `Motivo longo demais (máx. ${L.motivo.max}).` };
  return { ok: true, motivo };
}

export interface AtivacaoLida {
  nomeParceiro: string;
  slug: string;
  donoNome: string;
  donoEmail: string;
  /** A versão do pedido que a pessoa leu (a decisão só vale se ninguém mexeu). */
  versao: number;
}

export type AtivacaoErros = Partial<Record<'nomeParceiro' | 'slug' | 'donoNome' | 'donoEmail' | 'geral', string>>;

/** O formulário de ativação: nome do parceiro, link, nome e e-mail do dono. */
export function lerAtivacao(entrada: Record<string, unknown>): { ok: true; dados: AtivacaoLida } | { ok: false; erros: AtivacaoErros } {
  const erros: AtivacaoErros = {};
  const nomeParceiro = limparTexto(entrada.nomeParceiro);
  if (nomeParceiro.length < L.nome.min || nomeParceiro.length > L.nome.max) {
    erros.nomeParceiro = `Dê um nome com ${L.nome.min} a ${L.nome.max} letras.`;
  }
  const slug = limparTexto(entrada.slug).toLowerCase() || gerarSlug(nomeParceiro);
  if (slug.length < 3 || slug.length > 48 || !SLUG_VALIDO.test(slug)) {
    erros.slug = 'O link usa de 3 a 48 letras minúsculas, números e hífen. Ex.: grupo-valentins.';
  }
  const donoNome = limparTexto(entrada.donoNome);
  if (donoNome.length < L.nome.min || donoNome.length > L.nome.max) erros.donoNome = 'Escreva o nome do dono (pelo menos 2 letras).';
  const donoEmail = normalizarEmail(limparTexto(entrada.donoEmail));
  if (!donoEmail) erros.donoEmail = 'E-mail inválido. Ex.: maria@restaurante.com.br';
  const versao = Number(limparTexto(entrada.versao));
  if (!Number.isInteger(versao) || versao < 1) erros.geral = 'Recarregue a página: faltou a versão do pedido.';
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { nomeParceiro, slug, donoNome, donoEmail: donoEmail!, versao } };
}

/** "Já foi ativado por Rodolfo em 16/10." */
export function fraseJaDecidido(status: EtapaDoPedido, autor: string | null, quando: Date | null): string {
  const o = status === 'ATIVADO' ? 'ativado' : status === 'RECUSADO' ? 'recusado' : 'mexido';
  const por = autor ? ` por ${autor}` : '';
  const dia = quando
    ? ` em ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(quando)}`
    : '';
  return `Este pedido já foi ${o}${por}${dia}. Nada foi criado de novo.`;
}

export const FRASE_PEDIDO_MEXIDO = 'Alguém mexeu neste pedido enquanto você decidia. Recarregue e veja como ficou.';

// ------------------------------------------------------------------ links

/** Só dígitos: o único jeito de um número entrar numa URL. */
export function soDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** Link do WhatsApp (wa.me) para um número E.164 sem "+", com a mensagem já escrita. */
export function linkDoWhatsApp(whatsapp: string, mensagem?: string): string | null {
  const n = soDigitos(whatsapp);
  if (n.length < 10 || n.length > 15) return null;
  return `https://wa.me/${n}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}

/** mailto: do e-mail validado (nunca de texto livre). */
export function linkDoEmail(email: string): string | null {
  const e = normalizarEmail(email);
  return e ? `mailto:${encodeURIComponent(e).replace('%40', '@')}` : null;
}

/** A mensagem que acompanha o link de primeiro acesso no WhatsApp. */
export function mensagemDoConvite(nome: string, link: string): string {
  const primeiro = nome.split(' ')[0] ?? nome;
  return `Oi, ${primeiro}! Aqui é o Rodolfo, da FlowFoods. Seu acesso está pronto. Crie sua senha por este link (vale uma vez só, por 3 dias): ${link}`;
}

// ------------------------------------------------------------------ atraso

/**
 * Dias de atraso (decisão 96): Novo passa do prazo depois de 2 dias na etapa,
 * Em conversa depois de 7 dias sem movimento. Dias corridos, contados no
 * calendário de America/Sao_Paulo. Ativado e Recusado não atrasam.
 */
export function diasDeAtrasoDoPedido(p: { status: EtapaDoPedido; etapaDesde: Date }, agora = new Date()): number {
  if (p.status !== 'NOVO' && p.status !== 'EM_CONVERSA') return 0;
  const dias = diasEntre(hojeNoRio(p.etapaDesde), hojeNoRio(agora));
  return Math.max(0, dias - PRAZO_DO_ATRASO_DIAS[p.status]);
}

/** Dias corridos na etapa (calendário do Rio). */
export function diasNaEtapa(etapaDesde: Date, agora = new Date()): number {
  return Math.max(0, diasEntre(hojeNoRio(etapaDesde), hojeNoRio(agora)));
}

/** "há 3d", "hoje". */
export function textoDaEtapa(etapaDesde: Date, agora = new Date()): string {
  const d = diasNaEtapa(etapaDesde, agora);
  return d === 0 ? 'hoje' : `há ${d}d`;
}

/** Até quando os dados do recusado ficam guardados (180 dias). */
export function guardadoAte(recusadoEm: Date): Date {
  return new Date(recusadoEm.getTime() + RETENCAO_DO_RECUSADO_DIAS * 86_400_000);
}

export { ROTULO_DA_ETAPA };
