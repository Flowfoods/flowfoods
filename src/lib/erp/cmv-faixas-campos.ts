/** Faixas absolutas do CMV: independentes da meta e sem arredondamento na comparação. */
import { ORDEM_DOS_CANAIS, type CanalVenda } from './canal-campos';
import type { Erros, Leitura } from './insumo-campos';
import { compararFracoes, lerPontosBase, type Fracao } from './unidades';

export const FAIXAS_DO_CMV = ['muitoFavoravel', 'favoravel', 'confortavel', 'atencao', 'critico'] as const;
export type FaixaDoCmv = (typeof FAIXAS_DO_CMV)[number];
export const ESTADOS_DAS_FAIXAS_DO_CMV = ['semDados', 'naoOfertado', 'faixasNaoConfiguradas'] as const;
export type EstadoDaFaixaDoCmv = (typeof ESTADOS_DAS_FAIXAS_DO_CMV)[number];
export type FiltroDaFaixaDoCmv = { canal: CanalVenda; faixa: FaixaDoCmv | EstadoDaFaixaDoCmv };
export const valorDoFiltroDaFaixaDoCmv = (f: FiltroDaFaixaDoCmv): string => `${f.canal}-${f.faixa}`;
export function lerFiltroDaFaixaDoCmv(valor: string | undefined): FiltroDaFaixaDoCmv | null {
  const partes = (valor ?? '').split('-');
  if (partes.length !== 2) return null;
  const canal = ORDEM_DOS_CANAIS.find(c => c === partes[0]);
  const faixa = [...FAIXAS_DO_CMV, ...ESTADOS_DAS_FAIXAS_DO_CMV].find(f => f === partes[1]);
  return canal && faixa ? { canal, faixa } : null;
}

/** Mesmo teto prático do leitor decimal existente; não é teto de 100% nem valor inicial. */
export const LIMITE_DO_FAROL_BP = 2_000_000_000;
export const CAMPOS_DO_FAROL = ['a', 'b', 'c', 'd'] as const;
export type CampoDoFarol = (typeof CAMPOS_DO_FAROL)[number];
export type CortesDoFarol = Readonly<{ aBp: number; bBp: number; cBp: number; dBp: number }>;
export type CortesDigitados = Readonly<Record<CampoDoFarol, unknown>>;
export type ConfiguracaoDoFarol = Record<CanalVenda, CortesDoFarol | null>;
export type EntradaDasFaixas = Record<CanalVenda, CortesDigitados>;
export type ResultadoDoFarol = {
  faixa: FaixaDoCmv | EstadoDaFaixaDoCmv;
  motivo: string | null;
  cortes: CortesDoFarol | null;
};

export const campoDaFaixa = (canal: CanalVenda, campo: CampoDoFarol) => `farol_${canal}_${campo}`;

const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const cortesValidos = (c: CortesDoFarol) => {
  const v = [c.aBp, c.bBp, c.cBp, c.dBp];
  return v.every(n => Number.isSafeInteger(n) && n >= 0 && n <= LIMITE_DO_FAROL_BP) && v.every((n, i) => !i || n > v[i - 1]);
};

/** Campos a/b/c/d são obrigatoriamente textuais; só quatro textos vazios retiram a configuração. */
export function lerCortesDoFarol(entrada: unknown): Leitura<CortesDoFarol | null> {
  const erros: Erros = {};
  const textos = CAMPOS_DO_FAROL.map(campo => {
    const valor = objeto(entrada) ? entrada[campo] : undefined;
    if (typeof valor !== 'string') erros[campo] = 'Envie os quatro limites deste canal. Para retirar as faixas, deixe os quatro vazios.';
    return typeof valor === 'string' ? valor.trim() : '';
  });
  if (Object.keys(erros).length) return { ok: false, erros };
  if (textos.every(t => !t)) return { ok: true, dados: null };
  const valores = textos.map((texto, i) => {
    if (!texto) erros[CAMPOS_DO_FAROL[i]] = 'Preencha os quatro limites ou deixe os quatro vazios.';
    const bp = texto ? lerPontosBase(texto) : null;
    if (texto && (bp === null || bp > LIMITE_DO_FAROL_BP)) erros[CAMPOS_DO_FAROL[i]] = 'Use uma porcentagem de 0 a 20.000.000%, com até duas casas decimais.';
    return bp;
  });
  if (!Object.keys(erros).length) {
    for (let i = 1; i < valores.length; i++) {
      if (valores[i]! <= valores[i - 1]!) erros[CAMPOS_DO_FAROL[i]] = 'Este limite precisa ser maior que o anterior.';
    }
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { aBp: valores[0]!, bBp: valores[1]!, cBp: valores[2]!, dBp: valores[3]! } };
}

/** Uma gravação dos três canais: ausência não equivale a retirada. */
export function lerFaixasDeCmv(entrada: unknown): Leitura<ConfiguracaoDoFarol> {
  const erros: Erros = {};
  const dados = {} as ConfiguracaoDoFarol;
  for (const canal of ORDEM_DOS_CANAIS) {
    const lido = lerCortesDoFarol(objeto(entrada) ? entrada[canal] : undefined);
    if (lido.ok) dados[canal] = lido.dados;
    else for (const [campo, erro] of Object.entries(lido.erros)) erros[campoDaFaixa(canal, campo as CampoDoFarol)] = erro;
  }
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados };
}

export function classificarFarolDeCmv(
  entrada: { ofertado: boolean; custoCompleto: boolean; custoPositivo: boolean; cmvBp: Fracao | null; motivoSemDados: string | null },
  cortes: CortesDoFarol | null,
): ResultadoDoFarol {
  if (cortes && !cortesValidos(cortes)) throw new RangeError('Conjunto de limites do farol inválido.');
  if (!entrada.ofertado) return { faixa: 'naoOfertado', motivo: null, cortes };
  if (!entrada.custoCompleto || !entrada.custoPositivo || !entrada.cmvBp) return { faixa: 'semDados', motivo: entrada.motivoSemDados ?? 'Custo completo e positivo e preço de venda são necessários.', cortes };
  if (!cortes) return { faixa: 'faixasNaoConfiguradas', motivo: null, cortes: null };
  const comparar = (bp: number) => compararFracoes(entrada.cmvBp!, { num: BigInt(bp), den: 1n });
  const faixa: FaixaDoCmv = comparar(cortes.aBp) < 0 ? 'muitoFavoravel'
    : comparar(cortes.bBp) < 0 ? 'favoravel'
    : comparar(cortes.cBp) <= 0 ? 'confortavel'
    : comparar(cortes.dBp) <= 0 ? 'atencao' : 'critico';
  return { faixa, motivo: null, cortes };
}

/** Aceita somente pares explícitos e válidos, em ordem estável de canal/faixa. */
export function filtrosFaixasCmvCanonicos(pares: readonly FiltroDaFaixaDoCmv[]): FiltroDaFaixaDoCmv[] {
  const estados = [...FAIXAS_DO_CMV, ...ESTADOS_DAS_FAIXAS_DO_CMV];
  return ORDEM_DOS_CANAIS.flatMap(canal => estados.filter(faixa => pares.some(p => p?.canal === canal && p.faixa === faixa)).map(faixa => ({ canal, faixa })));
}
