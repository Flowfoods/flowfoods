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

/** Custo de 1 unidade base (1 kg, 1 L, 1 un), em centavos. */
export function custoPorUnidadeBase(precoEmbalagemCentavos: number, conteudoMilesimos: number): number {
  return dividirArredondado(precoEmbalagemCentavos * 1000, conteudoMilesimos);
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
