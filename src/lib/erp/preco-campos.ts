/**
 * Preço e margem por canal na ficha (1.10) — a parte PURA (sem banco, sem
 * Next). A mesma conta roda no servidor (o que vale) e no navegador (prévia ao
 * vivo): as entradas atravessam como texto (`entradaParaTela`) e voltam iguais.
 *
 * Definições (para o dono, decisão 85):
 *   custo do canal  = insumos + embalagens do canal (+ a taxa, quando há preço) — as camadas da 1.9
 *   margem bruta    = preço − insumos − embalagens   (o que o prato deixa antes do canal)
 *   margem líquida  = margem bruta − taxa do canal    (o que sobra para pagar a casa e o lucro)
 *   %               = sempre sobre o preço
 * Loja e delivery próprio não cobram sobre o preço: líquida = bruta.
 *
 * Preço sugerido (decisão 86): a margem-alvo é da LÍQUIDA, então
 *   preço = (insumos + embalagens) ÷ (1 − taxa − margem-alvo)
 * em fração exata, arredondado PARA CIMA ao centavo (o menor preço em centavos
 * que atinge o alvo). "De cardápio" é só uma sugestão de tela: a próxima ,90.
 * Custo incompleto nunca vira número: sugerido e margens ficam "incompletos".
 */

import { camadasDoCanal, ORDEM_DOS_CANAIS, porQueIncompleto, taxaTotalBp, type CamadasDoCanal, type CanalVenda, type EmbalagemParaCusto, type TaxaDoCanal } from './canal-campos';
import type { CustoDaFicha } from './ficha-campos';
import type { Erros, Leitura } from './insumo-campos';
import { compararFracoes, formatarFracao, formatarPontosBase, lerDinheiro, lerPontosBase, somar, TETO_DE_EXIBICAO, type Fracao } from './unidades';

export const LIMITES_DO_PRECO = {
  /** Preço próprio por porção: até R$ 100.000,00 (acima é dedo errado). */
  centavos: 10_000_000,
} as const;

const BP = 10_000n;

const neg = (f: Fracao): Fracao => ({ num: -f.num, den: f.den });

/** a ÷ b para cima (a ≥ 0, b > 0). */
const paraCima = (a: bigint, b: bigint) => (a + b - 1n) / b;

// ----------------------------------------------------------------- sugerido

export type Sugerido =
  /** O canal não tem margem-alvo: sem sugerido (o preço próprio ainda vale). */
  | { tipo: 'semAlvo' }
  /** Custo incompleto (insumo ou embalagem sem preço, taxa não configurada): nenhum número. */
  | { tipo: 'incompleto' }
  /** Taxa + margem-alvo ≥ 100 %: nenhum preço cobre (a configuração recusa; fica o seguro). */
  | { tipo: 'inviavel'; somaBp: number }
  | { tipo: 'acimaDoLimite' }
  /** `exato` em fração de centavos; `centavos` = para cima; `cardapio` = a próxima ,90. */
  | { tipo: 'ok'; exato: Fracao; centavos: number; cardapio: number };

/** A próxima ,90 a partir de `centavos` (28,17 → 28,90; 28,90 → 28,90; 28,99 → 29,90). */
export function precoDeCardapio(centavos: number): number {
  const c = Math.floor(centavos / 100) * 100 + 90;
  return c >= centavos ? c : c + 100;
}

export function precoSugerido(p: { semTaxa: Fracao; taxaBp: number; margemAlvoBp: number | null; incompleto: boolean }): Sugerido {
  if (p.incompleto) return { tipo: 'incompleto' };
  if (p.margemAlvoBp === null) return { tipo: 'semAlvo' };
  const soma = p.taxaBp + p.margemAlvoBp;
  if (soma >= 10_000) return { tipo: 'inviavel', somaBp: soma };
  const exato: Fracao = { num: p.semTaxa.num * BP, den: p.semTaxa.den * BigInt(10_000 - soma) };
  const centavos = paraCima(exato.num, exato.den);
  if (centavos > TETO_DE_EXIBICAO) return { tipo: 'acimaDoLimite' };
  const n = Number(centavos);
  return { tipo: 'ok', exato, centavos: n, cardapio: precoDeCardapio(n) };
}

