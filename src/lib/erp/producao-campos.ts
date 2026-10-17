/**
 * Produção do pré-preparo (3.1) — regras PURAS, sem banco e sem Next: o estado do lote, o código dele, a faixa de rendimento,
 * a leitura de "concluir", o custo do lote (as baixas reais ÷ o que saiu, em fração exata), a perda em R$, a validade e as
 * frases. As telas e `producao.ts` usam as mesmas funções.
 *
 * Princípios:
 * - a produção CRIA a requisição dela (os insumos baixam pela ENTREGA dela, como em qualquer requisição); concluir exige a
 *   requisição atendida, então o custo só fecha com a saída final;
 * - o custo do lote é o que SAIU do livro (Σ das baixas e dos estornos da requisição), nunca o previsto pela ficha; o previsto
 *   aparece ao lado para comparar. Custo por unidade = fração exata (centavos ÷ quantidade), nunca gravada; um
 *   arredondamento, na tela. Baixa sem preço (valor 0) deixa o custo INCOMPLETO, nunca R$ 0,00;
 * - rendimento fora de ±10% do planejado pede o motivo; lote perdido (0) também;
 * - o lote não muda depois de concluído: produzido, custo, código e validade são fotografia.
 */

import { diasEntre } from './contagem-campos';
import { formatarData } from './compra-campos';
import { ORDEM_DAS_CONSERVACOES, CONSERVACOES, type Conservacao, type Validades } from './validade';
import { formatarQuantidade, lerQuantidadeNa, porRendimento, type Escala, type Fracao, type Unidade } from './unidades';
import { TETO_DA_CONTAGEM } from './estoque-campos';

// ================================================================ estado

export type StatusDaProducao = 'PLANEJADA' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'CANCELADA';

/** As colunas do quadro, na ordem do processo. */
export const ORDEM_DO_QUADRO: StatusDaProducao[] = ['PLANEJADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA'];

