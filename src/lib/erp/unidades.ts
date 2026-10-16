// avoid-ai-design-ignore-file: CP3 — a seta está em comentário de código (exemplo de conversão), não em botão nem link.
/**
 * Números do ERP: quantidade em milésimos, dinheiro em centavos, sempre inteiros.
 *
 * Tudo o que vem digitado (texto, vírgula brasileira) vira inteiro AQUI, sem
 * passar por float: "1,5" é lido como 1 e 500 milésimos, não como 1.5 * 1000.
 * E todo arredondamento do ERP mora neste arquivo, num critério só
 * (metade para cima), para que a tela e o relatório nunca discordem por 1 centavo.
 */

export const UNIDADES = {
  KG: { sigla: 'kg', nome: 'Quilo', menor: 'g' },
  L: { sigla: 'L', nome: 'Litro', menor: 'ml' },
  UN: { sigla: 'un', nome: 'Unidade', menor: 'un' },
} as const;

export type Unidade = keyof typeof UNIDADES;

/** Teto prático: cabe com folga no INTEGER do Postgres (2,1 bi). */
const TETO = 2_000_000_000;

/**
 * Converte texto decimal pt-BR em inteiro com `casas` casas fixas.
 * Aceita "1.234,5", "1234,50", "0,75", "12". Rejeita sinal, letra e casas a mais.
 * Devolve null quando o texto não é um número válido.
 */
const FORMATO_DECIMAL = /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/;

function textoParaInteiro(texto: string, casas: number): number | null {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!FORMATO_DECIMAL.test(limpo)) return null;
  const [inteira, fracao = ''] = limpo.replace(/\./g, '').split(',');
  if (fracao.length > casas) return null;
  const valor = Number(inteira) * 10 ** casas + Number(fracao.padEnd(casas, '0') || '0');
  return Number.isSafeInteger(valor) && valor <= TETO ? valor : null;
}

/** "1,5" (kg) → 1500 milésimos. Até 3 casas: menos que 1 g/1 ml não existe no ERP. */
export function lerQuantidade(texto: string): number | null {
  return textoParaInteiro(texto, 3);
}

/** Número inteiro digitado ("4", "1.200"); casa decimal é recusada. */
export function lerInteiro(texto: string): number | null {
  return textoParaInteiro(texto, 0);
}

/**
 * 1.10: o texto tem a forma de dinheiro que `lerDinheiro` aceita (até 2 casas)?
 * Serve para separar "número grande demais" (forma certa, passou do teto) de
 * "texto inválido" ("29.90", "1..2").
 */
export function temFormaDeDinheiro(texto: string): boolean {
  const limpo = texto.replace(/^\s*R\$/i, '').trim().replace(/\s/g, '');
  if (!FORMATO_DECIMAL.test(limpo)) return false;
  return (limpo.split(',')[1] ?? '').length <= 2;
}

/** "R$ 89,90" ou "89,90" → 8990 centavos. */
export function lerDinheiro(texto: string): number | null {
  return textoParaInteiro(texto.replace(/^R\$/i, ''), 2);
}

/** Divisão inteira com arredondamento metade para cima (só positivos). */
export function dividirArredondado(numerador: number, denominador: number): number {
  if (denominador <= 0) throw new Error('Denominador precisa ser positivo.');
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}

/**
 * Em que a embalagem foi digitada: na unidade base (kg, L, un) ou na menor
 * (g, ml). Para UN as duas são a mesma coisa.
 */
export type Escala = 'base' | 'menor';

/**
 * Quantidade digitada na unidade escolhida → milésimos da unidade base.
 * "750" g de KG = 750 milésimos; "1,5" kg = 1500. Na menor (g, ml), só
 * inteiro: 1 g é o menor passo do ERP, então "0,5 g" é recusado.
 */
export function lerQuantidadeNa(texto: string, unidade: Unidade, escala: Escala): number | null {
  if (escala === 'menor' && unidade !== 'UN') return textoParaInteiro(texto, 0);
  return textoParaInteiro(texto, 3);
}

