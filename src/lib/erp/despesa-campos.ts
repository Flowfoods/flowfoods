/**
 * Despesa manual (2.2a) — a parte PURA: ler o que foi digitado, validar,
 * a competência (dia, mês ou intervalo), a apropriação dia a dia ao centavo, a
 * recorrência e as contas a pagar. O servidor lê o TEXTO; a tela só mostra prévia.
 *
 * COMPETÊNCIA, não caixa (decisão 138): o DRE gerencial casa com o faturamento,
 * que é por dia de venda. A luz de outubro é de outubro mesmo paga em novembro.
 * A competência é um intervalo de dias [início, fim] — um dia (conserto), um mês
 * inteiro (aluguel, salário, luz) ou até 366 dias (IPTU, seguro anual).
 *
 * APROPRIAÇÃO exata ao centavo: o valor V de uma despesa de D dias é espalhado
 * dia a dia por ARREDONDAMENTO ACUMULADO — até o dia k o apropriado é
 * round(V × k ÷ D), metade para cima, em fração exata (BigInt). O que cai num
 * recorte (período, "até ontem") é a diferença de dois acumulados. Daí saem
 * três propriedades que o DRE precisa: (1) as fatias de qualquer sequência de
 * recortes que cobre a competência somam V ao centavo; (2) cada fatia erra no
 * máximo 1 centavo da conta exata; (3) a fatia de um período não depende de
 * como os OUTROS períodos foram cortados — mudar a regra do período não
 * mexe nos centavos de um período já apurado.
 */

import { formatarData } from './compra-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { limparTexto } from './texto-limpo';
import { diasDoMes, mesVizinho, rotuloDoMes } from './faturamento-campos';
import { formatarDinheiro, lerDinheiro, temFormaDeDinheiro } from './unidades';

export const LIMITES_DA_DESPESA = {
  /** R$ 0,01 a R$ 10.000.000,00 (CHECK no banco). */
  valorMinimoCentavos: 1,
  valorMaximoCentavos: 1_000_000_000,
  descricao: 120,
  /** Até 366 dias de competência (CHECK no banco: fim − início ≤ 365). */
  diasDeCompetencia: 366,
  /** Início de competência até 3 anos para trás (1095 dias) e até 12 meses (calendário) para a frente. */
  janelaParaTrasEmDias: 1095,
  dataMinima: '2020-01-01',
  motivo: 200,
} as const;

const REAIS_DO_TETO = formatarDinheiro(LIMITES_DA_DESPESA.valorMaximoCentavos);

// ------------------------------------------------------------------ competência

export type TipoDeCompetencia = 'dia' | 'mes' | 'intervalo';
export const ehTipoDeCompetencia = (t: unknown): t is TipoDeCompetencia => t === 'dia' || t === 'mes' || t === 'intervalo';

export interface Competencia {
  /** Datas inclusivas, AAAA-MM-DD. */
  inicio: string;
  fim: string;
}

export const diasDaCompetencia = (c: Competencia) => diasEntre(c.inicio, c.fim) + 1;

/** "2026-10" → o mês inteiro. */
export function competenciaDoMes(mes: string): Competencia {
  const dias = diasDoMes(mes);
  return { inicio: dias[0], fim: dias[dias.length - 1] };
}

/** A competência é um mês civil inteiro (só ela pode repetir todo mês)? */
export function ehMesInteiro(c: Competencia): boolean {
  const m = c.inicio.slice(0, 7);
  const cheio = competenciaDoMes(m);
  return cheio.inicio === c.inicio && cheio.fim === c.fim;
}

/** O tipo que a competência tem (para abrir o formulário de edição). */
export function tipoDaCompetencia(c: Competencia): TipoDeCompetencia {
  if (c.inicio === c.fim) return 'dia';
  return ehMesInteiro(c) ? 'mes' : 'intervalo';
}

