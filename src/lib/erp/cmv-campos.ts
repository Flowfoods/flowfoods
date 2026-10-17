/**
 * Os dois CMVs (2.3) — a CONTA e as regras, puras (sem banco e sem Next).
 *
 *  - CMV de COMPRA (decisão 160): o que foi comprado no período, pela DATA DA NOTA. Vale no dia a dia,
 *    mesmo com o estoque ainda fechado, e mede o que a casa gastou comprando, não o que consumiu.
 *  - CMV REAL (decisão 161): estoque inicial + compras − estoque final. Só existe com o período
 *    ENCERRADO e os dois estoques apurados; é o que a casa consumiu de fato.
 *
 * O ESTOQUE FINAL (decisão 162) é o retrato do fechamento de estoque do período, corrigido pelos movimentos que
 * o retrato não podia saber: o que entrou entre o retrato e o fim do período soma, o que o retrato já
 * trazia de depois do fim sai. A competência do movimento é a data da nota (compra) ou o dia do Rio
 * em que entrou no livro (todo o resto). O estoque inicial de um período é SEMPRE o estoque final do
 * anterior, pela mesma regra (nunca reavaliado): por isso o real de períodos seguidos encadeia ao centavo.
 *
 * Em cada loja vale o real, quando apurado; senão o de compra, com o selo da fonte; nenhuma nota e nenhum
 * real é NULO com a frase, nunca R$ 0,00. A rede soma o que vale em cada loja (decisão 165).
 */

import { formatarData } from './compra-campos';
import type { Periodo } from './periodo-campos';
import { formatarDinheiro } from './unidades';

export type FonteDoCmv = 'real' | 'compras';

/** O real de uma loja num período, com tudo de onde ele saiu (vai inteiro para a fotografia). */
export interface RealApurado {
  centavos: number;
  inicialCentavos: number;
  finalCentavos: number;
  /** Σ das entradas de compra que o livro registrou, pela data da nota. */
  comprasReaisCentavos: number;
  inicialDe: 'fechamento' | 'abertura';
  /** Quando o fechamento de estoque tirou o retrato (ISO). */
  retratoEm: string;
  fechamentoId: string;
  aberturaId: string | null;
  /** Insumos sem preço nos dois retratos; nulo = contagem de antes do registro ("não registrado"). */
  semPrecoInicial: number | null;
  semPrecoFinal: number | null;
}

export interface CmvDaLoja {
  lojaId: string;
  lojaNome: string;
  /** Notas LANÇADAS do recorte pela data da nota; nulo = nenhuma nota. */
  compraCentavos: number | null;
  real: RealApurado | null;
  /** Por que o real não foi apurado; nulo quando foi. */
  motivoSemReal: string | null;
}

export interface CmvDoDre {
  lojas: readonly CmvDaLoja[];
  /** O período em curso: a compra vai só até ontem. */
  parcial: boolean;
}

export const SEM_CMV: CmvDoDre = { lojas: [], parcial: false };

// ================================================================ o corte do estoque final

/**
 * Estoque final do período = o retrato do fechamento + o que entrou depois do retrato e é do período −
 * o que o retrato já trazia e é do período seguinte. Os ajustes do próprio fechamento não entram em
 * nenhum dos dois lados: são do período dele, mesmo aplicados depois do fim.
 */
export function estoqueFinalDoPeriodo(d: { retratoCentavos: number; depoisCentavos: number; antesCentavos: number }): number {
  return d.retratoCentavos + d.depoisCentavos - d.antesCentavos;
}

/** CMV real = estoque inicial + compras − estoque final. */
export function cmvReal(d: { inicialCentavos: number; comprasReaisCentavos: number; finalCentavos: number }): number {
  return d.inicialCentavos + d.comprasReaisCentavos - d.finalCentavos;
}

// ================================================================ apurar o real de uma loja

/** Um fechamento de estoque aplicado, com o corte já somado (relativo ao fim do período DELE). */
export interface FechoDeEstoque {
  id: string;
  /** O instante do retrato (ISO). */
  fechadaEm: string;
  valorTotalCentavos: number;
  itensSemPreco: number | null;
  /** Movimentos depois do retrato que são do período. */
  depoisCentavos: number;
  /** Movimentos até o retrato que são do período seguinte. */
  antesCentavos: number;
}