/** "R$ 10,18 ÷ (1 − 26,2% − 60%) = R$ 73,77" — a conta por extenso, igual na tela e no teste. */
export function contaDoSugerido(semTaxa: Fracao, taxaBp: number, margemAlvoBp: number, s: Extract<Sugerido, { tipo: 'ok' }>): string {
  const taxa = taxaBp > 0 ? ` − ${formatarPontosBase(taxaBp)}` : '';
  return `${formatarFracao(semTaxa)} ÷ (1${taxa} − ${formatarPontosBase(margemAlvoBp)}) = ${formatarFracao({ num: BigInt(s.centavos), den: 1n })}`;
}

/** O divisor do sugerido por extenso, para a célula estreita: (1 − 26,2% − 60%) = "0,138". */
export function divisorDoSugerido(taxaBp: number, margemAlvoBp: number): string {
  return ((10_000 - taxaBp - margemAlvoBp) / 10_000).toLocaleString('pt-BR', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
}

// ------------------------------------------------------------------ margens

/** no alvo · abaixo do alvo · prejuízo (líquida < 0). Sem alvo e sem prejuízo: null. */
export type Farol = 'noAlvo' | 'abaixo' | 'prejuizo';

export const FAROL: Record<Farol, { rotulo: string; tom: 'ok' | 'alerta' | 'erro' }> = {
  noAlvo: { rotulo: 'no alvo', tom: 'ok' },
  abaixo: { rotulo: 'abaixo do alvo', tom: 'alerta' },
  prejuizo: { rotulo: 'prejuízo', tom: 'erro' },
};

export interface Margens {
  /** Taxa do canal sobre este preço (0 sem taxa). */
  taxa: Fracao;
  /** Preço − insumos − embalagens. */
  bruta: Fracao;
  /** Bruta − taxa. */
  liquida: Fracao;
  /** Em pontos-base exatos do preço (fração). */
  brutaBp: Fracao;
  liquidaBp: Fracao;
  farol: Farol | null;
}

/** Margens de um preço (> 0) sobre o custo sem a taxa. Exatas; nada arredonda aqui. */
export function margensDoPreco(p: { semTaxa: Fracao; taxaBp: number; precoCentavos: number; margemAlvoBp: number | null }): Margens {
  if (!Number.isSafeInteger(p.precoCentavos) || p.precoCentavos <= 0) throw new RangeError('Preço precisa ser maior que zero.');
  const preco = BigInt(p.precoCentavos);
  const taxa: Fracao = p.taxaBp > 0 ? { num: preco * BigInt(p.taxaBp), den: BP } : { num: 0n, den: 1n };
  const bruta = somar({ num: preco, den: 1n }, neg(p.semTaxa));
  const liquida = somar(bruta, neg(taxa));
  const emBp = (f: Fracao): Fracao => ({ num: f.num * BP, den: f.den * preco });
  const liquidaBp = emBp(liquida);
  let farol: Farol | null = null;
  if (liquida.num < 0n) farol = 'prejuizo';
  else if (p.margemAlvoBp !== null) farol = compararFracoes(liquidaBp, { num: BigInt(p.margemAlvoBp), den: 1n }) >= 0 ? 'noAlvo' : 'abaixo';
  return { taxa, bruta, liquida, brutaBp: emBp(bruta), liquidaBp, farol };
}

// ---------------------------------------------------------- preço do canal

/** O que a conta de um canal precisa (as entradas de `camadasDoCanal`, sem o preço). */
export interface EntradaDoCanal {
  canal: CanalVenda;
  custoDaFicha: Pick<CustoDaFicha, 'porRendimento' | 'faltaPreco'>;
  embalagens: EmbalagemParaCusto[];
  taxa: TaxaDoCanal | null | 'naoConfigurada';
}

export interface PrecoDoCanal {
  canal: CanalVenda;
  /** As camadas da 1.9, com a taxa resolvida no preço do canal (quando há preço). */
  camadas: CamadasDoCanal;
  /** Insumos + embalagens: a base do sugerido e das margens. */
  semTaxa: Fracao;
  taxaBp: number;
  margemAlvoBp: number | null;
  sugerido: Sugerido;
  /** O preço que vale: o próprio (sobrescreve) ou o sugerido; null = nenhum. */
  preco: { centavos: number; origem: 'proprio' | 'sugerido' } | null;
  /** null = sem preço ou custo incompleto (nunca um número falso). */
  margens: Margens | null;
  /** Por que está incompleto, numa frase (null = completo). */
  porQue: string | null;
}

/** A conta inteira de um canal: sugerido, preço que vale, camadas com a taxa em R$ e as margens. */
export function precoDoCanal(e: EntradaDoCanal, p: { margemAlvoBp: number | null; precoProprioCentavos: number | null }): PrecoDoCanal {
  const base = camadasDoCanal(e);
  const taxaBp = base.taxa.tipo === 'sobrePreco' ? base.taxa.totalBp : 0;
  const sugerido = precoSugerido({ semTaxa: base.semTaxa, taxaBp, margemAlvoBp: p.margemAlvoBp, incompleto: base.incompleto });
  const preco =
    p.precoProprioCentavos !== null
      ? { centavos: p.precoProprioCentavos, origem: 'proprio' as const }
      : sugerido.tipo === 'ok'
      ? { centavos: sugerido.centavos, origem: 'sugerido' as const }
      : null;
  const camadas = preco ? camadasDoCanal({ ...e, precoCentavos: preco.centavos }) : base;
  const margens =
    preco && !base.incompleto ? margensDoPreco({ semTaxa: base.semTaxa, taxaBp, precoCentavos: preco.centavos, margemAlvoBp: p.margemAlvoBp }) : null;
  return { canal: e.canal, camadas, semTaxa: base.semTaxa, taxaBp, margemAlvoBp: p.margemAlvoBp, sugerido, preco, margens, porQue: porQueIncompleto(base) };
}

// ------------------------------------------------------------------ formatar

/** "R$ 11,89" ou "−R$ 2,80" (um arredondamento, metade para longe do zero). */
export function formatarReaisComSinal(f: Fracao): string {
  return f.num < 0n ? `−${formatarFracao(neg(f))}` : formatarFracao(f);
}

/** Pontos-base exatos em texto: "39,8%" (uma casa, metade para longe do zero; "−28,0%"). */
export function formatarPorcentagem(bp: Fracao): string {
  const negativo = bp.num < 0n;
  const n = negativo ? -bp.num : bp.num;
  // décimos de por cento = bp ÷ 10
  const decimos = (2n * n + 10n * bp.den) / (20n * bp.den);
  const t = `${(decimos / 10n).toLocaleString('pt-BR')},${decimos % 10n}%`;
  return negativo && decimos > 0n ? `−${t}` : t;
}

/** "R$ 11,89 (39,8%)". */
export const margemEmTexto = (valor: Fracao, bp: Fracao) => `${formatarReaisComSinal(valor)} (${formatarPorcentagem(bp)})`;

// ------------------------------------------------------------------- ler

const ROTULO_CURTO: Record<CanalVenda, string> = { LOJA: 'Loja', DELIVERY_PROPRIO: 'Delivery', IFOOD: 'iFood' };

const NUMERO_DE_DINHEIRO = /^(R\$\s*)?\d[\d.]*(,\d{1,2})?$/i;
const FRASE_DO_LIMITE = 'Mais de R$ 100.000,00 por porção? Confira o número.';

/** Formulário → preço próprio por canal (centavos); vazio = usar o sugerido (null). */
export function lerPrecos(entrada: Partial<Record<CanalVenda, unknown>>): Leitura<Record<CanalVenda, number | null>> {
  const erros: Erros = {};
  const dados = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null } as Record<CanalVenda, number | null>;
  for (const canal of ORDEM_DOS_CANAIS) {
    const v = entrada[canal];
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t) continue;
    const c = lerDinheiro(t);
    // Número bem escrito, mas grande demais para caber (ex.: 2147483648): a frase do limite, não "inválido".
    if (c === null && NUMERO_DE_DINHEIRO.test(t)) erros[`preco-${canal}`] = FRASE_DO_LIMITE;
    else if (c === null) erros[`preco-${canal}`] = 'Preço inválido. Ex.: 29,90.';
    else if (c === 0) erros[`preco-${canal}`] = 'O preço precisa ser maior que zero. Para usar o sugerido, deixe vazio.';
    else if (c > LIMITES_DO_PRECO.centavos) erros[`preco-${canal}`] = FRASE_DO_LIMITE;
    else dados[canal] = c;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados };
}