/** "14/10/2026", "outubro de 2026" ou "01/03/2026 a 28/02/2027". */
export function rotuloDaCompetencia(c: Competencia): string {
  if (c.inicio === c.fim) return formatarData(c.inicio);
  if (ehMesInteiro(c)) return rotuloDoMes(c.inicio.slice(0, 7));
  return `${formatarData(c.inicio)} a ${formatarData(c.fim)}`;
}

/** Os meses civis ("aaaa-mm") que o intervalo toca, do primeiro ao último. */
export function mesesDoIntervalo(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = mesVizinho(m, 1)) out.push(m);
  return out;
}

/** O dia `dia` do mês `mes`, ou o último dia do mês se ele não tem tanto ("31" em fevereiro). */
export function diaNoMes(mes: string, dia: number): string {
  const dias = diasDoMes(mes);
  return dias[Math.min(dia, dias.length) - 1];
}

// ------------------------------------------------------------------ apropriação

/** O acumulado até o dia k (0..D): round(V × k ÷ D), metade para cima, exato. */
export function acumulado(valorCentavos: number, k: number, dias: number): number {
  if (dias <= 0) throw new Error('A competência tem pelo menos um dia.');
  const kk = Math.min(Math.max(k, 0), dias);
  return Number((2n * BigInt(valorCentavos) * BigInt(kk) + BigInt(dias)) / (2n * BigInt(dias)));
}

/**
 * Quanto da despesa cai em [de, ate] (inclusivo): a diferença de dois acumulados. Fora da
 * competência é zero. `valorCentavos` inteiro, `ate` antes de `de` = zero.
 */
export function apropriar(valorCentavos: number, comp: Competencia, recorte: { de: string; ate: string }): number {
  const D = diasDaCompetencia(comp);
  if (recorte.ate < recorte.de) return 0;
  const ate = recorte.ate < comp.fim ? recorte.ate : comp.fim;
  const de = recorte.de > comp.inicio ? recorte.de : comp.inicio;
  if (ate < de) return 0;
  const antes = diasEntre(comp.inicio, de);
  const ateAqui = diasEntre(comp.inicio, ate) + 1;
  return acumulado(valorCentavos, ateAqui, D) - acumulado(valorCentavos, antes, D);
}

/** As fatias de uma competência por uma sequência de recortes (testes e a tela de periodos). */
export function fatiar(valorCentavos: number, comp: Competencia, recortes: readonly { de: string; ate: string }[]): number[] {
  return recortes.map((r) => apropriar(valorCentavos, comp, r));
}

// ------------------------------------------------------------------ ler o formulário

export interface TextosDaDespesa {
  /** Identificador aleatório do formulário (duplo envio = uma só despesa). */
  envio: string;
  /** '' = despesa da rede. */
  lojaId: string;
  /** `chaveDaLinha` da linha do plano. */
  linha: string;
  descricao: string;
  valor: string;
  tipo: string;
  /** Dia, quando o tipo é dia. */
  dia: string;
  /** "aaaa-mm", quando o tipo é mês. */
  mes: string;
  /** Intervalo. */
  de: string;
  ate: string;
  recorrente: boolean;
  vencimento: string;
}

export interface DespesaLida {
  envio: string;
  lojaId: string | null;
  linha: string;
  descricao: string;
  valorCentavos: number;
  competencia: Competencia;
  recorrente: boolean;
  vencimento: string | null;
}

export type ErrosDaDespesa = Partial<Record<'valor' | 'descricao' | 'linha' | 'loja' | 'competencia' | 'vencimento' | 'recorrente' | 'geral', string>>;

export const ENVIO_VALIDO = /^[A-Za-z0-9_-]{16,64}$/;

