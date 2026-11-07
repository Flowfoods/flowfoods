/** Apresentação exata dos inteiros decimais do Analytics; nunca passa dinheiro por Number. */
import type { FracaoAnalytics } from '@/lib/integracoes/ifood/painel-campos';
const INTEIRO = /^(?:0|[1-9]\d*|-[1-9]\d*)$/;

function inteiro(valor: string): bigint {
  if (!INTEIRO.test(valor)) throw new RangeError('Inteiro decimal do Analytics inválido.');
  return BigInt(valor);
}

function grupos(valor: string): string {
  return valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function quantidadeAnalytics(valor: string): string {
  const n = inteiro(valor);
  return `${n < 0n ? '−' : ''}${grupos((n < 0n ? -n : n).toString())}`;
}

export function dinheiroAnalytics(centavos: string): string {
  const n = inteiro(centavos), absoluto = n < 0n ? -n : n;
  return `${n < 0n ? '−' : ''}R$ ${grupos((absoluto / 100n).toString())},${(absoluto % 100n).toString().padStart(2, '0')}`;
}

/** Metade afastando de zero; arredonda apenas o texto final, sem alterar a fração recebida. */
function arredondar(fracao: FracaoAnalytics, escala: bigint): bigint {
  const n = inteiro(fracao.numerador), d = inteiro(fracao.denominador);
  if (d <= 0n) throw new RangeError('A apresentação de uma fração exige denominador positivo.');
  const absoluto = (n < 0n ? -n : n) * escala;
  const q = absoluto / d + (2n * (absoluto % d) >= d ? 1n : 0n);
  return n < 0n ? -q : q;
}

/** Numerador em centavos, denominador em pedidos; mantém os dois inteiros exatos até a apresentação. */
export function ticketAnalytics(fracao: FracaoAnalytics): string {
  return dinheiroAnalytics(arredondar(fracao, 1n).toString());
}

/** Fração de pedidos (não percentual pré-multiplicado); uma casa decimal, arredondada só para exibição. */
export function percentualAnalytics(fracao: FracaoAnalytics): string {
  const n = arredondar(fracao, 1_000n), absoluto = n < 0n ? -n : n;
  return `${n < 0n ? '−' : ''}${grupos((absoluto / 10n).toString())},${absoluto % 10n}%`;
}

/** Dia civil já validado pelo domínio. Não aplica o fuso do browser à meia-noite UTC. */
export function diaAnalytics(dia: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : 'Dia não disponível';
}

/** Instantes de publicação são distintos do dia civil e sempre apresentados em São Paulo. */
export function instanteAnalytics(valor: string): string {
  const d = new Date(valor);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d) : 'Data não disponível';
}