/**
 * Formulário → margem-alvo (líquida) por canal, em pontos-base; vazio = sem
 * alvo. `taxaIfoodBp` = a taxa do iFood configurada (null = não configurada:
 * o alvo do iFood espera a taxa, porque o sugerido depende dela).
 */
export function lerMargensAlvo(entrada: Partial<Record<CanalVenda, unknown>>, taxaIfoodBp: number | null): Leitura<Record<CanalVenda, number | null>> {
  const erros: Erros = {};
  const dados = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null } as Record<CanalVenda, number | null>;
  for (const canal of ORDEM_DOS_CANAIS) {
    const v = entrada[canal];
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t) continue;
    const chave = `margem-${canal}`;
    const bp = lerPontosBase(t);
    if (bp === null) erros[chave] = 'Porcentagem inválida. Ex.: 65 ou 62,5 (até 2 casas).';
    else if (bp >= 10_000) erros[chave] = 'A margem-alvo fica abaixo de 100% do preço.';
    else if (canal === 'IFOOD' && taxaIfoodBp === null) erros[chave] = 'Configure a taxa do iFood antes: o preço sugerido do iFood depende dela.';
    else if (canal === 'IFOOD' && taxaIfoodBp !== null && taxaIfoodBp + bp >= 10_000) {
      erros[chave] = `Taxa do iFood ${formatarPontosBase(taxaIfoodBp)} + margem ${formatarPontosBase(bp)} = ${formatarPontosBase(taxaIfoodBp + bp)} do preço: com 100% ou mais, nenhum preço chega lá.`;
    } else dados[canal] = bp;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados };
}