/**
 * Custo de referência EXATO: `centavos` a cada `milesimos` milésimos da
 * unidade base — a fração (preço + frete) ÷ conteúdo, reduzida, em inteiros.
 * Nada é arredondado aqui: R$ 4,00 por 1000 un é 1 centavo a cada 2.500
 * milésimos (0,4 centavo por un), e não "0 centavo por un". Quem usa arredonda
 * UMA vez, no fim (`custoDaQuantidade` para a ficha técnica, `formatarCusto`
 * para a tela). Comparar é por multiplicação cruzada (`compararCustos`).
 */
export interface CustoExato {
  centavos: number;
  milesimos: number;
}

function mdc(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Custo de referência de uma embalagem: (preço + frete) por conteúdo. Preço 0
 * = "Sem preço": o custo está incompleto, e a resposta é null — nunca R$ 0,00.
 */
export function custoDaEmbalagem(
  precoEmbalagemCentavos: number,
  taxaEntregaCentavos: number,
  conteudoMilesimos: number,
): CustoExato | null {
  if (precoEmbalagemCentavos <= 0 || conteudoMilesimos <= 0) return null;
  const total = precoEmbalagemCentavos + taxaEntregaCentavos;
  const d = mdc(total, conteudoMilesimos);
  return { centavos: total / d, milesimos: conteudoMilesimos / d };
}

/** a/b em BigInt, metade para cima (só não negativos). */
function dividirBig(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b);
}

/**
 * Quanto custam `quantidadeMilesimos` deste insumo, em centavos, com UM
 * arredondamento (metade para cima): 180 g a R$ 94,90 por 5 kg = 342
 * centavos, sem passar pelo custo/kg arredondado. Por dentro em BigInt:
 * produto de dois inteiros grandes não cabe em número de JavaScript sem
 * perder precisão. Resultado acima de 2^53 é RECUSADO (RangeError), nunca
 * devolvido como um Number já errado. A ficha técnica soma em fração exata
 * (`custoExatoDaQuantidade`) e só arredonda na tela.
 */
export function custoDaQuantidade(custo: CustoExato, quantidadeMilesimos: number): number {
  const v = dividirBig(BigInt(custo.centavos) * BigInt(quantidadeMilesimos), BigInt(custo.milesimos));
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Custo grande demais para conta em centavos.');
  return Number(v);
}

// ------------------------------------------------------------ frações exatas

/**
 * Valor em centavos como fração exata `num ÷ den` (BigInt, den > 0). É como a
 * ficha técnica soma: cada item vale custo × quantidade × fator, sem
 * arredondar; o total arredonda uma vez, na exibição (`formatarFracao`).
 */
export interface Fracao {
  num: bigint;
  den: bigint;
}

export const ZERO: Fracao = { num: 0n, den: 1n };

