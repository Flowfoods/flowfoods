/**
 * Preço pela META DE CMV e CMV teórico do produto por canal — a parte PURA (sem banco, sem Next).
 *
 * Decisão de Rodolfo (Notion, "Decisão prioritária — precificar pela meta de CMV; margem como resultado"),
 * que substitui a margem-alvo como comando da sugestão:
 *
 *   custo físico C   = ingredientes e pré-preparos da porção + embalagens/materiais DO CANAL (loja: sem embalagem)
 *                      — taxas de plataforma ficam FORA do C
 *   sugerido         = C ÷ meta de CMV do canal (arredondado PARA CIMA ao centavo)
 *   CMV teórico      = C ÷ preço de venda definido pela pessoa × 100 (não é o CMV real do estoque nem o do DRE)
 *   farol            = dentro (CMV ≤ meta) · acima (CMV > meta) · sem dados (com o motivo) · não ofertado
 *   resultado após os custos informados = preço − C − taxa do canal sobre o preço (NÃO é lucro líquido:
 *                      aluguel, equipe, impostos e o resto da casa não entram)
 *
 * Regras de integridade (ponto 2 do registro de aprovações):
 *  - faltar custo, meta ou preço nunca vira zero, sugestão nem farol positivo: é "sem dados" com o motivo;
 *  - a taxa do iFood não configurada NÃO invalida o CMV nem a sugestão (a taxa não entra no CMV): só o
 *    resultado fica pendente, dito como tal;
 *  - o preço sugerido não é o preço praticado: sem preço definido pela pessoa, o CMV e o resultado ficam
 *    "sem dados" (a sugestão continua visível);
 *  - canal não ofertado é diferente de dado ausente.
 *
 * Nada aqui arredonda, exceto o sugerido (para cima, ao centavo). As contas são frações exatas.
 */

import { camadasDoCanal, CANAIS, type CamadasDoCanal, type CanalVenda } from './canal-campos';
import type { Erros, Leitura } from './insumo-campos';
import { precoDeCardapio, type EntradaDoCanal } from './preco-campos';
import { compararFracoes, formatarFracao, formatarPontosBase, lerPontosBase, somar, TETO_DE_EXIBICAO, type Fracao } from './unidades';

const BP = 10_000n;

const neg = (f: Fracao): Fracao => ({ num: -f.num, den: f.den });

/** a ÷ b para cima (a ≥ 0, b > 0). */
const paraCima = (a: bigint, b: bigint) => (a + b - 1n) / b;

// ------------------------------------------------------------------ meta

/** Limites da meta de CMV: maior que 0 % e menor que 100 % do preço. */
export const LIMITES_DA_META_DE_CMV = { minimoBp: 1, maximoBp: 9_999 } as const;

/**
 * Formulário → meta de CMV por canal, em pontos-base (25 % = 2500); vazio = sem meta (o canal fica
 * "sem dados" para o farol e sem sugestão). A meta não depende da taxa do canal: a taxa não entra no CMV.
 */
export function lerMetasDeCmv(entrada: Partial<Record<CanalVenda, unknown>>): Leitura<Record<CanalVenda, number | null>> {
  const erros: Erros = {};
  const dados = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null } as Record<CanalVenda, number | null>;
  for (const canal of Object.keys(dados) as CanalVenda[]) {
    const v = entrada[canal];
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t) continue;
    const chave = `metaCmv-${canal}`;
    const bp = lerPontosBase(t);
    if (bp === null) erros[chave] = 'Porcentagem inválida. Ex.: 30 ou 27,5 (até 2 casas).';
    else if (bp < LIMITES_DA_META_DE_CMV.minimoBp) erros[chave] = 'A meta de CMV precisa ser maior que 0%. Para ficar sem meta, deixe vazio.';
    else if (bp > LIMITES_DA_META_DE_CMV.maximoBp) erros[chave] = 'A meta de CMV fica abaixo de 100% do preço.';
    else dados[canal] = bp;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados };
}

// ------------------------------------------------------------- custo físico

export interface CustoFisico {
  /** Ingredientes/pré-preparos da porção + embalagens do canal. Com falta, é a PARTE conhecida. */
  valor: Fracao;
  /** Embalagens do canal (zero na loja). */
  embalagens: Fracao;
  completo: boolean;
  /** O que não tem preço (insumos, até o fundo da cascata, e embalagens), sem repetir. */
  falta: string[];
}