// ------------------------------------------------------------- impressões

/** Os preços próprios que a tela leu, na ordem dos canais ("LOJA:-|DELIVERY_PROPRIO:-|IFOOD:2990"). */
export function impressaoDosPrecos(linhas: readonly { canal: string; precoManualCentavos: number | null }[]): string {
  return ORDEM_DOS_CANAIS.map((c) => `${c}:${linhas.find((l) => l.canal === c)?.precoManualCentavos ?? '-'}`).join('|');
}

/** O custo que a tela leu (sem taxa, a taxa, incompleto): se o servidor ler outro, a frase avisa. */
export function impressaoDosCustos(entradas: readonly EntradaDoCanal[]): string {
  return entradas
    .map((e) => {
      const c = camadasDoCanal(e);
      const t = c.taxa.tipo === 'sobrePreco' ? c.taxa.totalBp : c.taxa.tipo === 'naoConfigurada' ? 'x' : 0;
      return `${e.canal}:${c.semTaxa.num}/${c.semTaxa.den}:${t}:${c.incompleto ? 1 : 0}`;
    })
    .join('|');
}

// ------------------------------------------------------------------ retrato

const SUFIXO: Record<CanalVenda, string> = { LOJA: 'Loja', DELIVERY_PROPRIO: 'Delivery', IFOOD: 'Ifood' };

