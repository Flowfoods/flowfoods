/**
 * O que a Cadência mostra em cada situação (E5.1, decisão 467). Puro: a página só desenha o que sai daqui.
 *
 * - Um botão principal por situação: montar o lote → aprovar → enviar o próximo manual. Nada a fazer: nenhum.
 * - "Montar de novo" só com lote aguardando ou cancelado: aprovado ou enviando fica como está.
 * - "Enviar o próximo" só aparece quando há lote que pode enviar (aprovado, enviando, ou aguardando com aprovação automática)
 *   e o servidor deixaria sair. Lote cancelado, vazio ou inexistente: sem botão de envio.
 * - Espera que passa sozinha (intervalo entre envios, teto da hora): o botão fica na tela, desabilitado, com quando libera,
 *   e a confirmação do envio anterior continua visível. Antes, o botão sumia depois de cada envio do aquecimento.
 * - Recusa que pede ação (disparo desligado, WhatsApp fora): sem botão, com o motivo e o link para Config.
 */

import type { Decisao } from '@/lib/barney/tetos';
import { ENVIOS_MANUAIS_INICIAIS } from '@/lib/barney/regras';

/** Recusas que passam sozinhas com o tempo. */
const ESPERA = new Set(['INTERVALO_MINIMO', 'TETO_HORARIO']);

export interface EntradaDaCadencia {
  lote: { status: string; itens: number } | null;
  /** `podeEnviar(estado, agora, { manual: true })`: o que o botão "Enviar o próximo" passaria. */
  manual: Decisao;
  /** `podeEnviar(estado, agora)`: o que o envio automático passaria. */
  automatico: Decisao;
  totalEnviadoHistorico: number;
  modoAprovacao: boolean;
}

export interface TelaDaCadencia {
  principal: 'montar' | 'aprovar' | 'enviar' | null;
  /** "Montar lote de hoje" / "Montar de novo": sem lote, aguardando ou cancelado. Aprovado ou enviando não se remonta. */
  montar: boolean;
  aprovar: boolean;
  cancelar: boolean;
  envio: null | { habilitado: boolean; texto: string; liberaEmSegundos?: number };
  parado: null | { titulo: string; texto: string; config: 'ligar' | 'conectar' | null };
  faltamManuais: number;
}

/** "45 s", "cerca de 10 min". */
export function quandoLibera(segundos: number): string {
  return segundos < 60 ? `${Math.max(1, Math.ceil(segundos))} s` : `cerca de ${Math.round(segundos / 60)} min`;
}

export function telaDaCadencia(e: EntradaDaCadencia): TelaDaCadencia {
  const faltamManuais = Math.max(0, ENVIOS_MANUAIS_INICIAIS - e.totalEnviadoHistorico);
  const comItens = !!e.lote && e.lote.itens > 0;
  const status = e.lote?.status;
  const aguardando = comItens && status === 'PROPOSTO';
  // Com aprovação manual, o lote só envia depois de aprovado; com aprovação automática, o lote proposto já envia.
  const podeEnviarOLote = comItens && (status === 'APROVADO' || status === 'EM_ENVIO' || (status === 'PROPOSTO' && !e.modoAprovacao));
  const texto = faltamManuais > 0 ? `Enviar o próximo (${ENVIOS_MANUAIS_INICIAIS - faltamManuais + 1} de ${ENVIOS_MANUAIS_INICIAIS})` : 'Enviar o próximo agora';

  let envio: TelaDaCadencia['envio'] = null;
  if (podeEnviarOLote && e.manual.permitido) envio = { habilitado: true, texto };
  else if (podeEnviarOLote && e.manual.motivo && ESPERA.has(e.manual.motivo)) envio = { habilitado: false, texto, liberaEmSegundos: e.manual.tentarEmSegundos };

  // Aprovado ou enviando não se remonta (o servidor mantém o lote como está).
  const montar = !e.lote || status === 'PROPOSTO' || status === 'CANCELADO';
  const principal: TelaDaCadencia['principal'] = !comItens
    ? montar
      ? 'montar'
      : null
    : aguardando && e.modoAprovacao
      ? 'aprovar'
      : envio?.habilitado && faltamManuais > 0
        ? 'enviar'
        : null;

  let parado: TelaDaCadencia['parado'] = null;
  if (status === 'CANCELADO') {
    parado = { titulo: 'Lote cancelado.', texto: 'Nada mais sai hoje. Para voltar a enviar, monte o lote de novo.', config: null };
  } else if (!e.manual.permitido) {
    const espera = envio && !envio.habilitado && envio.liberaEmSegundos ? ` Libera em ${quandoLibera(envio.liberaEmSegundos)}.` : '';
    const config = e.manual.motivo === 'DISPARO_DESLIGADO' ? 'ligar' : e.manual.motivo === 'INSTANCIA_FORA_DO_AR' ? 'conectar' : null;
    parado = { titulo: espera ? 'Aguarde.' : 'Envio parado.', texto: `${e.manual.explicacao ?? ''}${espera}`.trim(), config };
  } else if (podeEnviarOLote && !e.automatico.permitido && e.automatico.motivo !== 'EXIGE_ENVIO_MANUAL') {
    // O manual passa e o automático não (fora da janela, por exemplo): diz por que a fila não anda sozinha.
    parado = { titulo: 'Envio automático parado.', texto: `${e.automatico.explicacao ?? ''} O envio um a um continua liberado.`.trim(), config: null };
  }

  return {
    principal,
    montar,
    aprovar: aguardando,
    cancelar: !!e.lote && status !== 'CANCELADO',
    envio,
    parado,
    faltamManuais,
  };
}

export interface EntradaDoEnvioNoLead {
  temCelular: boolean;
  canal: string;
  status: string;
  pediuParaSair: boolean;
  /** Situação do lote de hoje em que o lead está; null se não está no lote de hoje. */
  loteDeHoje: string | null;
  jaRecebeuHoje: boolean;
  manual: Decisao;
}

/**
 * "Enviar agora" no Lead 360 segue a regra da Cadência (decisão 468): só aparece quando o servidor deixaria sair
 * (`dispararProximo` com o lead escolhido); senão, a tela diz por quê. A ordem é a do servidor.
 */
export function envioNoLead360(e: EntradaDoEnvioNoLead): { pode: boolean; motivo: string | null } {
  const nao = (motivo: string) => ({ pode: false, motivo });
  if (!e.temCelular) return nao('Sem celular válido: este lead não recebe WhatsApp.');
  if (e.canal !== 'WHATSAPP') return nao('Lead de Visita e Instagram: não recebe WhatsApp do Barney.');
  if (e.pediuParaSair || e.status === 'OPT_OUT') return nao('Pediu para sair: nunca recebe mensagem.');
  if (e.status === 'CONFLITO') return nao('Conflito com o Grupo Bibi Sucos: nunca recebe mensagem.');
  if (e.status === 'RESPONDEU') return nao('Já respondeu: continue a conversa pelo Inbox.');
  if (e.loteDeHoje === null) return nao('Não está no lote de hoje. Os envios saem do lote, em Cadência.');
  if (e.loteDeHoje === 'CANCELADO') return nao('O lote de hoje foi cancelado. Nada mais sai hoje.');
  if (e.jaRecebeuHoje) return nao('Já recebeu a mensagem de hoje.');
  if (!e.manual.permitido) return nao(e.manual.explicacao ?? 'O envio está parado agora.');
  return { pode: true, motivo: null };
}