/** O custo físico do canal a partir das camadas da 1.9: o `semTaxa` delas, sem olhar a taxa. */
export function custoFisicoDasCamadas(c: CamadasDoCanal): CustoFisico {
  const falta = Array.from(new Set([...c.insumosSemPreco, ...c.embalagensSemPreco]));
  return { valor: c.semTaxa, embalagens: c.embalagensTotal, completo: falta.length === 0, falta };
}

// ----------------------------------------------------------------- sugerido

export type SugeridoPorCmv =
  /** O canal não tem meta de CMV: sem sugestão (o preço definido pela pessoa ainda vale). */
  | { tipo: 'semMeta' }
  /** Custo físico incompleto: nenhum número. */
  | { tipo: 'incompleto'; falta: string[] }
  /** Custo físico zero: não há o que dividir (não sugere R$ 0,00). */
  | { tipo: 'semCusto' }
  | { tipo: 'acimaDoLimite' }
  /** `exato` em fração de centavos; `centavos` = para cima; `cardapio` = a próxima ,90. */
  | { tipo: 'ok'; exato: Fracao; centavos: number; cardapio: number };

export function sugeridoPorCmv(p: { fisico: CustoFisico; metaBp: number | null }): SugeridoPorCmv {
  if (!p.fisico.completo) return { tipo: 'incompleto', falta: [...p.fisico.falta] };
  if (p.metaBp === null) return { tipo: 'semMeta' };
  if (!Number.isSafeInteger(p.metaBp) || p.metaBp < LIMITES_DA_META_DE_CMV.minimoBp || p.metaBp > LIMITES_DA_META_DE_CMV.maximoBp) {
    throw new RangeError('Meta de CMV fora do domínio (maior que 0% e menor que 100%).');
  }
  if (p.fisico.valor.num <= 0n) return { tipo: 'semCusto' };
  const exato: Fracao = { num: p.fisico.valor.num * BP, den: p.fisico.valor.den * BigInt(p.metaBp) };
  const centavos = paraCima(exato.num, exato.den);
  if (centavos > TETO_DE_EXIBICAO) return { tipo: 'acimaDoLimite' };
  const n = Number(centavos);
  return { tipo: 'ok', exato, centavos: n, cardapio: precoDeCardapio(n) };
}

/** "R$ 2,20 ÷ 25% = R$ 8,80" — a conta por extenso, igual na tela e no teste. */
export function contaDoSugeridoPorCmv(fisico: Fracao, metaBp: number, s: Extract<SugeridoPorCmv, { tipo: 'ok' }>): string {
  return `${formatarFracao(fisico)} ÷ ${formatarPontosBase(metaBp)} = ${formatarFracao({ num: BigInt(s.centavos), den: 1n })}`;
}

// --------------------------------------------------------- CMV e resultado

/** CMV teórico em pontos-base exatos do preço: C ÷ preço × 10.000. */
export function cmvTeoricoBp(fisico: Fracao, precoCentavos: number): Fracao {
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) throw new RangeError('Preço precisa ser maior que zero.');
  return { num: fisico.num * BP, den: fisico.den * BigInt(precoCentavos) };
}

export type StatusDoCmv = 'dentro' | 'acima' | 'semDados' | 'naoOfertado';

export const STATUS_DO_CMV: Record<StatusDoCmv, { rotulo: string; tom: 'ok' | 'alerta' | 'neutro' }> = {
  dentro: { rotulo: 'dentro da meta', tom: 'ok' },
  acima: { rotulo: 'acima da meta', tom: 'alerta' },
  semDados: { rotulo: 'sem dados', tom: 'neutro' },
  naoOfertado: { rotulo: 'não ofertado', tom: 'neutro' },
};

/** Uma parcela que entrou no resultado, dita por extenso ("ingredientes", "embalagens", "taxa do iFood"). */
export type ParcelaDoResultado = 'ingredientes' | 'embalagens' | 'taxa';