/** Campos do histórico de cada canal (`precoLoja`, `margemLoja`, `custoLoja`…). */
export const camposDoCanal = (c: CanalVenda) => ({ preco: `preco${SUFIXO[c]}`, margem: `margem${SUFIXO[c]}`, custo: `custo${SUFIXO[c]}` });

/**
 * Retrato dos preços para o histórico (o snapshot): por canal, o preço que
 * vale ("R$ 29,90" ou "sugerido (R$ 73,77)"), a margem líquida e o custo do
 * canal naquele instante (com a taxa no preço).
 */
export function retratoDosPrecos(precos: readonly PrecoDoCanal[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const p of precos) {
    const k = camposDoCanal(p.canal);
    r[k.preco] = !p.preco ? 'sem preço' : p.preco.origem === 'proprio' ? formatarFracao({ num: BigInt(p.preco.centavos), den: 1n }) : `sugerido (${formatarFracao({ num: BigInt(p.preco.centavos), den: 1n })})`;
    r[k.margem] = p.margens ? margemEmTexto(p.margens.liquida, p.margens.liquidaBp) : p.porQue ? 'incompleta' : '—';
    const semPreco = Array.from(new Set([...p.camadas.insumosSemPreco, ...p.camadas.embalagensSemPreco]));
    r[k.custo] = p.camadas.incompleto
      ? `incompleto (${formatarFracao(p.semTaxa)}${semPreco.length ? ` sem ${semPreco.map((n) => `“${n}”`).join(', ')}` : ''}${p.camadas.taxa.tipo === 'naoConfigurada' ? ' sem a taxa' : ''})`
      : p.camadas.total
      ? formatarFracao(p.camadas.total)
      : `${formatarFracao(p.semTaxa)} + ${formatarPontosBase(p.taxaBp)} do preço`;
  }
  return r;
}

export const rotuloCurtoDoCanal = (c: CanalVenda) => ROTULO_CURTO[c];

// ------------------------------------------------------- para o navegador

type FracaoEmTexto = { num: string; den: string };

/** A entrada como o navegador recebe (BigInt não atravessa: vai em texto). */
export interface EntradaEmTexto extends Omit<EntradaDoCanal, 'custoDaFicha'> {
  custoDaFicha: { porRendimento: FracaoEmTexto; faltaPreco: string[] };
}

export function entradaParaTela(e: EntradaDoCanal): EntradaEmTexto {
  return {
    canal: e.canal,
    custoDaFicha: { porRendimento: { num: e.custoDaFicha.porRendimento.num.toString(), den: e.custoDaFicha.porRendimento.den.toString() }, faltaPreco: [...e.custoDaFicha.faltaPreco] },
    embalagens: e.embalagens.map((x) => ({ ...x, insumo: { ...x.insumo } })),
    taxa: e.taxa,
  };
}

export function entradaDaTela(e: EntradaEmTexto): EntradaDoCanal {
  return {
    canal: e.canal,
    custoDaFicha: { porRendimento: { num: BigInt(e.custoDaFicha.porRendimento.num), den: BigInt(e.custoDaFicha.porRendimento.den) }, faltaPreco: e.custoDaFicha.faltaPreco },
    embalagens: e.embalagens,
    taxa: e.taxa,
  };
}

/** Pontos-base da taxa de uma entrada (0 = o canal não cobra; null = não configurada). */
export const taxaDaEntrada = (e: Pick<EntradaDoCanal, 'taxa'>): number | null => (e.taxa === 'naoConfigurada' ? null : e.taxa ? taxaTotalBp(e.taxa) : 0);
