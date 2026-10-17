/**
 * Período de apuração (2.2a, decisão 144) — as regras PURAS, sem banco e sem
 * Next. O período do DRE é o MESMO da contagem do estoque (o CMV real só fecha
 * se as duas usam as mesmas datas), e vem de duas coisas:
 *
 *  - a REGRA do parceiro, versionada (`RegraDoPeriodo`): mensal, quinzenal ou
 *    semanal, com o dia em que começa. Mudar a regra NUNCA é retroativo: ela
 *    vale do dia seguinte ao fim do período atual, e o primeiro período da
 *    regra nova nasce truncado no início (mensal dia 1 → dia 15 mudada em
 *    10/10: outubro inteiro, 01/11 a 14/11, 15/11 a 14/12…);
 *  - os períodos REGISTRADOS (`PeriodoApuracao`, criados quando a contagem de
 *    fechamento começa): quando uma data cai num deles, é ele; os períodos
 *    naturais ao redor são cortados para não os atravessar.
 *
 * Datas são texto "AAAA-MM-DD" (sem fuso).
 */

import { formatarData } from './compra-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { lerInteiro } from './unidades';

/** PERSONALIZADO é legado (sem tela): a regra nova nunca o aceita. */
export type TipoDePeriodo = 'MENSAL' | 'QUINZENAL' | 'SEMANAL';

export interface Periodo {
  /** Datas inclusivas, AAAA-MM-DD. */
  inicio: string;
  fim: string;
  nome: string;
}

export interface Regra {
  vigenteDesde: string;
  tipo: TipoDePeriodo;
  /** Mensal e quinzenal: dia do mês (1 a 28). Semanal: dia da semana (1 = segunda … 7 = domingo). */
  diaInicio: number;
}

/** Sem nenhuma regra gravada o parceiro vale o mês civil. */
export const REGRA_PADRAO: Regra = Object.freeze({ vigenteDesde: '2020-01-01', tipo: 'MENSAL', diaInicio: 1 }) as Regra;

/** Antes disto o ERP não tem dado (o mesmo piso das despesas e do faturamento). */
export const PRIMEIRO_DIA_DO_ERP = '2020-01-01';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_DA_SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'] as const;

const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDe = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const mesSeguinte = (ano: number, mes: number): [number, number] => (mes === 12 ? [ano + 1, 1] : [ano, mes + 1]);
const nomePorDatas = (inicio: string, fim: string) => `${formatarData(inicio, true)} a ${formatarData(fim, true)}`;

/**
 * O período NATURAL de uma regra que contém a data:
 * - MENSAL: do dia d até o dia d − 1 do mês seguinte (d = 1: o mês civil);
 * - QUINZENAL: d .. d + 14 e d + 15 .. dia d − 1 do mês seguinte;
 * - SEMANAL: a semana começa no dia da semana d (1 = segunda … 7 = domingo;
 *   d > 7 vale segunda, só por dado antigo).
 * Sem cortes: quem junta regras e períodos registrados é `periodoNaData`.
 */
export function periodoDaData(cfg: { tipo: TipoDePeriodo | 'PERSONALIZADO'; diaInicio: number }, data: string): Periodo {
  const d = Math.min(Math.max(Math.trunc(cfg.diaInicio) || 1, 1), 28);
  if (cfg.tipo === 'SEMANAL') {
    const inicioDaSemana = d <= 7 ? d : 1;
    const diaDaSemana = ((paraData(data).getUTCDay() + 6) % 7) + 1; // 1 = segunda
    const recua = (diaDaSemana - inicioDaSemana + 7) % 7;
    const inicio = somarDias(data, -recua);
    const fim = somarDias(inicio, 6);
    return { inicio, fim, nome: `Semana de ${nomePorDatas(inicio, fim)}` };
  }
  const dia = cfg.tipo === 'PERSONALIZADO' ? 1 : d;
  const [a, m] = data.split('-').map(Number);
  // Começo do "mês do parceiro" que contém a data.
  let ini: [number, number] = [a, m];
  if (Number(data.slice(8, 10)) < dia) ini = m === 1 ? [a - 1, 12] : [a, m - 1];
  const inicioDoMes = isoDe(ini[0], ini[1], dia);
  const [pa, pm] = mesSeguinte(ini[0], ini[1]);
  const fimDoMes = somarDias(isoDe(pa, pm, dia), -1);
  if (cfg.tipo === 'QUINZENAL') {
    const meio = somarDias(inicioDoMes, 15);
    if (data < meio) {
      const fim = somarDias(meio, -1);
      return { inicio: inicioDoMes, fim, nome: `1ª quinzena · ${nomePorDatas(inicioDoMes, fim)}` };
    }
    return { inicio: meio, fim: fimDoMes, nome: `2ª quinzena · ${nomePorDatas(meio, fimDoMes)}` };
  }
  const nome = dia === 1 ? `${MESES[ini[1] - 1][0].toUpperCase()}${MESES[ini[1] - 1].slice(1)} de ${ini[0]}` : nomePorDatas(inicioDoMes, fimDoMes);
  return { inicio: inicioDoMes, fim: fimDoMes, nome };
}