export interface AberturaDeEstoque {
  id: string;
  status: 'ABERTA' | 'FECHADA';
  /** O dia do Rio em que a abertura foi concluída. */
  diaConcluida: string | null;
  valorTotalCentavos: number | null;
  itensSemPreco: number | null;
}

export interface DadosParaOReal {
  comprasReaisCentavos: number;
  abertura: AberturaDeEstoque | null;
  /** O fechamento de estoque APLICADO do período e o do anterior. */
  fechoDoPeriodo: FechoDeEstoque | null;
  fechoAnterior: FechoDeEstoque | null;
}

export interface ContextoDoReal {
  periodo: Periodo;
  anterior: Periodo | null;
  /** O nome do período seguinte ("o real começa em …"). */
  proximoNome: string;
  hoje: string;
  /** O período já terminou (todos os dias entram). */
  encerrado: boolean;
  /** A partir daqui a contagem de fechamento pode começar (3 últimos dias). */
  abreEm: string;
}

const minuscula = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const dd = (iso: string) => formatarData(iso, true);

export const estoqueFinalDe = (f: FechoDeEstoque) => estoqueFinalDoPeriodo({ retratoCentavos: f.valorTotalCentavos, depoisCentavos: f.depoisCentavos, antesCentavos: f.antesCentavos });

/**
 * O real da loja no período, ou a frase de por que não. Só com período encerrado; o estoque inicial
 * é o final do período anterior (o fechamento dele) e, no primeiro período, a abertura concluída no
 * primeiro dia.
 */
export function apurarReal(d: DadosParaOReal, c: ContextoDoReal): { real: RealApurado | null; motivo: string | null } {
  const sem = (motivo: string) => ({ real: null, motivo });
  const a = d.abertura;
  if (!a) return sem('estoque não aberto');
  if (a.status !== 'FECHADA' || !a.diaConcluida) return sem('estoque em contagem de abertura');
  if (!c.encerrado) {
    return sem(c.hoje < c.abreEm ? `fecha na contagem de fechamento (abre em ${dd(c.abreEm)})` : 'fecha com a contagem de fechamento, depois que o período terminar');
  }
  if (a.diaConcluida > c.periodo.fim) return sem(`o estoque só abriu em ${dd(a.diaConcluida)}`);

  let inicial: { centavos: number; de: 'fechamento' | 'abertura'; semPreco: number | null };
  if (d.fechoAnterior) {
    inicial = { centavos: estoqueFinalDe(d.fechoAnterior), de: 'fechamento', semPreco: d.fechoAnterior.itensSemPreco };
  } else if (a.diaConcluida === c.periodo.inicio) {
    inicial = { centavos: a.valorTotalCentavos ?? 0, de: 'abertura', semPreco: a.itensSemPreco };
  } else if (a.diaConcluida > c.periodo.inicio) {
    return sem(`o estoque abriu em ${dd(a.diaConcluida)}; o real começa em ${minuscula(c.proximoNome)}`);
  } else {
    return sem(`falta o fechamento de estoque de ${minuscula(c.anterior?.nome ?? 'período anterior')} (estoque inicial)`);
  }
  if (!d.fechoDoPeriodo) return sem(`falta o fechamento de estoque de ${minuscula(c.periodo.nome)}`);

  const finalCentavos = estoqueFinalDe(d.fechoDoPeriodo);
  return {
    real: {
      centavos: cmvReal({ inicialCentavos: inicial.centavos, comprasReaisCentavos: d.comprasReaisCentavos, finalCentavos }),
      inicialCentavos: inicial.centavos,
      finalCentavos,
      comprasReaisCentavos: d.comprasReaisCentavos,
      inicialDe: inicial.de,
      retratoEm: d.fechoDoPeriodo.fechadaEm,
      fechamentoId: d.fechoDoPeriodo.id,
      aberturaId: a.id,
      semPrecoInicial: inicial.semPreco,
      semPrecoFinal: d.fechoDoPeriodo.itensSemPreco,
    },
    motivo: null,
  };
}

// ================================================================ qual CMV entra no resultado

export interface ValeDaLoja {
  centavos: number;
  fonte: FonteDoCmv;
}