export type ResultadoDoCanal =
  /** Preço − custo físico − taxa: exato. `bp` sobre o preço. */
  | { tipo: 'ok'; valor: Fracao; bp: Fracao; taxa: Fracao; parcelas: ParcelaDoResultado[]; negativo: boolean }
  /** Falta algo para fechar a conta (custo, preço ou a taxa do canal): o motivo, sem número falso. */
  | { tipo: 'pendente'; motivo: string };

export interface CmvDoCanal {
  canal: CanalVenda;
  ofertado: boolean;
  fisico: CustoFisico;
  metaBp: number | null;
  sugerido: SugeridoPorCmv;
  /** O preço de venda DEFINIDO pela pessoa; null = não definido (a sugestão não é preço praticado). */
  precoCentavos: number | null;
  /** CMV teórico ao preço definido; null = sem custo completo ou sem preço. */
  cmvBp: Fracao | null;
  status: StatusDoCmv;
  /** Por que está "sem dados" (null nos outros status). */
  motivo: string | null;
  resultado: ResultadoDoCanal;
}

/** O que falta, numa frase só ("falta preço em “Sacola”; sem meta de CMV para o canal"). */
function motivoDosDados(p: { fisico: CustoFisico; metaBp: number | null; precoCentavos: number | null }): string | null {
  const partes: string[] = [];
  if (!p.fisico.completo) partes.push(`falta preço em ${p.fisico.falta.map((n) => `“${n}”`).join(', ')}`);
  if (p.fisico.completo && p.fisico.valor.num <= 0n) partes.push('custo físico zero (confira a receita)');
  if (p.precoCentavos === null) partes.push('preço de venda não definido');
  if (p.metaBp === null) partes.push('sem meta de CMV para o canal');
  return partes.length ? partes.join('; ') : null;
}

/**
 * A conta inteira de um canal pela meta de CMV. `ofertado: false` = o produto não é vendido neste canal
 * (diferente de dado ausente). `precoCentavos` = o preço DEFINIDO pela pessoa (null = não definido).
 */
export function cmvDoCanal(e: EntradaDoCanal, p: { metaBp: number | null; precoCentavos: number | null; ofertado?: boolean }): CmvDoCanal {
  const ofertado = p.ofertado ?? true;
  const base = camadasDoCanal(e);
  const fisico = custoFisicoDasCamadas(base);
  const sugerido = sugeridoPorCmv({ fisico, metaBp: p.metaBp });
  if (!ofertado) {
    return { canal: e.canal, ofertado, fisico, metaBp: p.metaBp, sugerido, precoCentavos: p.precoCentavos, cmvBp: null, status: 'naoOfertado', motivo: null, resultado: { tipo: 'pendente', motivo: 'canal não ofertado' } };
  }
  const preco = p.precoCentavos;
  const cmvBp = preco !== null && fisico.completo ? cmvTeoricoBp(fisico.valor, preco) : null;
  const motivo = motivoDosDados({ fisico, metaBp: p.metaBp, precoCentavos: preco });
  let status: StatusDoCmv = 'semDados';
  if (cmvBp && p.metaBp !== null && fisico.valor.num > 0n) status = compararFracoes(cmvBp, { num: BigInt(p.metaBp), den: 1n }) <= 0 ? 'dentro' : 'acima';
  return {
    canal: e.canal,
    ofertado,
    fisico,
    metaBp: p.metaBp,
    sugerido,
    precoCentavos: preco,
    cmvBp,
    status,
    motivo: status === 'semDados' ? motivo ?? 'dados insuficientes' : null,
    resultado: resultadoDoCanal(base, fisico, preco),
  };
}