/**
 * As regras da mais antiga para a mais nova. O padrão (mensal, dia 1) é a base de todo parceiro: quando
 * a primeira regra gravada começa depois de 2020 (parceiro novo que mudou a regra), o padrão vale até
 * ela — a regra gravada nunca vale para trás da própria vigência.
 */
const porVigencia = (regras: readonly Regra[]): Regra[] => {
  const lista = [...regras].sort((x, y) => (x.vigenteDesde < y.vigenteDesde ? -1 : x.vigenteDesde > y.vigenteDesde ? 1 : 0));
  return lista.length === 0 || lista[0].vigenteDesde > REGRA_PADRAO.vigenteDesde ? [REGRA_PADRAO, ...lista] : lista;
};

/** A regra que vale na data (a primeira vale para trás de tudo) e a vigência da seguinte, se houver. */
export function regraDaData(regras: readonly Regra[], data: string): { regra: Regra; proximaDesde: string | null; primeira: boolean } {
  const lista = porVigencia(regras);
  let i = 0;
  for (let k = 0; k < lista.length; k++) if (lista[k].vigenteDesde <= data) i = k;
  return { regra: lista[i], proximaDesde: lista[i + 1]?.vigenteDesde ?? null, primeira: i === 0 };
}

/**
 * O período que contém a data: o registrado, se a data cai nele; senão o
 * natural da regra vigente, cortado pela vigência da regra (início) e da
 * seguinte (fim) e pelos registrados vizinhos. Dois períodos nunca se cruzam.
 */
export function periodoNaData(regras: readonly Regra[], registrados: readonly Periodo[], data: string): Periodo {
  const dentro = registrados.find((r) => r.inicio <= data && data <= r.fim);
  if (dentro) return { inicio: dentro.inicio, fim: dentro.fim, nome: dentro.nome };
  const { regra, proximaDesde, primeira } = regraDaData(regras, data);
  const natural = periodoDaData(regra, data);
  let inicio = natural.inicio;
  let fim = natural.fim;
  if (!primeira && inicio < regra.vigenteDesde) inicio = regra.vigenteDesde;
  if (proximaDesde && fim >= proximaDesde) fim = somarDias(proximaDesde, -1);
  for (const r of registrados) {
    if (r.fim < data && r.fim >= inicio) inicio = somarDias(r.fim, 1);
    if (r.inicio > data && r.inicio <= fim) fim = somarDias(r.inicio, -1);
  }
  return { inicio, fim, nome: inicio === natural.inicio && fim === natural.fim ? natural.nome : nomePorDatas(inicio, fim) };
}

/** O período anterior (o que contém a véspera do início). */
export function periodoAnteriorA(regras: readonly Regra[], registrados: readonly Periodo[], p: Periodo): Periodo {
  return periodoNaData(regras, registrados, somarDias(p.inicio, -1));
}

/** Os últimos `quantos` períodos até o de `hoje` (o de hoje primeiro), sem passar de 2020. */
export function periodosRecentes(regras: readonly Regra[], registrados: readonly Periodo[], hoje: string, quantos: number): Periodo[] {
  const out: Periodo[] = [];
  let p = periodoNaData(regras, registrados, hoje);
  while (out.length < quantos) {
    out.push(p);
    if (p.inicio <= PRIMEIRO_DIA_DO_ERP) break;
    p = periodoNaData(regras, registrados, somarDias(p.inicio, -1));
  }
  return out;
}

/**
 * O que mudar a regra hoje significa: a regra vale do dia seguinte ao fim do
 * período em que hoje cai (nunca retroativa). Regra futura pendente não conta
 * para achar o período de hoje: ela será substituída.
 */
