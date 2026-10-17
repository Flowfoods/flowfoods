/**
 * Faturamento por canal (2.1) — a parte PURA (sem banco, sem Next): ler o que
 * foi digitado, validar data e números, a chave do lançamento, o retrato para
 * o histórico, a leitura única do grão (integração vence a digitação), o
 * calendário do mês e as faltas. O que vale é sempre o que o servidor lê do
 * TEXTO; a tela só mostra prévia.
 *
 * O número (decisão 124, "o pedido não é a venda"): `valorCentavos` é a venda
 * de PRODUTOS de pedidos CONCLUÍDOS no dia, já líquida de desconto/cupom pago
 * pela casa; sem taxa de entrega cobrada do cliente, sem 10 %/gorjeta, sem
 * pedido cancelado. `pedidos` = pedidos concluídos. `clientes` = atendimentos
 * (salão: pessoas; delivery e iFood: vazio = pedidos), não clientes únicos.
 * Ticket médio = Σ valor ÷ Σ pedidos do recorte: derivado, nunca gravado.
 *
 * O grão (decisão 123): loja × canal × dia civil do Rio. O humano (digitado ou
 * planilha) divide UMA linha por grão, com a chave `manual:<loja>:-:<canal>:<dia>`.
 */

import { CANAIS, ORDEM_DOS_CANAIS, type CanalVenda } from './canal-campos';
import { formatarData, hojeNoRio, lerData } from './compra-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { dividirArredondado, formatarDinheiro, lerDinheiro, lerInteiro, temFormaDeDinheiro } from './unidades';

export type { CanalVenda };

export const LIMITES_DO_FATURAMENTO = {
  /** R$ 1 milhão por canal e dia (CHECK no banco). */
  valorCentavos: 100_000_000,
  /** Pedidos e clientes por canal e dia (CHECK no banco). */
  quantidade: 100_000,
  /** Lançamento mais antigo que isto é dedo errado: 3 anos, com folga para o ano passado. */
  janelaEmDias: 1095,
  /** O ERP não tem venda antes disto (CHECK no banco). */
  dataMinima: '2020-01-01',
} as const;

export const CANAIS_EM_ORDEM = ORDEM_DOS_CANAIS;
export const rotuloDoCanal = (c: CanalVenda) => CANAIS[c].rotulo;
export const ehCanal = (c: unknown): c is CanalVenda => typeof c === 'string' && (ORDEM_DOS_CANAIS as readonly string[]).includes(c);

// ------------------------------------------------------------------ data

/** Data do lançamento (texto vira "aaaa-mm-dd"): válida, não futura (no Rio) e dentro da janela. */
export function lerDataDoLancamento(texto: string, hoje = hojeNoRio()): { ok: true; data: string } | { ok: false; erro: string } {
  const d = lerData(texto);
  if (!d) return { ok: false, erro: 'Data inválida: use dd/mm/aaaa (ex.: 14/10/2026).' };
  if (d > hoje) return { ok: false, erro: `${formatarData(d)} ainda não chegou: só dá para lançar até hoje.` };
  if (d < LIMITES_DO_FATURAMENTO.dataMinima || diasEntre(d, hoje) > LIMITES_DO_FATURAMENTO.janelaEmDias) {
    return { ok: false, erro: `${formatarData(d)} é de mais de 3 anos atrás: o ERP não aceita lançamento tão antigo.` };
  }
  return { ok: true, data: d };
}

// ------------------------------------------------------------------ chaves

/** A chave do humano (digitado ou planilha): uma por loja × canal × dia, sem marca (decisão 123/125). */
export const chaveHumana = (lojaId: string, canal: CanalVenda, data: string) => `manual:${lojaId}:-:${canal}:${data}`;

/**
 * O contrato da integração (decisão 129): `<fonte>:<tipo>:<idExterno>`, outro
 * espaço de chave que o humano ("manual:" é só dele; o banco confere). `tipo`
 * é 'pedido' (um por pedido) ou 'dia' (o fechamento do dia do canal). Null se
 * a fonte, o tipo ou o id não servem. Reenviar o mesmo pedido gera a MESMA
 * chave: a integração futura faz upsert, nunca soma.
 */