/** O valor digitado em reais: maior que zero, até R$ 10 milhões. "0", "-5", "1e3" e vazio são recusados com frase. */
export function lerValorDaDespesa(texto: string): { ok: true; centavos: number } | { ok: false; erro: string } {
  const t = texto.trim();
  if (t === '') return { ok: false, erro: 'Informe o valor da despesa (R$).' };
  if (/^-/.test(t)) return { ok: false, erro: 'O valor não pode ser negativo.' };
  if (/^[=+@\t\r]/.test(texto) || /^\s+[=+\-@]/.test(texto)) return { ok: false, erro: 'Valor: só número (ex.: 3.100,00), sem fórmula nem sinal.' };
  const v = lerDinheiro(t);
  if (v === null) {
    return { ok: false, erro: temFormaDeDinheiro(t) ? `Valor grande demais: o teto por despesa é ${REAIS_DO_TETO}.` : 'Valor inválido: use o formato 3.100,00.' };
  }
  if (v < LIMITES_DA_DESPESA.valorMinimoCentavos) return { ok: false, erro: 'O valor precisa ser maior que zero.' };
  if (v > LIMITES_DA_DESPESA.valorMaximoCentavos) return { ok: false, erro: `Acima do teto de ${REAIS_DO_TETO} por despesa: confira o valor.` };
  return { ok: true, centavos: v };
}

function lerDataLivre(texto: string): string | null {
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!iso && !br) return null;
  const [a, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(br![3]), Number(br![2]), Number(br![1])];
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** A janela em que a competência pode começar. */
export function janelaDaCompetencia(hoje: string): { de: string; ate: string } {
  const atras = somarDias(hoje, -LIMITES_DA_DESPESA.janelaParaTrasEmDias);
  // 12 meses à frente: o mesmo dia do ano que vem (29/02 vira 28/02).
  const [a, m, d] = hoje.split('-').map(Number);
  const aFrente = new Date(Date.UTC(a + 1, m - 1, d));
  const ate = aFrente.getUTCMonth() !== m - 1 ? new Date(Date.UTC(a + 1, m, 0)) : aFrente;
  return { de: atras > LIMITES_DA_DESPESA.dataMinima ? atras : LIMITES_DA_DESPESA.dataMinima, ate: ate.toISOString().slice(0, 10) };
}

/** Lê a competência digitada. O início precisa estar na janela; o intervalo cabe em 366 dias. */
export function lerCompetencia(t: Pick<TextosDaDespesa, 'tipo' | 'dia' | 'mes' | 'de' | 'ate'>, hoje: string): { ok: true; competencia: Competencia } | { ok: false; erro: string } {
  if (!ehTipoDeCompetencia(t.tipo)) return { ok: false, erro: 'Escolha se a despesa é de um dia, de um mês ou de um período.' };
  let c: Competencia;
  if (t.tipo === 'dia') {
    const d = lerDataLivre(t.dia);
    if (!d) return { ok: false, erro: 'Data inválida: use dd/mm/aaaa (ex.: 14/10/2026).' };
    c = { inicio: d, fim: d };
  } else if (t.tipo === 'mes') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(t.mes.trim())) return { ok: false, erro: 'Escolha o mês da despesa.' };
    c = competenciaDoMes(t.mes.trim());
  } else {
    const de = lerDataLivre(t.de);
    const ate = lerDataLivre(t.ate);
    if (!de || !ate) return { ok: false, erro: 'Informe o primeiro e o último dia da despesa (dd/mm/aaaa).' };
    if (ate < de) return { ok: false, erro: 'O último dia não pode vir antes do primeiro.' };
    c = { inicio: de, fim: ate };
  }
  if (diasDaCompetencia(c) > LIMITES_DA_DESPESA.diasDeCompetencia) {
    return { ok: false, erro: `Uma despesa cobre no máximo ${LIMITES_DA_DESPESA.diasDeCompetencia} dias. Para mais, lance em partes.` };
  }
  const janela = janelaDaCompetencia(hoje);
  if (c.inicio < LIMITES_DA_DESPESA.dataMinima) return { ok: false, erro: 'O ERP não tem despesa antes de 2020.' };
  if (c.inicio < janela.de) return { ok: false, erro: `${formatarData(c.inicio)} é de mais de 3 anos atrás: o ERP não aceita despesa tão antiga.` };
  if (c.inicio > janela.ate) return { ok: false, erro: `${formatarData(c.inicio)} está a mais de 12 meses daqui: lance mais perto da data.` };
  return { ok: true, competencia: c };
}