/** O real quando apurado; senão a compra; senão nada (nulo, nunca zero). */
export function valeDaLoja(l: CmvDaLoja): ValeDaLoja | null {
  if (l.real) return { centavos: l.real.centavos, fonte: 'real' };
  if (l.compraCentavos !== null) return { centavos: l.compraCentavos, fonte: 'compras' };
  return null;
}

/** A nota de uma linha da fotografia cabe em 120 letras (CHECK do banco). */
export const LIMITE_DA_NOTA = 120;

export interface CmvDoEscopo {
  /** Σ do CMV que vale em cada loja do escopo; nulo = nenhuma loja tem. */
  centavos: number | null;
  fonte: FonteDoCmv | 'misto' | null;
  /** O selo ao lado do valor (até 120 letras). */
  nota: string;
  /** Algum custo ficou de fora: resultados saem "sem contar" isto ("o CMV" ou "o CMV de Centro"); nulo = nada de fora. */
  semTexto: string | null;
  compra: { centavos: number | null; nota: string | null };
  real: { centavos: number | null; nota: string | null };
}

const lista = (nomes: readonly string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O CMV de um escopo (a rede toda ou uma loja). `receitaDaLoja` diz quem vendeu: loja sem venda, sem
 * nota e sem real não é uma loja sem CMV, é uma loja parada (não pesa nem avisa). Escopo de uma loja
 * olha sempre aquela loja.
 */
export function cmvDoEscopo(cmv: CmvDoDre, escopo: { tipo: 'rede' } | { tipo: 'loja'; lojaId: string }, receitaDaLoja: (lojaId: string) => number): CmvDoEscopo {
  const lojas = escopo.tipo === 'rede' ? cmv.lojas : cmv.lojas.filter((l) => l.lojaId === escopo.lojaId);
  const relevantes = escopo.tipo === 'loja' ? lojas : lojas.filter((l) => receitaDaLoja(l.lojaId) > 0 || l.compraCentavos !== null || l.real !== null);
  const doReal = relevantes.filter((l) => l.real);
  const dasCompras = relevantes.filter((l) => !l.real && l.compraCentavos !== null);
  const semNada = relevantes.filter((l) => !l.real && l.compraCentavos === null);

  const centavos = doReal.length + dasCompras.length === 0 ? null : doReal.reduce((s, l) => s + l.real!.centavos, 0) + dasCompras.reduce((s, l) => s + l.compraCentavos!, 0);
  const fonte: CmvDoEscopo['fonte'] = centavos === null ? null : doReal.length > 0 && dasCompras.length > 0 ? 'misto' : doReal.length > 0 ? 'real' : 'compras';

  // ---- o selo
  const porque = (l: CmvDaLoja) => l.motivoSemReal ?? '';
  let nota: string;
  if (relevantes.length === 0) nota = 'sem nota de compra no período';
  else if (escopo.tipo === 'loja') {
    const l = relevantes[0];
    nota = l.real ? 'real (contagem)' : l.compraCentavos !== null ? (cmv.parcial ? 'pelas compras · parcial' : `pelas compras: ${porque(l)}`) : 'sem nota de compra no período';
  } else {
    const ehMisto = fonte === 'misto';
    const nomes = (ls: readonly CmvDaLoja[]) => lista(ls.map((l) => l.lojaNome));
    const motivos = Array.from(new Set(dasCompras.map(porque).filter(Boolean)));
    // Do mais completo ao mais curto: com o motivo, só com os nomes, só com as contagens (a nota da fotografia cabe em 120 letras).
    const montar = (comMotivo: boolean) => {
      const partes: string[] = [];
      if (doReal.length) partes.push(ehMisto ? `real em ${nomes(doReal)}` : 'real (contagem)');
      if (dasCompras.length) {
        if (ehMisto) partes.push(`pelas compras em ${nomes(dasCompras)}${comMotivo && motivos.length === 1 ? ` (${motivos[0]})` : ''}`);
        else partes.push(cmv.parcial ? 'pelas compras · parcial' : `pelas compras${comMotivo && motivos.length === 1 ? `: ${motivos[0]}` : ''}`);
      }
      if (semNada.length) partes.push(`sem o CMV de ${nomes(semNada)}`);
      return `${ehMisto ? 'misto: ' : ''}${partes.join('; ')}`;
    };
    nota = montar(true);
    if (nota.length > LIMITE_DA_NOTA) nota = montar(false);
    if (nota.length > LIMITE_DA_NOTA) {
      const c: string[] = [];
      if (doReal.length) c.push(`real em ${plural(doReal.length, 'loja', 'lojas')}`);
      if (dasCompras.length) c.push(`pelas compras em ${dasCompras.length}`);
      if (semNada.length) c.push(`sem o CMV de ${semNada.length}`);
      nota = `${ehMisto ? 'misto: ' : ''}${c.join('; ')}`;
    }
  }

  // ---- as duas linhas de detalhe
  const comCompra = relevantes.filter((l) => l.compraCentavos !== null);
  const compraSoma = comCompra.length === 0 ? null : comCompra.reduce((s, l) => s + l.compraCentavos!, 0);
  const compraNota = relevantes.length === 0 || comCompra.length === 0 ? 'sem nota de compra no período' : comCompra.length < relevantes.length ? `notas em ${comCompra.length} de ${relevantes.length} lojas` : null;
  const realSoma = doReal.length === 0 ? null : doReal.reduce((s, l) => s + l.real!.centavos, 0);
  let realNota: string | null;
  if (doReal.length === 0) {
    // Uma loja: o motivo dela. A rede: o que vale para todas (o período em curso fecha na contagem), senão que nenhuma tem.
    const fecha = relevantes.map((l) => l.motivoSemReal ?? '').find((m) => m.startsWith('fecha na contagem'));
    realNota = relevantes.length === 0 ? 'não apurado' : escopo.tipo === 'loja' ? relevantes[0].motivoSemReal ?? 'não apurado' : fecha ?? 'o real não foi apurado em nenhuma loja';
  } else if (escopo.tipo === 'loja') realNota = `inicial ${formatarDinheiro(doReal[0].real!.inicialCentavos)} + compras ${formatarDinheiro(doReal[0].real!.comprasReaisCentavos)} − final ${formatarDinheiro(doReal[0].real!.finalCentavos)}`;
  else realNota = doReal.length < relevantes.length ? `apurado em ${doReal.length} de ${relevantes.length} lojas` : null;
  if (realNota && realNota.length > LIMITE_DA_NOTA) realNota = realNota.slice(0, LIMITE_DA_NOTA - 1) + '…';

  const nomesSem = lista(semNada.map((l) => l.lojaNome));
  const semTexto = centavos === null ? 'o CMV' : semNada.length === 0 ? null : nomesSem.length <= 60 ? `o CMV de ${nomesSem}` : `o CMV de ${plural(semNada.length, 'loja', 'lojas')}`;
  return { centavos, fonte, nota: nota.slice(0, LIMITE_DA_NOTA), semTexto, compra: { centavos: compraSoma, nota: compraNota }, real: { centavos: realSoma, nota: realNota } };
}

// ================================================================ compra × real

export interface ComparacaoDaLoja {
  lojaId: string;
  lojaNome: string;
  /** Nulo = a loja não lançou nota no período (a conta usa zero). */
  compraCentavos: number | null;
  realCentavos: number;
  /** Real menos compra. */
  diferencaCentavos: number;
  /** A diferença em pontos-base da receita bruta; nulo sem receita. */
  diferencaBp: number | null;
  inicialCentavos: number;
  finalCentavos: number;
  /** Compra lançada menos entrada no livro: o que já estava na contagem de abertura. */
  notasNaAberturaCentavos: number;
  frase: string;
  semPrecoInicial: number | null;
  semPrecoFinal: number | null;
}

/** "o estoque subiu R$ 1.850,00 (de R$ 11.700,00 para R$ 13.550,00): …" e, se houver, as notas que já estavam na contagem. */
export function fraseDaComparacao(c: { inicialCentavos: number; finalCentavos: number; notasNaAberturaCentavos: number }): string {
  const delta = c.finalCentavos - c.inicialCentavos;
  const de = `de ${formatarDinheiro(c.inicialCentavos)} para ${formatarDinheiro(c.finalCentavos)}`;
  let f: string;
  if (delta > 0) f = `o estoque subiu ${formatarDinheiro(delta)} (${de}): comprou mais do que consumiu, é dinheiro parado na prateleira`;
  else if (delta < 0) f = `o estoque desceu ${formatarDinheiro(-delta)} (${de}): consumiu do que já tinha`;
  else f = `o estoque ficou igual, em ${formatarDinheiro(c.finalCentavos)}`;
  if (c.notasNaAberturaCentavos > 0) f += `; ${formatarDinheiro(c.notasNaAberturaCentavos)} de notas já estavam na contagem de abertura`;
  else if (c.notasNaAberturaCentavos < 0) f += `; o livro registrou ${formatarDinheiro(-c.notasNaAberturaCentavos)} de entradas a mais do que as notas lançadas`;
  return f;
}

// ================================================================ o estoque sem preço

/** "estoque sem o valor de 3 insumos sem preço" · "contagem anterior ao registro" · nulo = nada a avisar. */
export function fraseDoSemPreco(n: number | null, qual: 'inicial' | 'final'): string | null {
  if (n === null) return `estoque ${qual}: número de insumos sem preço não registrado`;
  if (n === 0) return null;
  return `estoque ${qual} sem o valor de ${n === 1 ? '1 insumo sem preço' : `${n} insumos sem preço`}`;
}

// ================================================================ o que vai para a fotografia

/** O que a fotografia guarda por loja (dentro de `entrada.cmv`): tudo de onde o número saiu. */
export interface CmvGravado {
  versao: 1;
  parcial: boolean;
  lojas: Record<string, Omit<CmvDaLoja, 'lojaId'>>;
}

export function cmvParaGravar(cmv: CmvDoDre): CmvGravado {
  const lojas: CmvGravado['lojas'] = {};
  for (const l of cmv.lojas) lojas[l.lojaId] = { lojaNome: l.lojaNome, compraCentavos: l.compraCentavos, real: l.real, motivoSemReal: l.motivoSemReal };
  return { versao: 1, parcial: cmv.parcial, lojas };
}

const ehNumeroOuNulo = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isSafeInteger(v));

