/**
 * Os nomes que o painel do nível 1 mostra no lugar dos códigos do banco (E5.1, decisão 466). Um mapa só, para a mesma situação
 * ter o mesmo nome em Hoje, Cadência, Inbox, Leads e no Lead 360. Código que não está no mapa aparece como veio (nunca some).
 */

import { TOQUES } from '@/lib/barney/regras';

export const ROTULO_DO_LEAD: Record<string, string> = {
  NOVO: 'Novo',
  EM_CADENCIA: 'Em cadência',
  RESPONDEU: 'Respondeu',
  DIAGNOSTICO_PREENCHIDO: 'Diagnóstico preenchido',
  DIAGNOSTICO_AGENDADO: 'Diagnóstico agendado',
  DIAGNOSTICO_FEITO: 'Diagnóstico feito',
  PROPOSTA: 'Proposta',
  CLIENTE: 'Cliente',
  PERDIDO: 'Perdido',
  OPT_OUT: 'Pediu para sair',
  CONFLITO: 'Conflito (Bibi)',
};

export const ROTULO_DA_INTENCAO: Record<string, string> = {
  INTERESSADO: 'Interessado',
  PERGUNTA: 'Pergunta',
  DEPOIS: 'Pediu para depois',
  RECUSA: 'Recusou',
  OPT_OUT: 'Pediu para sair',
  OUTRO: 'Outro',
};

export const ROTULO_DO_LOTE: Record<string, string> = {
  PROPOSTO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  EM_ENVIO: 'Enviando',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

export const ROTULO_DA_MENSAGEM: Record<string, string> = {
  PENDENTE: 'Pendente',
  AGENDADA: 'Agendada',
  ENVIADA: 'Enviada',
  ENTREGUE: 'Entregue',
  LIDA: 'Lida',
  FALHA: 'Falhou',
  RECUSADA: 'Recusada',
};

export const ROTULO_DA_INSCRICAO: Record<string, string> = {
  ATIVA: 'Ativa',
  PAUSADA_RESPOSTA: 'Pausada (respondeu)',
  PAUSADA_MANUAL: 'Pausada à mão',
  CONCLUIDA: 'Concluída',
  OPT_OUT: 'Pediu para sair',
};

export const ROTULO_DO_TIPO_DE_TELEFONE: Record<string, string> = {
  CELULAR: 'Celular',
  FIXO: 'Fixo',
  INVALIDO: 'Inválido',
};

export const ROTULO_DO_CANAL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  VISITA: 'Visita',
};

/** O motivo gravado na pausa da cadência (`Enrollment.motivoPausa`). */
export const ROTULO_DA_PAUSA: Record<string, string> = {
  RESPOSTA: 'Respondeu',
  OPT_OUT: 'Pediu para sair',
  'OPT_OUT manual': 'Pediu para sair (registrado à mão)',
};

/** A ordem vem de `TOQUES`: "D0" → "1ª mensagem (dia 0)", "D4" → "2ª mensagem (dia 4)"; dia fora da cadência → "mensagem do dia 7". */
export function rotuloDoToque(toque: string | null | undefined): string {
  if (!toque) return '—';
  const m = /^D\+?(\d+)$/.exec(toque.trim());
  if (!m) return toque;
  const dia = Number(m[1]);
  const i = TOQUES.findIndex((t) => t.offsetDias === dia);
  return i >= 0 ? `${i + 1}ª mensagem (dia ${dia})` : `mensagem do dia ${dia}`;
}

/** O toque que sai depois do último enviado (sem nenhum: o primeiro). Depois do último da cadência: nenhum. */
export function proximoToque(ultimo: string | null | undefined): string | null {
  if (!ultimo) return TOQUES[0].toque;
  const i = TOQUES.findIndex((t) => t.toque === ultimo);
  return i >= 0 ? (TOQUES[i + 1]?.toque ?? null) : null;
}

/**
 * O texto de um evento da linha do tempo do lead. Os eventos de envio foram gravados com o código do toque ("D0 enviado.");
 * a tela traduz na leitura, sem reescrever o que está no banco.
 */
