/**
 * O que a tela do Portal do cliente decide (E5.1, decisão 471). Puro, testado, sem React.
 *
 * - O estado da barra sai dos cartões: se algum não salvou, a barra diz que não salvou (antes, um anexo que subia punha
 *   "Tudo salvo" com texto falhando em outro cartão, e uma marcação que falhava deixava "Sem conexão" para sempre).
 * - O selo do cartão diz "Não salvo" enquanto o cartão está em erro (antes dizia "Respondido" ao lado de "Não salvou").
 * - O rascunho guardado no aparelho só volta quando difere do que o servidor tem.
 */

export type StatusSalvar = 'ocioso' | 'salvando' | 'salvo' | 'erro' | 'erro-marcar' | 'recusado';
export type EstadoDoItem = 'RECEBIDO' | 'MARCADO' | 'PENDENTE';

/** A barra: erro de conexão > texto recusado > marcação que falhou > salvando (ou anexo subindo) > salvo > ocioso. */
export function statusGeral(statusItens: Record<string, StatusSalvar>, uploads = 0): StatusSalvar {
  const v = Object.values(statusItens);
  for (const s of ['erro', 'recusado', 'erro-marcar'] as const) if (v.includes(s)) return s;
  if (uploads > 0 || v.includes('salvando')) return 'salvando';
  return v.includes('salvo') ? 'salvo' : 'ocioso';
}

export const ROTULO_DA_BARRA: Record<StatusSalvar, string> = {
  ocioso: 'Salva sozinho. Pode fechar e voltar por este link.',
  salvando: 'Salvando…',
  salvo: 'Tudo salvo. Pode fechar e voltar por este link.',
  erro: 'Sem conexão. Tentando salvar de novo…',
  'erro-marcar': 'Uma marcação não salvou. Toque nela de novo.',
  recusado: 'Uma resposta não salvou: texto longo demais.',
};

export const ROTULO_DO_CARTAO: Partial<Record<StatusSalvar, string>> = {
  salvando: 'Salvando…',
  salvo: 'Salvo',
  erro: 'Não salvou. Tentando de novo…',
  'erro-marcar': 'Não marcou. Toque de novo.',
  recusado: 'Não salvou: texto longo demais. Divida em partes ou anexe como arquivo.',
};

/** O selo do cartão: "Não salvo" vence; marcado diz qual marcação ("Não tenho"); respondido; pendente. */
export function seloDoCartao(estado: EstadoDoItem, status: StatusSalvar, rotuloDaMarcacao: string | null): { rotulo: string; tom: 'erro' | 'forte' | 'suave' } {
  if (status === 'erro' || status === 'recusado' || status === 'erro-marcar') return { rotulo: 'Não salvo', tom: 'erro' };
  if (estado === 'RECEBIDO') return { rotulo: 'Respondido', tom: 'forte' };
  if (estado === 'MARCADO') return { rotulo: rotuloDaMarcacao ?? 'Marcado', tom: 'forte' };
  return { rotulo: 'Pendente', tom: 'suave' };
}

/** "Enviado ao Rodolfo em 25/10, às 14:32. O que você mudar continua salvo." (hora de São Paulo, igual no servidor e no aparelho). */
export function textoDoEnviado(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
  return `Enviado ao Rodolfo em ${dia}, às ${hora}. O que você mudar continua salvo.`;
}

/** O que impede o envio agora (gravação em andamento, áudio gravado e não salvo, anexo subindo), ou null. Calculado na hora. */
export function bloqueioDoEnvio(audiosPendentes: number, uploads: number, gravando = 0): string | null {
  if (gravando > 0) return 'Há uma gravação em andamento. Toque em “Parar” e depois em “Salvar áudio”.';
  if (audiosPendentes > 0) return `Há ${audiosPendentes === 1 ? 'um áudio gravado' : `${audiosPendentes} áudios gravados`} que ainda não ${audiosPendentes === 1 ? 'foi salvo' : 'foram salvos'}. Toque em “Salvar áudio” no item.`;
  if (uploads > 0) return 'Espere o anexo terminar de subir.';
  return null;
}

/** Um rascunho guardado no aparelho: o texto e quando foi escrito. */
export interface Rascunho {
  t: string;
  em: number;
}

/**
 * Os rascunhos do aparelho que devem voltar: diferentes do que o servidor tem E escritos depois da resposta do servidor.
 * Sem a hora, um rascunho antigo do celular apagaria a resposta que o cliente deu depois no computador. Rascunho sem hora
 * (formato antigo) só volta se o servidor não tem resposta.
 */
export function rascunhosParaRecuperar(
  rascunhos: Record<string, unknown>,
  doServidor: Record<string, { texto: string; em: number | null }>,
  itensValidos: Set<string>,
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [id, valor] of Object.entries(rascunhos)) {
    if (!itensValidos.has(id)) continue;
    const servidor = doServidor[id];
    const texto = typeof valor === 'string' ? valor : valor && typeof valor === 'object' && typeof (valor as Rascunho).t === 'string' ? (valor as Rascunho).t : null;
    if (texto === null || texto === (servidor?.texto ?? '')) continue;
    const em = typeof valor === 'object' && valor && typeof (valor as Rascunho).em === 'number' ? (valor as Rascunho).em : null;
    const servidorTemResposta = !!servidor?.texto;
    if (em === null ? !servidorTemResposta : !servidorTemResposta || servidor.em === null || em > servidor.em) saida[id] = texto;
  }
  return saida;
}

/** Chave do rascunho no aparelho: uma por link de cliente. */
export const chaveDoRascunho = (token: string) => `ff-portal-rascunho:${token}`;
