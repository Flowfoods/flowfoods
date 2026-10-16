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
function textoParaInteiro(texto: string, casas: number): number | null {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(limpo)) return null;
  const [inteira, fracao = ''] = limpo.replace(/\./g, '').split(',');
  if (fracao.length > casas) return null;
  const valor = Number(inteira) * 10 ** casas + Number(fracao.padEnd(casas, '0') || '0');
  return Number.isSafeInteger(valor) && valor <= TETO ? valor : null;
}

/** "1,5" (kg) → 1500 milésimos. Até 3 casas: menos que 1 g/1 ml não existe no ERP. */
export function lerQuantidade(texto: string): number | null {
  return textoParaInteiro(texto, 3);
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
 * Custo de referência de 1 unidade base (1 kg, 1 L, 1 un), em centavos:
 * (preço + frete da embalagem) × 1000 ÷ conteúdo em milésimos, com UM
 * arredondamento só, no fim (metade para cima). Preço 0 = "Sem preço": o
 * custo está incompleto, e a resposta é null — nunca R$ 0,00.
 */
export function custoDaEmbalagem(
  precoEmbalagemCentavos: number,
  taxaEntregaCentavos: number,
  conteudoMilesimos: number,
): number | null {
  if (precoEmbalagemCentavos <= 0) return null;
  return dividirArredondado((precoEmbalagemCentavos + taxaEntregaCentavos) * 1000, conteudoMilesimos);
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

/** Custo por unidade para a tela: "R$ 18,98/kg", ou "Sem preço" (nunca R$ 0,00). */
export function formatarCusto(custoCentavos: number | null, unidade: Unidade): string {
  return custoCentavos === null ? 'Sem preço' : `${formatarDinheiro(custoCentavos)}/${UNIDADES[unidade].sigla}`;
}

/**
 * A conta do custo, por extenso, igual na prévia, na lista e no detalhe:
 * "R$ 89,90 + R$ 5,00 frete ÷ 5 kg = R$ 18,98/kg".
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
  return `${formatarDinheiro(e.precoEmbalagemCentavos)}${frete} ÷ ${formatarQuantidade(e.conteudoMilesimos, e.unidade)} = ${formatarCusto(custo, e.unidade)}`;
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