/** Vencimento opcional: uma data válida entre 2020 e 3 anos à frente. */
export function lerVencimento(texto: string, hoje: string): { ok: true; data: string | null } | { ok: false; erro: string } {
  if (texto.trim() === '') return { ok: true, data: null };
  const d = lerDataLivre(texto);
  if (!d) return { ok: false, erro: 'Vencimento inválido: use dd/mm/aaaa (ex.: 05/11/2026).' };
  if (d < LIMITES_DA_DESPESA.dataMinima || d > somarDias(hoje, 1095)) return { ok: false, erro: 'O vencimento precisa estar entre 2020 e três anos à frente.' };
  return { ok: true, data: d };
}

export function lerDescricao(texto: unknown): { ok: true; descricao: string } | { ok: false; erro: string } {
  const d = limparTexto(texto);
  if (d.length === 0) return { ok: false, erro: 'Descreva a despesa (ex.: Aluguel da loja).' };
  if (d.length > LIMITES_DA_DESPESA.descricao) return { ok: false, erro: `A descrição tem no máximo ${LIMITES_DA_DESPESA.descricao} letras.` };
  return { ok: true, descricao: d };
}

/** Lê e confere tudo o que a pessoa digitou. Nada daqui vem de campo calculado pela tela. */
export function lerDespesa(t: TextosDaDespesa, hoje: string, opcoes: { exigeEnvio?: boolean } = {}): { ok: true; despesa: DespesaLida } | { ok: false; erros: ErrosDaDespesa } {
  const erros: ErrosDaDespesa = {};
  if ((opcoes.exigeEnvio ?? true) && !ENVIO_VALIDO.test(t.envio)) erros.geral = 'O formulário venceu. Abra “Lançar despesa” de novo; nada foi gravado.';
  const valor = lerValorDaDespesa(t.valor);
  if (!valor.ok) erros.valor = valor.erro;
  const descricao = lerDescricao(t.descricao);
  if (!descricao.ok) erros.descricao = descricao.erro;
  if (typeof t.linha !== 'string' || t.linha.length === 0 || t.linha.length > 80) erros.linha = 'Escolha a linha do DRE.';
  const comp = lerCompetencia(t, hoje);
  if (!comp.ok) erros.competencia = comp.erro;
  const venc = lerVencimento(t.vencimento, hoje);
  if (!venc.ok) erros.vencimento = venc.erro;
  if (comp.ok && t.recorrente && !ehMesInteiro(comp.competencia)) erros.recorrente = '“Repete todo mês” só vale para o mês inteiro. Escolha “Um mês” ou desmarque.';
  if (Object.keys(erros).length > 0 || !valor.ok || !descricao.ok || !comp.ok || !venc.ok) return { ok: false, erros };
  return {
    ok: true,
    despesa: {
      envio: t.envio,
      lojaId: t.lojaId.trim() === '' ? null : t.lojaId.trim(),
      linha: t.linha,
      descricao: descricao.descricao,
      valorCentavos: valor.centavos,
      competencia: comp.competencia,
      recorrente: t.recorrente,
      vencimento: venc.data,
    },
  };
}

/** A chave de idempotência do formulário (`manual:<envio>`); a repetição ("do mês passado") leva o id da origem. */
export const chaveDoEnvio = (envio: string, origemId?: string) => (origemId ? `manual:${envio}:${origemId}` : `manual:${envio}`);

// ------------------------------------------------------------------ contas a pagar

export type SituacaoDoPagamento = 'paga' | 'vencida' | 'vence-logo' | 'a-vencer' | 'sem-vencimento';

/** Vence em até 7 dias a contar de hoje = "vence logo". Não pago e sem vencimento não é conta a pagar. */
export function situacaoDoPagamento(d: { vencimento: string | null; pagaEm: string | null }, hoje: string): SituacaoDoPagamento {
  if (d.pagaEm) return 'paga';
  if (!d.vencimento) return 'sem-vencimento';
  if (d.vencimento < hoje) return 'vencida';
  return d.vencimento <= somarDias(hoje, 7) ? 'vence-logo' : 'a-vencer';
}