export const ROTULO_DA_PRODUCAO: Record<StatusDaProducao, string> = {
  PLANEJADA: 'Planejada',
  EM_EXECUCAO: 'Em produção',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Coluna do quadro (plural). As duas últimas mostram só o dia de hoje. */
export const COLUNA_DO_QUADRO: Record<StatusDaProducao, string> = {
  PLANEJADA: 'Planejadas',
  EM_EXECUCAO: 'Em produção',
  CONCLUIDA: 'Concluídas hoje',
  CANCELADA: 'Canceladas hoje',
};

/** O histórico DENTRO do lote fala do estado dele, não do verbo de quem fez. */
export const TITULO_NO_HISTORICO_DO_LOTE: Readonly<Record<string, string>> = {
  PLANEJOU: 'Planejado',
  INICIOU: 'Em produção',
  CONCLUIU: 'Concluído',
  CANCELOU: 'Cancelado',
  ESTORNOU: 'Estornado',
};

export const pendente = (s: StatusDaProducao) => s === 'PLANEJADA' || s === 'EM_EXECUCAO';

/** Dias de atraso: planejada ou em produção com o dia planejado já passado (datas do Rio). Concluída e cancelada não atrasam. */
export function diasDeAtrasoDoLote(l: { status: StatusDaProducao; dataPlanejada: string | null }, hoje: string): number {
  if (!pendente(l.status) || !l.dataPlanejada || l.dataPlanejada >= hoje) return 0;
  return diasEntre(l.dataPlanejada, hoje);
}

/** Lote concluído e depois estornado: CANCELADA que guarda `concluidaEm`. */
export const foiEstornado = (l: { status: StatusDaProducao; concluidaEm: Date | null }) => l.status === 'CANCELADA' && l.concluidaEm !== null;

// ================================================================ o código do lote

/** "2026-10-17" e a sequência do dia → "261017-01". Depois de 99 no dia, 3 e 4 dígitos (o CHECK do banco aceita até 4). */
export function codigoDoLote(dia: string, sequencia: number): string {
  const [a, m, d] = dia.split('-');
  return `${a.slice(2)}${m}${d}-${String(sequencia).padStart(2, '0')}`;
}

/** A sequência de um código de lote ("261017-07" → 7); fora do formato, null. */
export function sequenciaDoLote(codigo: string): number | null {
  const m = /^\d{6}-(\d{2,4})$/.exec(codigo);
  return m ? Number(m[1]) : null;
}

/** Até quantos lotes num dia (4 dígitos no CHECK do banco). */
export const LOTES_POR_DIA = 9999;

// ================================================================ planejar

/** A chave de um envio do formulário (duplo clique, rede que volta): texto curto e sem estranheza; fora disso, sem chave. */
export function lerChaveDoEnvio(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

export const LIMITE_DA_OBSERVACAO = 280;

// ================================================================ rendimento

/** Fora de ±10% do planejado pede o motivo da diferença. */
export const FAIXA_DO_RENDIMENTO_BP = 1000;

export interface RendimentoDoLote {
  /** produzido ÷ planejado, em pontos-base arredondado (92% = 9200). */
  rendimentoBp: number;
  /** planejado − produzido (positivo = saiu menos do que o planejado). */
  diferencaMilesimos: number;
  /** Fora da faixa de ±10%: o motivo é obrigatório. */
  foraDaFaixa: boolean;
}

export function rendimentoDoLote(planejadoMilesimos: number, produzidoMilesimos: number): RendimentoDoLote {
  const p = BigInt(planejadoMilesimos);
  const r = BigInt(produzidoMilesimos);
  const bp = (2n * r * 10000n + p) / (2n * p);
  const desvio = r > p ? r - p : p - r;
  return {
    rendimentoBp: Number(bp),
    diferencaMilesimos: planejadoMilesimos - produzidoMilesimos,
    // Estritamente fora: exatamente 10% abaixo ou acima ainda é "dentro".
    foraDaFaixa: desvio * 10000n > p * BigInt(FAIXA_DO_RENDIMENTO_BP),
  };
}

/** "92%" (sem casa quando inteiro, uma casa senão: "91,7%"). */
export function formatarRendimento(bp: number): string {
  const inteiro = bp % 100 === 0;
  return `${(bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 1, maximumFractionDigits: 1 })}%`;
}

// ================================================================ concluir

export interface ContextoDaConclusao {
  planejadoMilesimos: number;
  unidade: Unidade;
  /** A validade da ficha AGORA (a conservação escolhida vem das aceitas dela); null = ficha sem validade. */
  validades: Validades | null;
}

export interface ConclusaoLida {
  produzidoMilesimos: number;
  /** O motivo da diferença (obrigatório fora da faixa e no lote perdido; opcional dentro). */
  motivo: string | null;
  conservacao: Conservacao | null;
  validadeMin: number | null;
}

const ehConservacao = (v: unknown): v is Conservacao => typeof v === 'string' && (ORDEM_DAS_CONSERVACOES as readonly string[]).includes(v);

/**
 * Lê "concluir" (os textos do formulário): quanto saiu de verdade (0 a 2× o planejado, na unidade da ficha), o motivo
 * (3 a 200 letras; obrigatório fora de ±10% e no lote perdido) e a conservação, entre as aceitas da ficha (padrão: a
 * principal). Ficha sem validade conclui sem conservação ("Validade não informada" fica em atenção, não trava).
 */
export function lerConclusao(
  f: { produzido: unknown; escala: unknown; motivo: unknown; conservacao: unknown },
  c: ContextoDaConclusao,
): { ok: true; conclusao: ConclusaoLida } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const texto = typeof f.produzido === 'string' ? f.produzido.trim() : '';
  const escala: Escala = f.escala === 'menor' && c.unidade !== 'UN' ? 'menor' : 'base';
  const q = texto ? lerQuantidadeNa(texto, c.unidade, escala) : null;
  let produzido = 0;
  if (q === null) {
    erros.produzido = texto === '' ? 'Diga quanto saiu de verdade (0 se o lote se perdeu).' : `Quanto saiu: número como 4,6 (${c.unidade === 'UN' ? 'un' : c.unidade === 'L' ? 'L' : 'kg'}) ou inteiro em ${c.unidade === 'L' ? 'ml' : c.unidade === 'KG' ? 'g' : 'un'}.`;
  } else if (q > c.planejadoMilesimos * 2 || q > TETO_DA_CONTAGEM) {
    erros.produzido = `${formatarQuantidade(q, c.unidade)} passa do dobro do planejado (${formatarQuantidade(c.planejadoMilesimos, c.unidade)}). Confira o número.`;
  } else produzido = q;

  const bruto = typeof f.motivo === 'string' ? f.motivo.trim().replace(/\s+/g, ' ') : '';
  const motivo: string | null = bruto || null;
  if (motivo && motivo.length > 200) erros.motivo = 'Motivo: até 200 letras.';
  else if (motivo && motivo.length < 3) erros.motivo = 'Motivo: pelo menos 3 letras.';
  if (q !== null && !erros.produzido) {
    const r = rendimentoDoLote(c.planejadoMilesimos, produzido);
    if (produzido === 0 && !motivo) erros.motivo = 'Lote perdido: diga o que aconteceu (ex.: queimou, caiu no chão).';
    else if (produzido > 0 && r.foraDaFaixa && !motivo) {
      erros.motivo = `Saiu ${formatarQuantidade(produzido, c.unidade)} de ${formatarQuantidade(c.planejadoMilesimos, c.unidade)} planejados (${formatarRendimento(r.rendimentoBp)}): diga o motivo da diferença.`;
    }
  }

  // Conservação: entre as aceitas da ficha de agora; padrão = a principal. Lote perdido não vai para a prateleira.
  let conservacao: Conservacao | null = null;
  let validadeMin: number | null = null;
  const aceitas = c.validades ? ORDEM_DAS_CONSERVACOES.filter((x) => c.validades!.minutos[x] !== undefined) : [];
  if (aceitas.length > 0 && produzido > 0 && q !== null) {
    const pedida = typeof f.conservacao === 'string' && f.conservacao !== '' ? f.conservacao : null;
    if (pedida !== null && !(ehConservacao(pedida) && aceitas.includes(pedida))) {
      erros.conservacao = `A ficha não aceita “${ehConservacao(pedida) ? CONSERVACOES[pedida] : pedida}”: escolha uma das conservações dela.`;
    } else {
      conservacao = (pedida as Conservacao | null) ?? c.validades!.principal;
      validadeMin = c.validades!.minutos[conservacao] ?? null;
    }
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, conclusao: { produzidoMilesimos: produzido, motivo, conservacao, validadeMin } };
}

/** Quando o lote vence: o instante da conclusão mais os minutos da conservação escolhida. */
export const validadeDoLote = (concluidaEm: Date, minutos: number): Date => new Date(concluidaEm.getTime() + minutos * 60_000);

// ================================================================ cancelar e estornar

/** O motivo de cancelar/estornar: 3 a 200 letras. */
export function lerMotivo(v: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (t.length < 3) return { ok: false, erro: 'Diga o motivo (pelo menos 3 letras).' };
  if (t.length > 200) return { ok: false, erro: 'Motivo: até 200 letras.' };
  return { ok: true, motivo: t };
}

// ================================================================ o custo do lote

/** O líquido de um insumo na requisição do lote: o que saiu do livro menos o que voltou (baixas + estornos), quantidade e valor. */
export interface BaixaDoInsumo {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  /** Soma do livro (negativa: saiu). */
  quantidadeMilesimos: number;
  /** Soma do livro (negativa ou zero). */
  valorCentavos: number;
}

export interface CustoDoLote {
  /** O que saiu do estoque, em centavos (≥ 0). Parcial se houver insumo sem preço. */
  totalCentavos: number;
  /** Insumos que saíram sem valor (sem preço na entrega): o custo é INCOMPLETO. */
  semPreco: { insumoId: string; nome: string }[];
  /** Algum insumo saiu de fato (líquido). Sem isso o lote não tem custo para fechar. */
  saiuAlgo: boolean;
}

export function custoDoLote(baixas: readonly BaixaDoInsumo[]): CustoDoLote {
  const saiu = baixas.filter((b) => b.quantidadeMilesimos !== 0);
  const total = baixas.reduce((s, b) => s + b.valorCentavos, 0);
  return {
    totalCentavos: Math.max(0, -total),
    semPreco: saiu.filter((b) => b.valorCentavos === 0).map((b) => ({ insumoId: b.insumoId, nome: b.nome })),
    saiuAlgo: saiu.length > 0,
  };
}

/** "sem contar Leite", "sem contar Leite e Cebola", "sem contar Leite, Cebola e Sal". */
export function fraseSemPreco(nomes: readonly string[]): string {
  const n = nomes.length;
  const lista = n <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[n - 1]}`;
  return `sem contar ${lista}`;
}

/** Custo de 1 unidade (kg, L, un) do lote: centavos ÷ (quantidade ÷ 1000), exato. Sem nada produzido, null. */
export function custoPorUnidadeDoLote(totalCentavos: number, produzidoMilesimos: number): Fracao | null {
  if (produzidoMilesimos <= 0) return null;
  return porRendimento({ num: BigInt(totalCentavos), den: 1n }, produzidoMilesimos);
}

/** O que a diferença de rendimento custou: custo × (planejado − produzido) ÷ planejado, em centavos exatos (positivo = perdeu). */
export function perdaDoLote(totalCentavos: number, planejadoMilesimos: number, produzidoMilesimos: number): Fracao {
  return { num: BigInt(totalCentavos) * BigInt(planejadoMilesimos - produzidoMilesimos), den: BigInt(planejadoMilesimos) };
}

/** Qual é a situação da requisição do lote, em palavras (a do cartão do quadro). */
export function situacaoDosInsumos(status: 'ABERTA' | 'PARCIAL' | 'ATENDIDA' | 'CANCELADA' | null, numero: number | null): string {
  const n = numero ? ` #${numero}` : '';
  if (status === 'ATENDIDA') return `insumos entregues${n}`;
  if (status === 'PARCIAL') return `insumos: entrega em parte${n}`;
  if (status === 'CANCELADA') return `requisição cancelada${n}`;
  return `insumos: falta entregar${n}`;
}

/**
 * Por que o lote ainda não conclui: o que falta sair pela requisição ("Faltam sair 885 g de Cebola pela requisição #12:
 * entregue ou encerre o resto."). null = tudo saiu (ou o resto foi encerrado).
 */
export function fraseDoQueFalta(itens: readonly { nome: string; unidade: Unidade; faltaMilesimos: number }[], numero: number | null): string | null {
  const falta = itens.filter((i) => i.faltaMilesimos > 0).map((i) => `${formatarQuantidade(i.faltaMilesimos, i.unidade)} de ${i.nome}`);
  if (falta.length === 0) return null;
  const lista = falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}`;
  return `Faltam sair ${lista} pela requisição ${numero ? `#${numero}` : ''}`.trimEnd() + ': entregue ou encerre o resto.';
}

/** "20/10 às 10:00": o vencimento do lote para a tela. */
export function quandoVence(d: Date): string {
  const f = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return f.format(d).replace(',', ' às');
}

/** "17/10/2026" a partir do dia planejado (aaaa-mm-dd). */
export const diaDoLote = (dia: string) => formatarData(dia);