export function chaveDeIntegracao(fonte: string, tipo: string, idExterno: string): string | null {
  if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(fonte) || fonte === 'manual') return null;
  if (tipo !== 'pedido' && tipo !== 'dia') return null;
  if (!/^[\x21-\x7e]{1,120}$/.test(idExterno)) return null;
  const chave = `${fonte}:${tipo}:${idExterno}`;
  return chave.length <= 200 ? chave : null;
}

// ------------------------------------------------------------------ números

export interface TextosDoCanal {
  valor: string;
  pedidos: string;
  clientes: string;
  naoVendeu: boolean;
}

export interface NumerosDoCanal {
  valorCentavos: number;
  pedidos: number;
  clientes: number;
}

export type ErrosDoCanal = Partial<Record<'valor' | 'pedidos' | 'clientes' | 'geral', string>>;

export type LeituraDoCanal = { estado: 'vazio' } | { estado: 'ok'; numeros: NumerosDoCanal } | { estado: 'erro'; erros: ErrosDoCanal };

/** Célula que uma planilha abriria como fórmula (= + - @ tab, CR), com ou sem espaço antes. */
export function comecaComoFormula(t: string): boolean {
  return /^[=+\-@\t\r]/.test(t) || /^\s+[=+\-@]/.test(t);
}

const REAIS_DO_TETO = formatarDinheiro(LIMITES_DO_FATURAMENTO.valorCentavos);

function lerQuantidadeDigitada(bruto: string, rotulo: string): { ok: true; n: number } | { ok: false; erro: string } {
  const t = bruto.trim();
  if (/^-\s*\d/.test(t)) return { ok: false, erro: `${rotulo} não pode ser negativo.` };
  if (comecaComoFormula(bruto)) return { ok: false, erro: `${rotulo}: número, sem fórmula nem sinal.` };
  const n = lerInteiro(t);
  if (n === null) return { ok: false, erro: `${rotulo} é número inteiro, sem vírgula nem ponto de casa decimal (ex.: 62).` };
  if (n > LIMITES_DO_FATURAMENTO.quantidade) return { ok: false, erro: `${rotulo} acima de ${LIMITES_DO_FATURAMENTO.quantidade.toLocaleString('pt-BR')} num canal e dia: confira.` };
  return { ok: true, n };
}

/**
 * Lê os 3 campos de UM canal num dia. Em branco e sem "Não vendeu" = não mexe
 * (vazio ≠ zero, decisão 126: o canal segue "sem lançamento"). "Não vendeu"
 * grava 0/0/0. Clientes em branco = pedidos. Valor com pedidos, e pedidos com
 * valor, andam juntos (o ticket médio divide por pedidos).
 */
export function lerCanalDoDia(t: TextosDoCanal): LeituraDoCanal {
  const valorTxt = t.valor.trim();
  const pedidosTxt = t.pedidos.trim();
  const clientesTxt = t.clientes.trim();
  const algo = valorTxt !== '' || pedidosTxt !== '' || clientesTxt !== '';
  if (t.naoVendeu) {
    const zero = (x: string, ler: (s: string) => number | null) => x === '' || ler(x) === 0;
    if (!zero(valorTxt, lerDinheiro) || !zero(pedidosTxt, lerInteiro) || !zero(clientesTxt, lerInteiro)) {
      return { estado: 'erro', erros: { geral: 'Marcou “Não vendeu” mas há número preenchido: desmarque, ou apague os números.' } };
    }
    return { estado: 'ok', numeros: { valorCentavos: 0, pedidos: 0, clientes: 0 } };
  }
  if (!algo) return { estado: 'vazio' };

  const erros: ErrosDoCanal = {};
  let valor = 0;
  if (valorTxt === '') erros.valor = 'Informe o faturamento (R$), ou marque “Não vendeu”.';
  else if (/^-\s*\d/.test(valorTxt)) erros.valor = 'Faturamento não pode ser negativo.';
  else if (comecaComoFormula(t.valor)) erros.valor = 'Faturamento: só número (ex.: 4.350,00), sem fórmula nem sinal.';
  else {
    const v = lerDinheiro(valorTxt);
    if (v === null) erros.valor = temFormaDeDinheiro(valorTxt) ? `Valor grande demais: o teto por canal e dia é ${REAIS_DO_TETO}.` : 'Faturamento inválido: use o formato 4.350,00.';
    else if (v > LIMITES_DO_FATURAMENTO.valorCentavos) erros.valor = `Acima do teto de ${REAIS_DO_TETO} por canal e dia: confira o valor.`;
    else valor = v;
  }
  let pedidos = 0;
  if (pedidosTxt === '') erros.pedidos = 'Informe os pedidos, ou marque “Não vendeu”.';
  else {
    const p = lerQuantidadeDigitada(t.pedidos, 'Pedidos');
    if (p.ok) pedidos = p.n;
    else erros.pedidos = p.erro;
  }
  let clientes = pedidos;
  if (clientesTxt !== '') {
    const c = lerQuantidadeDigitada(t.clientes, 'Clientes');
    if (c.ok) clientes = c.n;
    else erros.clientes = c.erro;
  }
  if (Object.keys(erros).length > 0) return { estado: 'erro', erros };
  if (valor > 0 && pedidos === 0) erros.pedidos = 'Tem faturamento, então tem pelo menos 1 pedido.';
  else if (valor === 0 && pedidos > 0) erros.valor = 'Pedidos sem faturamento: confira o valor, ou marque “Não vendeu”.';
  if (pedidos === 0 && clientes > 0) erros.clientes = 'Sem pedidos não há clientes atendidos.';
  if (Object.keys(erros).length > 0) return { estado: 'erro', erros };
  return { estado: 'ok', numeros: { valorCentavos: valor, pedidos, clientes } };
}