function mdcBig(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function reduzir(f: Fracao): Fracao {
  if (f.num === 0n) return ZERO;
  const d = mdcBig(f.num, f.den);
  return { num: f.num / d, den: f.den / d };
}

/** Custo de 1 unidade base (1 kg, 1 L, 1 un) do custo de referência, como fração exata de centavos. */
export function custoPorUnidade(custo: CustoExato): Fracao {
  return reduzir({ num: BigInt(custo.centavos) * 1000n, den: BigInt(custo.milesimos) });
}

/**
 * Centavos de `quantidadeMilesimos` de algo que custa `porUnidade` centavos
 * por unidade base, exato. `fatorMilesimos` é o fator de correção (bruto ÷
 * líquido, 1000 = sem perda): a quantidade é a LÍQUIDA, paga-se a BRUTA.
 * Serve ao insumo (custo de referência) e ao pré-preparo (custo da ficha ÷
 * rendimento) — é a mesma conta em toda a cascata (1.3).
 */
export function custoDoUso(porUnidade: Fracao, quantidadeMilesimos: number, fatorMilesimos = 1000): Fracao {
  return reduzir({
    num: porUnidade.num * BigInt(quantidadeMilesimos) * BigInt(fatorMilesimos),
    den: porUnidade.den * 1_000_000n,
  });
}

/** Centavos de `quantidadeMilesimos` do insumo, exato (ver `custoDoUso`). */
export function custoExatoDaQuantidade(custo: CustoExato, quantidadeMilesimos: number, fatorMilesimos = 1000): Fracao {
  return custoDoUso(custoPorUnidade(custo), quantidadeMilesimos, fatorMilesimos);
}

/** -1, 0 ou 1, exato (multiplicação cruzada). */
export function compararFracoes(a: Fracao, b: Fracao): number {
  const x = a.num * b.den;
  const y = b.num * a.den;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Teto do que a tela mostra: 2^53 centavos (o maior inteiro que o JavaScript
 * guarda sem errar). Acima disso a tela RECUSA mostrar ("acima do limite"),
 * nunca um número já errado; e a ficha que passaria disso não é gravada.
 */
export const TETO_DE_EXIBICAO = BigInt(Number.MAX_SAFE_INTEGER);
export const ACIMA_DO_LIMITE = 'acima do limite';

export function cabeNaExibicao(f: Fracao): boolean {
  return dividirBig(f.num, f.den) <= TETO_DE_EXIBICAO;
}

export function somar(a: Fracao, b: Fracao): Fracao {
  return reduzir({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

/** Custo de 1 unidade de rendimento: total ÷ (rendimento em milésimos ÷ 1000). */
export function porRendimento(total: Fracao, rendimentoMilesimos: number): Fracao {
  if (rendimentoMilesimos <= 0) throw new Error('Rendimento precisa ser positivo.');
  return reduzir({ num: total.num * 1000n, den: total.den * BigInt(rendimentoMilesimos) });
}

/** Centavos inteiros (metade para cima): só para comparar e testar; a tela usa `formatarFracao`. */
export function centavosDaFracao(f: Fracao): bigint {
  return dividirBig(f.num, f.den);
}

/** Reais da fração para a tela: "R$ 12,34"; abaixo de 1 centavo, "R$ 0,004". */
export function formatarFracao(f: Fracao): string {
  return formatarReaisDaFracao(f.num, f.den);
}

/**
 * A unidade que a pessoa digitou na ficha ("g", "kg", "ml", "L", "un"), para a
 * unidade base DO INSUMO: em que escala ler o número. Unidade de outra família
 * (g num insumo em litro) é null: o servidor recusa a linha.
 */
export const SIGLAS_DIGITAVEIS: Record<Unidade, readonly string[]> = {
  KG: ['g', 'kg'],
  L: ['ml', 'L'],
  UN: ['un'],
};

export function escalaDaSigla(sigla: string, unidade: Unidade): Escala | null {
  const s = sigla.trim().toLowerCase();
  const u = UNIDADES[unidade];
  if (s === u.sigla.toLowerCase()) return 'base';
  if (unidade !== 'UN' && s === u.menor.toLowerCase()) return 'menor';
  return null;
}

/** -1, 0 ou 1: qual custo por unidade é menor, por multiplicação cruzada exata. */
export function compararCustos(a: CustoExato, b: CustoExato): number {
  const x = BigInt(a.centavos) * BigInt(b.milesimos);
  const y = BigInt(b.centavos) * BigInt(a.milesimos);
  return x < y ? -1 : x > y ? 1 : 0;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarDinheiro(centavos: number): string {
  // Divisão só na borda de exibição; o valor guardado continua inteiro.
  return BRL.format(centavos / 100);
}

/** 5000 milésimos de KG → "5 kg"; 750 de L → "750 ml"; 12000 de UN → "12 un". */
export function formatarQuantidade(milesimos: number, unidade: Unidade): string {
  const u = UNIDADES[unidade];
  if (unidade !== 'UN' && milesimos < 1000) return `${milesimos.toLocaleString('pt-BR')} ${u.menor}`;
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  const fracao = resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : '';
  return `${inteiro.toLocaleString('pt-BR')}${fracao} ${u.sigla}`;
}

/**
 * Reais de uma fração de centavos (num ÷ den centavos), para a tela. A partir
 * de 1 centavo, duas casas como sempre; abaixo disso, as casas que precisar
 * para mostrar dois algarismos (R$ 0,004; R$ 0,0035) — com preço, nunca
 * "R$ 0,00". Arredondamento metade para cima na última casa mostrada.
 */
export function formatarReaisDaFracao(num: bigint, den: bigint): string {
  if (num >= den || num === 0n) {
    const centavos = dividirBig(num, den);
    return centavos > TETO_DE_EXIBICAO ? ACIMA_DO_LIMITE : formatarDinheiro(Number(centavos));
  }
  for (let casas = 3; casas <= 8; casas++) {
    const v = dividirBig(num * 10n ** BigInt(casas - 2), den);
    if (v >= 10n || casas === 8) {
      const texto = v.toString().padStart(casas, '0').replace(/0+$/, '');
      const fracao = texto.padEnd(3, '0');
      return v === 0n ? `menos de ${BRL.format(0).replace(/0,00/, '0,000001')}` : BRL.format(0).replace(/0,00/, `0,${fracao}`);
    }
  }
  return formatarDinheiro(0);
}

/** Custo de 1 unidade base, em reais para a tela ("R$ 18,98", "R$ 0,004"). */
export function valorDoCusto(custo: CustoExato): string {
  return formatarReaisDaFracao(BigInt(custo.centavos) * 1000n, BigInt(custo.milesimos));
}

/** Custo por unidade para a tela: "R$ 18,98/kg", "R$ 0,004/un", ou "Sem preço" (nunca R$ 0,00). */
export function formatarCusto(custo: CustoExato | null, unidade: Unidade): string {
  return custo === null ? 'Sem preço' : `${valorDoCusto(custo)}/${UNIDADES[unidade].sigla}`;
}

/** Abaixo de 1 centavo por un, quanto sai o milheiro (como esse item se vende): "R$ 4,00". */
export function milheiro(custo: CustoExato, unidade: Unidade): string | null {
  if (unidade !== 'UN' || custo.centavos * 1000 >= custo.milesimos) return null;
  return formatarDinheiro(custoDaQuantidade(custo, 1_000_000));
}

/**
 * A conta do custo, por extenso, igual na prévia, na lista e no detalhe:
 * "R$ 89,90 + R$ 5,00 frete ÷ 5 kg = R$ 18,98/kg"; abaixo de 1 centavo por
 * un, com o milheiro: "R$ 4,00 ÷ 1.000 un = R$ 0,004/un (R$ 4,00 o milheiro)".
 */
export function contaDoCusto(e: {
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
  conteudoMilesimos: number;
  unidade: Unidade;
}): string {
  const custo = custoDaEmbalagem(e.precoEmbalagemCentavos, e.taxaEntregaCentavos, e.conteudoMilesimos);
  if (custo === null) return 'Sem preço: o custo fica incompleto até alguém informar o preço.';
  const frete = e.taxaEntregaCentavos > 0 ? ` + ${formatarDinheiro(e.taxaEntregaCentavos)} frete` : '';
  const mil = milheiro(custo, e.unidade);
  return `${formatarDinheiro(e.precoEmbalagemCentavos)}${frete} ÷ ${formatarQuantidade(e.conteudoMilesimos, e.unidade)} = ${formatarCusto(custo, e.unidade)}${mil ? ` (${mil} o milheiro)` : ''}`;
}

/** Milésimos → o que volta para o campo de edição: 750 de KG = "750" g; 2270 = "2,27" kg. */
export function quantidadeParaCampo(milesimos: number, unidade: Unidade): { texto: string; escala: Escala } {
  if (unidade !== 'UN' && milesimos < 1000) return { texto: String(milesimos), escala: 'menor' };
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return {
    texto: `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`,
    escala: 'base',
  };
}

/** Centavos → texto do campo: 8990 = "89,90". */
export function dinheiroParaCampo(centavos: number): string {
  return `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, '0')}`;
}

// ------------------------------------------------------------ porcentagem (1.9)

/**
 * "23", "3,2", "12,5%" → pontos-base (2300, 320, 1250). Até 2 casas (0,01 %
 * é 1 ponto-base). Sinal, letra e casa a mais: null.
 */
export function lerPontosBase(texto: string): number | null {
  return textoParaInteiro(texto.trim().replace(/\s*%$/, ''), 2);
}

/** 2620 → "26,2%"; 320 → "3,2%"; 2300 → "23%". */
export function formatarPontosBase(bp: number): string {
  return `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/** Pontos-base → o que volta para o campo: 320 = "3,2"; 2300 = "23". */
export function pontosBaseParaCampo(bp: number): string {
  return (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}