/** Preço − custo físico − taxa do canal sobre o preço. Exato; pendente quando falta algo. */
function resultadoDoCanal(c: CamadasDoCanal, fisico: CustoFisico, preco: number | null): ResultadoDoCanal {
  const faltas: string[] = [];
  if (!fisico.completo) faltas.push(`falta preço em ${fisico.falta.map((n) => `“${n}”`).join(', ')}`);
  if (preco === null) faltas.push('preço de venda não definido');
  if (c.taxa.tipo === 'naoConfigurada') faltas.push(`taxa do ${CANAIS[c.canal].curto} não configurada`);
  if (faltas.length || preco === null) return { tipo: 'pendente', motivo: faltas.join('; ') };
  const comPreco = camadasDoCanal({
    canal: c.canal,
    custoDaFicha: { porRendimento: c.daFicha, faltaPreco: [] },
    embalagens: [],
    taxa: c.taxa.tipo === 'sobrePreco' ? c.taxa.taxa : null,
    precoCentavos: preco,
  });
  const taxa: Fracao = comPreco.taxa.tipo === 'sobrePreco' && comPreco.taxa.valor ? comPreco.taxa.valor : { num: 0n, den: 1n };
  const valor = somar(somar({ num: BigInt(preco), den: 1n }, neg(fisico.valor)), neg(taxa));
  const parcelas: ParcelaDoResultado[] = ['ingredientes'];
  if (c.canal !== 'LOJA') parcelas.push('embalagens');
  if (c.taxa.tipo === 'sobrePreco') parcelas.push('taxa');
  return { tipo: 'ok', valor, bp: { num: valor.num * BP, den: valor.den * BigInt(preco) }, taxa, parcelas, negativo: valor.num < 0n };
}

// ------------------------------------------------------------------ textos

/** "ingredientes, embalagens e taxa do iFood" — o que entrou no resultado, para o rótulo nunca enganar. */
export function parcelasEmTexto(canal: CanalVenda, parcelas: readonly ParcelaDoResultado[]): string {
  const nomes = parcelas.map((p) => (p === 'taxa' ? `taxa do ${CANAIS[canal].curto}` : p));
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** O rótulo do resultado: nunca "lucro líquido" (aluguel, equipe e impostos não entram). */
export const ROTULO_DO_RESULTADO = 'Resultado após os custos informados';

// ------------------------------------------------------------------ retrato

const SUFIXO: Record<CanalVenda, string> = { LOJA: 'Loja', DELIVERY_PROPRIO: 'Delivery', IFOOD: 'Ifood' };

/** Campos do histórico de cada canal pela meta de CMV (`precoLoja`, `cmvLoja`, `resultadoLoja`, `fisicoLoja`). */
export const camposDoCmv = (c: CanalVenda) => ({ preco: `preco${SUFIXO[c]}`, cmv: `cmv${SUFIXO[c]}`, resultado: `resultado${SUFIXO[c]}`, custo: `fisico${SUFIXO[c]}` });

/** "20,0%" a partir de pontos-base exatos (uma casa, metade para longe do zero). */
export function porcentagemDoCmv(bp: Fracao): string {
  const negativo = bp.num < 0n;
  const n = negativo ? -bp.num : bp.num;
  const decimos = (2n * n + 10n * bp.den) / (20n * bp.den);
  const t = `${(decimos / 10n).toLocaleString('pt-BR')},${decimos % 10n}%`;
  return negativo && decimos > 0n ? `−${t}` : t;
}

const reaisComSinal = (f: Fracao) => (f.num < 0n ? `−${formatarFracao({ num: -f.num, den: f.den })}` : formatarFracao(f));

/**
 * Retrato da precificação para o histórico (N.2): por canal, o preço DEFINIDO ("não definido" quando vazio — a
 * sugestão não é preço praticado), o CMV com a meta e o farol, o resultado após os custos informados e o custo físico
 * naquele instante. Nada é "lucro".
 */
export function retratoDoCmv(contas: readonly CmvDoCanal[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const c of contas) {
    const k = camposDoCmv(c.canal);
    r[k.preco] = c.precoCentavos === null ? 'não definido' : formatarFracao({ num: BigInt(c.precoCentavos), den: 1n });
    r[k.cmv] = !c.cmvBp
      ? `sem dados (${c.motivo ?? 'dados insuficientes'})`
      : c.metaBp === null
      ? `${porcentagemDoCmv(c.cmvBp)} (sem meta)`
      : `${porcentagemDoCmv(c.cmvBp)} (meta ${formatarPontosBase(c.metaBp)}, ${STATUS_DO_CMV[c.status].rotulo})`;
    r[k.resultado] = c.resultado.tipo === 'ok' ? `${reaisComSinal(c.resultado.valor)} (${porcentagemDoCmv(c.resultado.bp)})` : `pendente (${c.resultado.motivo})`;
    r[k.custo] = c.fisico.completo ? formatarFracao(c.fisico.valor) : `incompleto (${formatarFracao(c.fisico.valor)} sem ${c.fisico.falta.map((n) => `“${n}”`).join(', ')})`;
  }
  return r;
}