export function vigenciaDaMudanca(regras: readonly Regra[], registrados: readonly Periodo[], hoje: string): { periodoAtual: Periodo; vigenteDesde: string; efetiva: Regra; pendente: Regra | null } {
  const efetivas = porVigencia(regras).filter((r) => r.vigenteDesde <= hoje);
  const periodoAtual = periodoNaData(efetivas, registrados, hoje);
  const pendentes = porVigencia(regras).filter((r) => r.vigenteDesde > hoje);
  return {
    periodoAtual,
    vigenteDesde: somarDias(periodoAtual.fim, 1),
    efetiva: efetivas[efetivas.length - 1] ?? REGRA_PADRAO,
    pendente: pendentes[0] ?? null,
  };
}

// ------------------------------------------------------------------ leitura do formulário

export const ROTULO_DO_TIPO: Record<TipoDePeriodo, string> = { MENSAL: 'Mensal', QUINZENAL: 'Quinzenal', SEMANAL: 'Semanal' };
export const TIPOS_DE_REGRA = Object.keys(ROTULO_DO_TIPO) as TipoDePeriodo[];
export const ehTipoDeRegra = (t: unknown): t is TipoDePeriodo => typeof t === 'string' && (TIPOS_DE_REGRA as string[]).includes(t);

export type ErrosDaRegra = Partial<Record<'tipo' | 'dia' | 'geral', string>>;

/** O texto do formulário vira regra (tipo e dia dentro da faixa do tipo) ou diz o que está errado. */
export function lerRegraDigitada(tipo: unknown, dia: unknown): { ok: true; tipo: TipoDePeriodo; diaInicio: number } | { ok: false; erros: ErrosDaRegra } {
  if (!ehTipoDeRegra(tipo)) return { ok: false, erros: { tipo: 'Escolha mensal, quinzenal ou semanal.' } };
  const n = typeof dia === 'string' ? lerInteiro(dia) : typeof dia === 'number' && Number.isInteger(dia) ? dia : null;
  const [min, max] = tipo === 'SEMANAL' ? [1, 7] : [1, 28];
  if (n === null || n < min || n > max) {
    return { ok: false, erros: { dia: tipo === 'SEMANAL' ? 'Escolha o dia da semana em que o período começa.' : 'Escolha o dia do mês em que o período começa (de 1 a 28).' } };
  }
  return { ok: true, tipo, diaInicio: n };
}

/** "Mensal · do dia 15 ao dia 14 do mês seguinte". */
export function fraseDaRegra(r: Pick<Regra, 'tipo' | 'diaInicio'>): string {
  if (r.tipo === 'SEMANAL') {
    const i = Math.min(Math.max(r.diaInicio, 1), 7) - 1;
    return `Semanal · de ${DIAS_DA_SEMANA[i]} a ${DIAS_DA_SEMANA[(i + 6) % 7]}`;
  }
  if (r.tipo === 'QUINZENAL') return r.diaInicio === 1 ? 'Quinzenal · dia 1 ao 15 e dia 16 ao fim do mês' : `Quinzenal · a partir do dia ${r.diaInicio}, duas por mês`;
  return r.diaInicio === 1 ? 'Mensal · do dia 1 ao último dia do mês' : `Mensal · do dia ${r.diaInicio} ao dia ${r.diaInicio - 1} do mês seguinte`;
}

/** Duas regras iguais no que importa (tipo e dia). */
export const mesmaRegra = (a: Pick<Regra, 'tipo' | 'diaInicio'>, b: Pick<Regra, 'tipo' | 'diaInicio'>) => a.tipo === b.tipo && a.diaInicio === b.diaInicio;

/** Quantos dias tem o período (inclusivo). */
export const diasDoPeriodo = (p: Pick<Periodo, 'inicio' | 'fim'>) => diasEntre(p.inicio, p.fim) + 1;

/**
 * A data da URL (`?periodo=`) vira uma data dentro do período pedido: existente, entre 2020 e hoje. Qualquer outra
 * (formato errado, "2026-02-31", futura, antiga) mostra o período de hoje COM uma frase, nunca em silêncio.
 */
export function lerPeriodoPedido(texto: string | undefined, hoje: string): { data: string; aviso: string | null } {
  if (!texto) return { data: hoje, aviso: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const [a, mes, dia] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (!m || d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return { data: hoje, aviso: 'A data do endereço não existe. Mostrando o período de hoje.' };
  if (texto > hoje) return { data: hoje, aviso: 'O DRE só existe até hoje. Mostrando o período de hoje.' };
  if (texto < PRIMEIRO_DIA_DO_ERP) return { data: hoje, aviso: 'O DRE começa em 01/01/2020. Mostrando o período de hoje.' };
  return { data: texto, aviso: null };
}