/** Lê de volta o que `cmvParaGravar` guardou. Qualquer coisa fora do formato vira "sem CMV" (nunca um número inventado). */
export function cmvLidoDaFotografia(json: unknown): CmvDoDre {
  if (!json || typeof json !== 'object') return SEM_CMV;
  const g = json as Partial<CmvGravado>;
  if (g.versao !== 1 || !g.lojas || typeof g.lojas !== 'object') return SEM_CMV;
  const lojas: CmvDaLoja[] = [];
  for (const [lojaId, v] of Object.entries(g.lojas)) {
    const l = v as Partial<Omit<CmvDaLoja, 'lojaId'>> | null;
    if (!l || typeof l.lojaNome !== 'string' || !ehNumeroOuNulo(l.compraCentavos ?? null)) continue;
    const r = l.real as Partial<RealApurado> | null | undefined;
    const real: RealApurado | null =
      r && typeof r === 'object' && ehNumeroOuNulo(r.centavos ?? null) && r.centavos != null && typeof r.inicialCentavos === 'number' && typeof r.finalCentavos === 'number' && typeof r.comprasReaisCentavos === 'number'
        ? {
            centavos: r.centavos,
            inicialCentavos: r.inicialCentavos,
            finalCentavos: r.finalCentavos,
            comprasReaisCentavos: r.comprasReaisCentavos,
            inicialDe: r.inicialDe === 'abertura' ? 'abertura' : 'fechamento',
            retratoEm: String(r.retratoEm ?? ''),
            fechamentoId: String(r.fechamentoId ?? ''),
            aberturaId: r.aberturaId ? String(r.aberturaId) : null,
            semPrecoInicial: r.semPrecoInicial ?? null,
            semPrecoFinal: r.semPrecoFinal ?? null,
          }
        : null;
    lojas.push({ lojaId, lojaNome: l.lojaNome, compraCentavos: l.compraCentavos ?? null, real, motivoSemReal: typeof l.motivoSemReal === 'string' ? l.motivoSemReal : null });
  }
  return { lojas, parcial: g.parcial === true };
}

/** A fotografia de antes do CMV (versão da conta 1) guardou a linha como "Em breve": hoje a tela diz a verdade. */
export const FRASE_DO_CMV_ANTIGO = 'não apurado neste fechamento (fechado antes do CMV)';