/** Ticket médio do recorte, em centavos (Σ valor ÷ Σ pedidos); sem pedido, null (a tela diz "—"). */
export function ticketMedio(valorCentavos: number, pedidos: number): number | null {
  return pedidos > 0 ? dividirArredondado(valorCentavos, pedidos) : null;
}

export const frasePedidos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'pedido' : 'pedidos'}`;

/** "R$ 3.210,00 · 41 pedidos" (a frase do conflito, da prévia e do histórico). */
export function fraseDoNumero(n: NumerosDoCanal): string {
  return `${formatarDinheiro(n.valorCentavos)} · ${frasePedidos(n.pedidos)}`;
}

export const mesmosNumeros = (a: NumerosDoCanal, b: NumerosDoCanal) =>
  a.valorCentavos === b.valorCentavos && a.pedidos === b.pedidos && a.clientes === b.clientes;

// ------------------------------------------------------------------ histórico

export type OrigemDoLancamento = 'MANUAL' | 'IMPORTACAO' | 'INTEGRACAO';

export const ROTULO_DA_ORIGEM: Record<OrigemDoLancamento, string> = {
  MANUAL: 'Digitado',
  IMPORTACAO: 'Planilha',
  INTEGRACAO: 'Integração',
};

/**
 * Retrato do lançamento para o histórico (antes/depois). `alvo` só diz de quem
 * é a linha ("Vila da Penha · iFood · 14/10/2026"); `faturamentoCentavos`
 * acaba em "Centavos" e a tela do histórico o escreve em reais.
 */
export function retratoDoLancamento(l: { lojaId: string; lojaNome: string; canal: CanalVenda; data: string; origem: OrigemDoLancamento } & NumerosDoCanal): Record<string, string | number | null> {
  return {
    alvo: `${l.lojaNome} · ${CANAIS[l.canal].curto} · ${formatarData(l.data)}`,
    // Para achar as alterações de um dia na tela dele (sobrevive a loja renomeada e a lançamento removido); não aparecem na lista.
    faturamentoLojaId: l.lojaId,
    faturamentoDia: l.data,
    faturamentoCentavos: l.valorCentavos,
    pedidos: l.pedidos,
    clientes: l.clientes,
    origem: ROTULO_DA_ORIGEM[l.origem],
  };
}

// ------------------------------------------------------------------ leitura única do grão

export interface LinhaDoGrao extends NumerosDoCanal {
  origem: OrigemDoLancamento;
}

export interface GraoLido extends NumerosDoCanal {
  /** De onde vale o número: a integração, quando existe; senão o que a casa digitou. */
  fonte: 'INTEGRACAO' | 'HUMANO';
  /** O que a casa digitou, quando a integração vale por cima: fica à vista como conferência. */
  conferencia: (NumerosDoCanal & { diferencaCentavos: number }) | null;
}

/**
 * A leitura única do grão (decisão 125): havendo linha de INTEGRACAO, vale a
 * SOMA dela (um pedido por linha); senão, a humana. Nunca soma humano com
 * integração. A humana que fica por baixo é a conferência (diferença à vista).
 * A 2.2 (DRE) só lê o faturamento por aqui.
 */
export function lerGrao(linhas: readonly LinhaDoGrao[]): GraoLido | null {
  if (linhas.length === 0) return null;
  const soma = (ls: readonly LinhaDoGrao[]): NumerosDoCanal =>
    ls.reduce((s, l) => ({ valorCentavos: s.valorCentavos + l.valorCentavos, pedidos: s.pedidos + l.pedidos, clientes: s.clientes + l.clientes }), { valorCentavos: 0, pedidos: 0, clientes: 0 });
  const integradas = linhas.filter((l) => l.origem === 'INTEGRACAO');
  const humanas = linhas.filter((l) => l.origem !== 'INTEGRACAO');
  if (integradas.length > 0) {
    const n = soma(integradas);
    const h = humanas.length > 0 ? soma(humanas) : null;
    return { ...n, fonte: 'INTEGRACAO', conferencia: h ? { ...h, diferencaCentavos: n.valorCentavos - h.valorCentavos } : null };
  }
  return { ...soma(humanas), fonte: 'HUMANO', conferencia: null };
}

// ------------------------------------------------------------------ mês e calendário

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "2026-10" → "outubro de 2026". */
export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** O mês pedido na URL ("aaaa-mm"), só se existir e estiver entre 2020 e o mês de hoje; senão o de hoje. */
export function lerMes(texto: string | undefined, hoje = hojeNoRio()): string {
  const atual = hoje.slice(0, 7);
  if (!texto || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return atual;
  return texto > atual || texto < LIMITES_DO_FATURAMENTO.dataMinima.slice(0, 7) ? atual : texto;
}

export function mesVizinho(mes: string, passo: -1 | 1): string {
  const [a, m] = mes.split('-').map(Number);
  const n = m - 1 + passo;
  return `${a + Math.floor(n / 12)}-${String(((n % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}

export function diasDoMes(mes: string): string[] {
  const proximo = `${mesVizinho(mes, 1)}-01`;
  const dias: string[] = [];
  for (let d = `${mes}-01`; d < proximo; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** Dia da semana de "aaaa-mm-dd": 0 = domingo. */
export const diaDaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const nomeDoDiaDaSemana = (iso: string) => SEMANA[diaDaSemana(iso)];

/**
 * Falta (decisão 126): canal que a loja vende, sem lançamento, de quando a loja
 * começou a lançar (a data do 1º lançamento dela) até ONTEM. Hoje é "em
 * aberto"; antes do 1º lançamento a casa ainda não usava o módulo. Zero
 * lançado ("Não vendeu") é lançamento, não falta.
 */
export function canaisEmFalta(dia: string, hoje: string, primeiraData: string | null, canaisDaLoja: readonly CanalVenda[], lancados: ReadonlySet<CanalVenda>): CanalVenda[] {
  if (!primeiraData || dia < primeiraData || dia >= hoje) return [];
  return ORDEM_DOS_CANAIS.filter((c) => canaisDaLoja.includes(c) && !lancados.has(c));
}

export interface TotaisDoRecorte extends NumerosDoCanal {
  /** Centavos, ou null sem pedido (a tela diz "—"). Derivado: nunca gravado. */
  ticketMedioCentavos: number | null;
}

export function totalizar(itens: readonly NumerosDoCanal[]): TotaisDoRecorte {
  const t = itens.reduce((s, l) => ({ valorCentavos: s.valorCentavos + l.valorCentavos, pedidos: s.pedidos + l.pedidos, clientes: s.clientes + l.clientes }), { valorCentavos: 0, pedidos: 0, clientes: 0 });
  return { ...t, ticketMedioCentavos: ticketMedio(t.valorCentavos, t.pedidos) };
}

/** "R$ 41,90" ou "—". */
export const textoDoTicket = (c: number | null) => (c === null ? '—' : formatarDinheiro(c));