export function textoDoEvento(descricao: string): string {
  if (descricao === 'Opt-out registrado à mão.') return 'Pediu para sair (registrado à mão).';
  if (descricao === 'Movido para Visita / Instagram.') return 'Movido para Visita e Instagram.';
  if (descricao === 'Fixo — vai para a lista Visita / Instagram.') return 'Telefone fixo: vai para Visita e Instagram.';
  if (descricao === 'Telefone em opt-out permanente. Não entra em cadência.') return 'Este telefone já pediu para sair: entra na lista, mas nunca recebe mensagem.';
  const semCel = /^Sem celular válido \((.*)\)\.$/.exec(descricao);
  if (semCel) return `Sem celular válido (${semCel[1].replace(/curto demais \((\d+) digitos\)/, '$1 dígitos, curto demais').replace(/longo demais \((\d+) digitos\)/, '$1 dígitos, longo demais').replace('sem digitos', 'sem dígitos').replace(/DDD inexistente \((\d+)\)/, 'DDD $1 não existe')}): vai para Visita e Instagram.`;
  const imp = /^(Importado no lote .+) \((NOVO|ATUALIZADO)\)\.$/.exec(descricao);
  if (imp) return `${imp[1]} (${imp[2] === 'NOVO' ? 'novo' : 'atualizado'}).`;
  const m = /^(D\+?\d+) (enviado\.|simulado — nada foi enviado\.)$/.exec(descricao);
  if (!m) return descricao;
  return `${rotuloDoToque(m[1])} ${m[2] === 'enviado.' ? 'enviada.' : 'simulada, nada foi enviado.'}`;
}

/**
 * A recusa de um envio como a tela mostra. O serviço devolve o código na frente ("DISPARO_DESLIGADO: Disparo desligado."),
 * que é o que o log e a auditoria guardam; a tela tira o código e, quando a saída é em Config, diz onde.
 */
export function textoDaRecusa(motivo: string | null | undefined): string {
  if (!motivo) return 'Não enviou.';
  if (motivo.startsWith('FALHA após ')) return `Não saiu depois de ${motivo.slice('FALHA após '.length)}`;
  const m = /^([A-Z][A-Z0-9_]+): ([\s\S]*)$/.exec(motivo);
  if (!m) return motivo;
  const [, codigo, resto] = m;
  if (codigo === 'DISPARO_DESLIGADO') return 'Disparo desligado. Ligue em Config.';
  if (codigo === 'INSTANCIA_FORA_DO_AR') return `${resto} Conecte em Config.`;
  if (codigo === 'VALIDADOR') return `A mensagem não passou na conferência do texto: ${resto.replace(/\b[A-Z][A-Z0-9_]+: /g, '')}`;
  if (codigo === 'DEDUP') return 'Esta mensagem já saiu (ou já está na fila) para este lead hoje.';
  return resto;
}

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const juntar = (partes: string[]) => (partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`);

/** O retorno da importação de leads em frase, sem "(s)" e só com o que aconteceu: "120 linhas lidas: 80 novos, 10 atualizados e 3 recusados por conflito com o Bibi." */
export function resumoDaImportacao(r: { total: number; novos: number; atualizados: number; bloqueadosConflito: number; bloqueadosOptOut: number; semTelefone: number; invalidos: number }): string {
  const partes = [contar(r.novos, 'novo', 'novos'), contar(r.atualizados, 'atualizado', 'atualizados')];
  if (r.bloqueadosConflito) partes.push(`${r.bloqueadosConflito} em conflito com o Bibi`);
  if (r.bloqueadosOptOut) partes.push(`${r.bloqueadosOptOut} que já ${r.bloqueadosOptOut === 1 ? 'pediu' : 'pediram'} para sair`);
  if (r.semTelefone) partes.push(`${r.semTelefone} sem celular (em Visita e Instagram)`);
  if (r.invalidos) partes.push(contar(r.invalidos, 'linha inválida', 'linhas inválidas'));
  const bloqueio = r.bloqueadosConflito || r.bloqueadosOptOut ? ' Conflito com o Bibi e quem pediu para sair entram na lista, mas nunca recebem mensagem.' : '';
  return `${contar(r.total, 'linha lida', 'linhas lidas')}: ${juntar(partes)}.${bloqueio}`;
}

/** "5521990001111" → "(21) 99000-1111"; "552133332222" → "(21) 3333-2222"; fora desse formato, como veio. */
export function telefoneLegivel(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** O rótulo do mapa, ou o código como veio. */
export const rotulo = (mapa: Record<string, string>, codigo: string | null | undefined, vazio = '—') => (codigo ? (mapa[codigo] ?? codigo) : vazio);
