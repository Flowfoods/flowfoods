/**
 * Motor de agenda da conversa de 30 min.
 *
 * Puro: o instante "agora" ENTRA como parâmetro. Agenda que lê o relógio por
 * dentro não tem como ser testada em véspera de virada de dia — e é exatamente
 * aí que ela erra.
 *
 * Sobre fuso: o Brasil não tem horário de verão desde 2019, então
 * America/Sao_Paulo é UTC-03:00 fixo, e a conversão vira uma soma. É o que
 * dispensa uma biblioteca de fuso inteira aqui dentro. Se o horário de verão
 * voltar, ESTE é o arquivo que precisa passar a usar Luxon — e o teste de
 * `janelaDoDia` vai acusar antes de qualquer cliente marcar errado.
 */

const OFFSET_SAO_PAULO_MIN = -180;
const MS_POR_MIN = 60_000;

export interface JanelaDisponibilidade {
  /** 0 = domingo … 6 = sábado, no calendário de São Paulo. */
  diaDaSemana: number;
  /** `HH:MM` na hora de São Paulo. */
  inicio: string;
  fim: string;
}

export interface Intervalo {
  inicio: string;
  fim: string;
}

export interface OpcoesSlots {
  /** Instante de referência, ISO em UTC. */
  agoraISO: string;
  janelas: JanelaDisponibilidade[];
  /** Agendamentos já confirmados. */
  reservas: Intervalo[];
  /** Bloqueios pontuais do Rodolfo (viagem, compromisso, feriado). */
  bloqueios: Intervalo[];
  duracaoMin?: number;
  bufferMin?: number;
  antecedenciaMinHoras?: number;
  horizonteDias?: number;
}

/** Disponibilidade padrão. Pendência do Rodolfo: ajustar para a agenda real. */
export const JANELAS_PADRAO: JanelaDisponibilidade[] = [
  { diaDaSemana: 1, inicio: "18:30", fim: "21:30" },
  { diaDaSemana: 2, inicio: "18:30", fim: "21:30" },
  { diaDaSemana: 3, inicio: "18:30", fim: "21:30" },
  { diaDaSemana: 4, inicio: "18:30", fim: "21:30" },
  { diaDaSemana: 5, inicio: "18:30", fim: "21:30" },
  { diaDaSemana: 6, inicio: "09:00", fim: "12:00" },
];

function minutosDoRelogio(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  const horas = Number(h);
  const minutos = Number(m);
  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) {
    throw new Error(`[agenda] horário inválido: "${hhmm}" (esperado HH:MM)`);
  }
  return horas * 60 + minutos;
}

/** Epoch em ms do instante `HH:MM` de São Paulo no dia civil informado. */
function instanteEmSaoPaulo(diaUTC: Date, minutosNoDia: number): number {
  const meiaNoiteSP = Date.UTC(
    diaUTC.getUTCFullYear(),
    diaUTC.getUTCMonth(),
    diaUTC.getUTCDate(),
  );
  return meiaNoiteSP + (minutosNoDia - OFFSET_SAO_PAULO_MIN) * MS_POR_MIN;
}

/** O dia civil de São Paulo (como data UTC "achatada") para um instante. */
function diaCivilSP(epochMs: number): Date {
  const deslocado = new Date(epochMs + OFFSET_SAO_PAULO_MIN * MS_POR_MIN);
  return new Date(
    Date.UTC(deslocado.getUTCFullYear(), deslocado.getUTCMonth(), deslocado.getUTCDate()),
  );
}

function conflita(
  inicio: number,
  fim: number,
  intervalos: Intervalo[],
  bufferMs: number,
): boolean {
  return intervalos.some((i) => {
    const i0 = Date.parse(i.inicio);
    const i1 = Date.parse(i.fim);
    if (Number.isNaN(i0) || Number.isNaN(i1)) {
      throw new Error(`[agenda] intervalo inválido: ${i.inicio} → ${i.fim}`);
    }
    return inicio < i1 + bufferMs && i0 < fim + bufferMs;
  });
}

/**
 * Os horários livres, em ISO UTC, do mais cedo para o mais tarde.
 *
 * Regras, todas testadas: 30 min de duração, 15 min de respiro entre conversas,
 * nada antes de 12 h (ninguém marca para daqui a dez minutos) e nada depois de
 * 21 dias (agenda longa demais só produz falta).
 */
export function gerarSlots(o: OpcoesSlots): string[] {
  const duracao = o.duracaoMin ?? 30;
  const buffer = o.bufferMin ?? 15;
  const antecedencia = o.antecedenciaMinHoras ?? 12;
  const horizonte = o.horizonteDias ?? 21;

  const agora = Date.parse(o.agoraISO);
  if (Number.isNaN(agora)) throw new Error(`[agenda] agoraISO inválido: ${o.agoraISO}`);

  const maisCedo = agora + antecedencia * 60 * MS_POR_MIN;
  const maisTarde = agora + horizonte * 24 * 60 * MS_POR_MIN;
  const duracaoMs = duracao * MS_POR_MIN;
  const bufferMs = buffer * MS_POR_MIN;

  const slots: number[] = [];
  const primeiroDia = diaCivilSP(agora);

  // +1 porque o último dia do horizonte também pode ter janela válida.
  for (let d = 0; d <= horizonte + 1; d++) {
    const dia = new Date(primeiroDia.getTime() + d * 24 * 60 * MS_POR_MIN);
    const diaDaSemana = dia.getUTCDay();

    for (const janela of o.janelas) {
      if (janela.diaDaSemana !== diaDaSemana) continue;

      const abre = minutosDoRelogio(janela.inicio);
      const fecha = minutosDoRelogio(janela.fim);
      for (let m = abre; m + duracao <= fecha; m += duracao) {
        const inicio = instanteEmSaoPaulo(dia, m);
        const fim = inicio + duracaoMs;

        if (inicio < maisCedo || inicio > maisTarde) continue;
        if (conflita(inicio, fim, o.reservas, bufferMs)) continue;
        // Bloqueio é parede: não ganha respiro dos dois lados, senão um
        // compromisso de uma hora comeria meia hora de agenda boa.
        if (conflita(inicio, fim, o.bloqueios, 0)) continue;

        slots.push(inicio);
      }
    }
  }

  return [...new Set(slots)].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
}

/**
 * O slot pedido ainda está de pé?
 *
 * Existe separado de `gerarSlots` porque a checagem que importa é a da HORA DA
 * GRAVAÇÃO, não a da hora em que a tela desenhou a lista: entre uma e outra
 * cabe outro cliente pegando o mesmo horário. Quem grava chama isto dentro da
 * transação, junto com o índice único de (início, status confirmado).
 */
export function slotDisponivel(inicioISO: string, o: OpcoesSlots): boolean {
  return gerarSlots(o).includes(new Date(Date.parse(inicioISO)).toISOString());
}

/** Rótulo em português para a tela: `sáb, 30/08 às 09:00`. */
export function rotularSlot(inicioISO: string): string {
  const epoch = Date.parse(inicioISO);
  if (Number.isNaN(epoch)) throw new Error(`[agenda] slot inválido: ${inicioISO}`);
  const sp = new Date(epoch + OFFSET_SAO_PAULO_MIN * MS_POR_MIN);
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dd = String(sp.getUTCDate()).padStart(2, "0");
  const mm = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(sp.getUTCHours()).padStart(2, "0");
  const mi = String(sp.getUTCMinutes()).padStart(2, "0");
  return `${dias[sp.getUTCDay()]}, ${dd}/${mm} às ${hh}:${mi}`;
}