export const ROTULO_DO_PAGAMENTO: Record<SituacaoDoPagamento, string> = {
  paga: 'Paga',
  vencida: 'Vencida',
  'vence-logo': 'Vence em até 7 dias',
  'a-vencer': 'A vencer',
  'sem-vencimento': 'Sem vencimento',
};

/** "vence 05/11" / "venceu há 3 dias" / "paga em 04/11". */
export function frasePagamento(d: { vencimento: string | null; pagaEm: string | null }, hoje: string): string {
  const s = situacaoDoPagamento(d, hoje);
  if (s === 'paga') return `paga em ${formatarData(d.pagaEm!)}`;
  if (s === 'sem-vencimento') return 'sem vencimento';
  const dias = diasEntre(hoje, d.vencimento!);
  if (s === 'vencida') return dias === -1 ? 'venceu ontem' : `venceu há ${-dias} dias`;
  return dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence ${formatarData(d.vencimento!, true)}`;
}

/** Lê a data do pagamento (padrão: hoje); não pode ser futura. */
export function lerDataDoPagamento(texto: string, hoje: string): { ok: true; data: string } | { ok: false; erro: string } {
  if (texto.trim() === '') return { ok: true, data: hoje };
  const d = lerDataLivre(texto);
  if (!d) return { ok: false, erro: 'Data do pagamento inválida: use dd/mm/aaaa.' };
  if (d > hoje) return { ok: false, erro: 'O pagamento não pode ser em data futura.' };
  if (d < LIMITES_DA_DESPESA.dataMinima) return { ok: false, erro: 'O ERP não tem pagamento antes de 2020.' };
  return { ok: true, data: d };
}

// ------------------------------------------------------------------ histórico

export interface DespesaParaOHistorico {
  linhaNome: string;
  lojaNome: string | null;
  descricao: string;
  valorCentavos: number;
  competencia: Competencia;
  recorrente: boolean;
  vencimento: string | null;
  pagaEm: string | null;
}

/** O retrato para o antes/depois. `alvo` diz de quem é ("Aluguel · Vila da Penha · outubro de 2026"). */
export function retratoDaDespesa(d: DespesaParaOHistorico): Record<string, string | number | null> {
  return {
    alvo: `${d.linhaNome} · ${d.lojaNome ?? 'Rede'} · ${rotuloDaCompetencia(d.competencia)}`,
    linhaDoDre: d.linhaNome,
    loja: d.lojaNome ?? 'Rede (todas as lojas)',
    descricao: d.descricao,
    despesaCentavos: d.valorCentavos,
    competencia: rotuloDaCompetencia(d.competencia),
    repeteTodoMes: d.recorrente ? 'Sim' : 'Não',
    vencimento: d.vencimento ? formatarData(d.vencimento) : null,
    pagaEm: d.pagaEm ? formatarData(d.pagaEm) : null,
  };
}

// ------------------------------------------------------------------ filtros da lista

export type FiltroDeSituacao = 'todas' | 'a-pagar' | 'pagas';
export const ehFiltroDeSituacao = (s: unknown): s is FiltroDeSituacao => s === 'todas' || s === 'a-pagar' || s === 'pagas';

export const DESPESAS_POR_PAGINA = 50;

/** O mês da lista de despesas na URL ("aaaa-mm"): existe e está entre 2020 e 12 meses à frente; senão, o de hoje. */
export function lerMesDaLista(texto: string | undefined, hoje: string): string {
  const atual = hoje.slice(0, 7);
  if (!texto || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return atual;
  const limite = janelaDaCompetencia(hoje).ate.slice(0, 7);
  return texto > limite || texto < LIMITES_DA_DESPESA.dataMinima.slice(0, 7) ? atual : texto;
}
