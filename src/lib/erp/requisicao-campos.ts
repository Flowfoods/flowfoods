/**
 * Requisição (1.8) — regras PURAS, sem banco e sem Next: ler o pedido e a
 * entrega, o estado depois de entregar, a baixa no livro (`REQUISICAO` −),
 * a devolução por estorno, a lista puxada da ficha técnica, o atraso no
 * quadro e o CRUZAMENTO requisição × contagem (consumo apurado × requisitado
 * = o que sumiu sem requisição). As telas e `requisicao.ts` usam as mesmas
 * funções.
 *
 * Princípios:
 * - a baixa acontece quando o estoque ENTREGA (atender), item a item, com o
 *   valor pelo custo de referência de agora (um arredondamento; sem preço =
 *   0 no livro e "pendente" na tela);
 * - saldo insuficiente não para a cozinha: a entrega passa com a confirmação
 *   de quem entregou e o saldo negativo é o alarme (Notion "Da Ficha ao
 *   Fornecedor": "estoque negativo permitido de propósito");
 * - devolução é ESTORNO (espelho exato) + a baixa nova do que ficou: o livro
 *   nunca muda uma linha, e Σ REQUISICAO é o consumo requisitado líquido;
 * - o cruzamento é leitura: nada é gravado; divergência não é perda
 *   comprovada, é o que a contagem acusou sem requisição que explique.
 */

import { diasEntre, somarDias } from './contagem-campos';
import { valorDaQuantidade, TETO_DA_CONTAGEM, type MovimentoNovo, type TipoDeMovimento } from './estoque-campos';
import { ehSetor, SETORES, type Setor } from './permissoes';
import { formatarQuantidade, lerQuantidadeNa, UNIDADES, type Escala, type Fracao, type Unidade } from './unidades';

// ================================================================ estado

export type StatusDaRequisicao = 'ABERTA' | 'PARCIAL' | 'ATENDIDA' | 'CANCELADA';

export const ORDEM_DO_QUADRO: StatusDaRequisicao[] = ['ABERTA', 'PARCIAL', 'ATENDIDA', 'CANCELADA'];

export const ROTULO_DA_REQUISICAO: Record<StatusDaRequisicao, string> = {
  ABERTA: 'Pedida',
  PARCIAL: 'Atendida em parte',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
};

/** Coluna do quadro (plural). */
export const COLUNA_DO_QUADRO: Record<StatusDaRequisicao, string> = {
  ABERTA: 'Pedidas',
  PARCIAL: 'Atendidas em parte',
  ATENDIDA: 'Atendidas',
  CANCELADA: 'Canceladas',
};

export const pendente = (s: StatusDaRequisicao) => s === 'ABERTA' || s === 'PARCIAL';

/** "#12". */
export const numeroDaRequisicao = (n: number | null) => (n ? `#${n}` : '#—');

export const rotuloDoSetor = (s: string | null) => (s && ehSetor(s) ? SETORES[s] : 'Sem setor');

/**
 * Dias de atraso: pendente (pedida ou atendida em parte) e o dia "para
 * quando" já passou (datas do Rio). Atendida ou cancelada não atrasa.
 */
export function diasDeAtraso(r: { status: StatusDaRequisicao; paraDia: string | null }, hoje: string): number {
  if (!pendente(r.status) || !r.paraDia || r.paraDia >= hoje) return 0;
  return diasEntre(r.paraDia, hoje);
}

/** "2d de atraso". */
export const textoDoAtraso = (dias: number) => `${dias}d de atraso`;

/** "para hoje", "para amanhã", "para 18/10". */
export function textoDoParaDia(paraDia: string | null, hoje: string): string {
  if (!paraDia) return 'sem dia';
  if (paraDia === hoje) return 'para hoje';
  if (paraDia === somarDias(hoje, 1)) return 'para amanhã';
  if (paraDia === somarDias(hoje, -1)) return 'para ontem';
  const [, m, d] = paraDia.split('-');
  return `para ${d}/${m}`;
}

// ================================================================ pedir

/** Até quantos itens numa requisição (uma ida ao estoque). */
export const TETO_DE_ITENS = 60;
/** Até quantos dias à frente se pede. */
export const DIAS_A_FRENTE = 14;

export interface LinhaDigitada {
  insumoId: string;
  quantidade: string;
  escala: string;
}

export interface InsumoParaPedir {
  id: string;
  nome: string;
  unidade: Unidade;
  ativo: boolean;
}

export interface ItemPedido {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  solicitadoMilesimos: number;
}

export type CampoDoPedido = 'setor' | 'paraDia' | 'observacao' | 'itens' | 'geral';

export interface PedidoLido {
  setor: Setor;
  paraDia: string;
  observacao: string | null;
  itens: ItemPedido[];
}

const escalaDe = (e: string, u: Unidade): Escala => (e === 'menor' && u !== 'UN' ? 'menor' : 'base');

/**
 * Lê o pedido (textos do formulário). Setor da lista da 0.4; para quando =
 * hoje até 14 dias à frente ("hoje", "amanha" ou AAAA-MM-DD); itens com
 * quantidade > 0 na unidade do insumo (kg/g, L/ml, un), sem repetir, até 60;
 * linha sem insumo e sem número é ignorada (a tela deixa linhas vazias).
 * Erros por campo e por linha (`item:<n>`), em frase.
 */
export function lerPedido(
  f: { setor: unknown; paraDia: unknown; observacao: unknown; linhas: readonly LinhaDigitada[] },
  cadastro: ReadonlyMap<string, InsumoParaPedir>,
  hoje: string,
): { ok: true; pedido: PedidoLido } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const setor = typeof f.setor === 'string' && ehSetor(f.setor) ? f.setor : null;
  if (!setor) erros.setor = 'Escolha o setor que vai usar (cozinha, salão…).';
  const pd = typeof f.paraDia === 'string' ? f.paraDia.trim() : '';
  const paraDia = pd === '' || pd === 'hoje' ? hoje : pd === 'amanha' ? somarDias(hoje, 1) : /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
  if (!paraDia || Number.isNaN(new Date(`${paraDia}T00:00:00Z`).getTime()) || new Date(`${paraDia}T00:00:00Z`).toISOString().slice(0, 10) !== paraDia) erros.paraDia = 'Data inválida: use hoje, amanhã ou dd/mm.';
  else if (paraDia < hoje) erros.paraDia = 'Para quando: de hoje em diante.';
  else if (paraDia > somarDias(hoje, DIAS_A_FRENTE)) erros.paraDia = `Para quando: até ${DIAS_A_FRENTE} dias à frente.`;
  const obs = typeof f.observacao === 'string' ? f.observacao.trim().replace(/\s+/g, ' ') : '';
  if (obs.length > 280) erros.observacao = 'Observação: até 280 letras.';
  const itens: ItemPedido[] = [];
  const vistos = new Set<string>();
  f.linhas.forEach((l, n) => {
    const id = (l.insumoId ?? '').trim();
    const q = (l.quantidade ?? '').trim();
    if (!id && !q) return;
    const chave = `item:${n}`;
    const ins = cadastro.get(id);
    if (!ins) return void (erros[chave] = 'Escolha o insumo.');
    if (!ins.ativo) return void (erros[chave] = `“${ins.nome}” está desativado.`);
    if (vistos.has(id)) return void (erros[chave] = `“${ins.nome}” já está na lista: junte numa linha só.`);
    const escala = escalaDe(l.escala, ins.unidade);
    const m = q ? lerQuantidadeNa(q, ins.unidade, escala) : null;
    if (m === null || m <= 0) {
      const u = UNIDADES[ins.unidade];
      return void (erros[chave] = escala === 'menor' ? `Quanto de “${ins.nome}”: número inteiro em ${u.menor} (ex.: 500).` : `Quanto de “${ins.nome}”: número como 2 ou 1,5 (${u.sigla}).`);
    }
    if (m > TETO_DA_CONTAGEM) return void (erros[chave] = `“${ins.nome}”: passa de ${formatarQuantidade(TETO_DA_CONTAGEM, ins.unidade)}, confira o número.`);
    vistos.add(id);
    itens.push({ insumoId: id, nome: ins.nome, unidade: ins.unidade, solicitadoMilesimos: m });
  });
  if (itens.length === 0 && !Object.keys(erros).some((k) => k.startsWith('item:'))) erros.itens = 'Peça pelo menos um insumo.';
  if (itens.length > TETO_DE_ITENS) erros.itens = `Até ${TETO_DE_ITENS} insumos por requisição: divida em duas.`;
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, pedido: { setor: setor!, paraDia: paraDia!, observacao: obs || null, itens } };
}

// ================================================================ pedir pela ficha técnica

export interface ItemDaFicha {
  /** O insumo que sai do estoque: o comprado, ou o que o pré-preparo produz (vem pronto). */
  insumoId: string | null;
  quantidadeMilesimos: number;
  fatorCorrecaoMilesimos: number;
}

/**
 * Quanto de cada insumo a ficha pede para produzir `quantidadeMilesimos` (na
 * unidade de rendimento: porções em milésimos, kg/L/un): líquida × fator ×
 * quantidade ÷ rendimento — a quantidade BRUTA, que é o que sai do estoque.
 * Fração BigInt e um arredondamento (metade para cima) no fim; o mesmo
 * insumo em duas linhas soma. Pré-preparo entra pelo insumo que produz, sem
 * cascata (fazer o pré-preparo é a produção, 3.1). Linha sem insumo (pré-preparo
 * sem insumo produzido) volta em `semInsumo`.
 */
export function quantidadesDaFicha(
  ficha: { rendimentoMilesimos: number },
  itens: readonly ItemDaFicha[],
  quantidadeMilesimos: number,
): { itens: { insumoId: string; quantidadeMilesimos: number }[]; semInsumo: number } {
  const soma = new Map<string, bigint>();
  let semInsumo = 0;
  const den = 1000n * BigInt(ficha.rendimentoMilesimos);
  for (const i of itens) {
    if (!i.insumoId) {
      semInsumo++;
      continue;
    }
    const num = BigInt(i.quantidadeMilesimos) * BigInt(i.fatorCorrecaoMilesimos) * BigInt(quantidadeMilesimos);
    soma.set(i.insumoId, (soma.get(i.insumoId) ?? 0n) + num);
  }
  const out: { insumoId: string; quantidadeMilesimos: number }[] = [];
  for (const [insumoId, num] of Array.from(soma)) {
    const q = (2n * num + den) / (2n * den);
    if (q > 0n) out.push({ insumoId, quantidadeMilesimos: Number(q > BigInt(TETO_DA_CONTAGEM) ? BigInt(TETO_DA_CONTAGEM) + 1n : q) });
  }
  return { itens: out, semInsumo };
}

/** Milésimos → texto do campo na unidade base ("2", "1,25"). */
export function textoDoCampo(milesimos: number): string {
  const inteiro = Math.trunc(milesimos / 1000);
  const resto = milesimos % 1000;
  return `${inteiro}${resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : ''}`;
}

// ================================================================ atender (entregar)

export interface ItemParaEntregar {
  id: string;
  insumoId: string;
  nome: string;
  unidade: Unidade;
  solicitadoMilesimos: number;
  /** Líquido que já saiu (entregas − devoluções). */
  atendidoMilesimos: number;
}

export interface Entrega {
  itemId: string;
  quantidadeMilesimos: number;
}

/** O que falta sair de um item (nunca negativo). */
export const faltaDe = (i: Pick<ItemParaEntregar, 'solicitadoMilesimos' | 'atendidoMilesimos'>) => Math.max(0, i.solicitadoMilesimos - i.atendidoMilesimos);

/**
 * Lê a entrega: quanto sai AGORA de cada item (vazio = nada). Passar um pouco
 * do pedido é normal (a peça de queijo pesa 2,1 kg), até o dobro do que
 * falta (acima disso é dedo errado). Sem nada e sem "encerrar o resto" =
 * erro: atender é entregar algo ou encerrar.
 */
export function lerEntrega(
  linhas: readonly { itemId: string; quantidade: string; escala: string }[],
  itens: readonly ItemParaEntregar[],
  encerrar: boolean,
): { ok: true; entregas: Entrega[] } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const entregas: Entrega[] = [];
  const porId = new Map(itens.map((i) => [i.id, i]));
  for (const l of linhas) {
    const i = porId.get(l.itemId);
    if (!i) continue;
    const q = (l.quantidade ?? '').trim();
    if (!q) continue;
    const m = lerQuantidadeNa(q, i.unidade, escalaDe(l.escala, i.unidade));
    if (m === null) {
      erros[`item:${i.id}`] = `“${i.nome}”: número como 2 ou 1,5 (${UNIDADES[i.unidade].sigla}), ou inteiro em ${UNIDADES[i.unidade].menor}.`;
      continue;
    }
    if (m === 0) continue;
    const teto = Math.max(faltaDe(i), i.solicitadoMilesimos) * 2;
    if (m > teto) {
      erros[`item:${i.id}`] = `“${i.nome}”: ${formatarQuantidade(m, i.unidade)} passa do dobro do pedido (${formatarQuantidade(i.solicitadoMilesimos, i.unidade)}). Confira o número.`;
      continue;
    }
    entregas.push({ itemId: i.id, quantidadeMilesimos: m });
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  if (entregas.length === 0 && !encerrar) return { ok: false, erros: { geral: 'Diga quanto sai de pelo menos um insumo, ou marque “encerrar o resto”.' } };
  return { ok: true, entregas };
}

/**
 * Estado depois da entrega: tudo o que foi pedido saiu (ou o resto foi
 * encerrado) = ATENDIDA; saiu algo = PARCIAL; nada saiu e nada encerrado =
 * continua pedida.
 */
export function estadoDepoisDaEntrega(itens: readonly ItemParaEntregar[], entregas: readonly Entrega[], encerrar: boolean): StatusDaRequisicao {
  const mais = new Map(entregas.map((e) => [e.itemId, e.quantidadeMilesimos]));
  const depois = itens.map((i) => ({ ...i, atendidoMilesimos: i.atendidoMilesimos + (mais.get(i.id) ?? 0) }));
  if (encerrar || depois.every((i) => faltaDe(i) === 0)) return 'ATENDIDA';
  return depois.some((i) => i.atendidoMilesimos > 0) ? 'PARCIAL' : 'ABERTA';
}

/**
 * A baixa no livro: um `REQUISICAO` (−) por item entregue, valor pelo custo
 * de referência de agora (negativo; sem preço = 0 e pendente), chave única por
 * item e versão da requisição (a mesma entrega não baixa duas vezes).
 */
export function baixasDaEntrega(
  req: { id: string; lojaId: string; numero: number | null; setor: string | null; versao: number },
  itens: readonly ItemParaEntregar[],
  entregas: readonly Entrega[],
  custos: ReadonlyMap<string, Fracao | null>,
): MovimentoNovo[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  return entregas.map((e) => {
    const i = porId.get(e.itemId)!;
    return {
      lojaId: req.lojaId,
      insumoId: i.insumoId,
      tipo: 'REQUISICAO' as const,
      quantidadeMilesimos: -e.quantidadeMilesimos,
      valorCentavos: valorDaQuantidade(custos.get(i.insumoId) ?? null, -e.quantidadeMilesimos) ?? 0,
      insumoNome: i.nome,
      unidade: i.unidade,
      motivo: `Requisição ${numeroDaRequisicao(req.numero)} · ${rotuloDoSetor(req.setor)}`,
      chave: `requisicao:${i.id}:${req.versao}`,
      requisicaoItemId: i.id,
    };
  });
}

export interface Negativo {
  itemId: string;
  nome: string;
  unidade: Unidade;
  saldoMilesimos: number;
  ficaMilesimos: number;
}

/** Quem fica abaixo de zero com esta entrega (saldo do livro de agora − o que sai). */
export function negativosDaEntrega(itens: readonly ItemParaEntregar[], entregas: readonly Entrega[], saldoDe: ReadonlyMap<string, number>): Negativo[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const out: Negativo[] = [];
  for (const e of entregas) {
    const i = porId.get(e.itemId)!;
    const saldo = saldoDe.get(i.insumoId) ?? 0;
    const fica = saldo - e.quantidadeMilesimos;
    if (fica < 0) out.push({ itemId: i.id, nome: i.nome, unidade: i.unidade, saldoMilesimos: saldo, ficaMilesimos: fica });
  }
  return out;
}

/** "−800 g". */
export const quantidadeNegativa = (m: number, u: Unidade) => (m < 0 ? `−${formatarQuantidade(-m, u)}` : formatarQuantidade(m, u));

/** A frase do saldo negativo: "Bacon: o livro diz 1 kg; saindo 2 kg, fica −1 kg". */
export function fraseDoNegativo(n: Negativo): string {
  return `${n.nome}: o livro diz ${quantidadeNegativa(n.saldoMilesimos, n.unidade)}; com esta saída fica ${quantidadeNegativa(n.ficaMilesimos, n.unidade)}`;
}

// ================================================================ devolver (estorno)

export interface MovimentoAtivo {
  id: string;
  lojaId: string;
  insumoId: string;
  quantidadeMilesimos: number;
  valorCentavos: number;
  insumoNomeSnapshot: string;
  unidadeSnapshot: Unidade;
  requisicaoItemId: string;
  motivo: string | null;
}

/**
 * Devolução de `q` de um item: estorna TODAS as baixas ativas dele (espelho
 * exato, o banco confere) e lança uma baixa nova com o líquido que ficou
 * (valor proporcional ao das baixas da época, um arredondamento). O livro
 * nunca muda uma linha; Σ REQUISICAO do item = −(líquido).
 */
export function movimentosDaDevolucao(
  ativos: readonly MovimentoAtivo[],
  q: number,
  rotulo: { motivo: string; chave: string },
): { ok: true; movimentos: MovimentoNovo[]; liquidoMilesimos: number } | { ok: false; erro: string } {
  const saiu = ativos.reduce((s, m) => s - m.quantidadeMilesimos, 0);
  const valor = ativos.reduce((s, m) => s - m.valorCentavos, 0);
  if (ativos.length === 0 || saiu <= 0) return { ok: false, erro: 'Nada saiu deste item: não há o que devolver.' };
  const u = ativos[0].unidadeSnapshot;
  if (q <= 0) return { ok: false, erro: 'Diga quanto voltou.' };
  if (q > saiu) return { ok: false, erro: `Saiu ${formatarQuantidade(saiu, u)} deste item: não volta mais do que isso.` };
  const estornos: MovimentoNovo[] = ativos.map((m) => ({
    lojaId: m.lojaId,
    insumoId: m.insumoId,
    tipo: 'REQUISICAO' as const,
    quantidadeMilesimos: -m.quantidadeMilesimos,
    valorCentavos: -m.valorCentavos,
    insumoNome: m.insumoNomeSnapshot,
    unidade: m.unidadeSnapshot,
    motivo: rotulo.motivo,
    chave: `estorno:${m.id}`,
    requisicaoItemId: m.requisicaoItemId,
    estornoDeId: m.id,
  }));
  const liquido = saiu - q;
  if (liquido === 0) return { ok: true, movimentos: estornos, liquidoMilesimos: 0 };
  const novoValor = Math.floor((2 * valor * liquido + saiu) / (2 * saiu));
  const m0 = ativos[0];
  return {
    ok: true,
    liquidoMilesimos: liquido,
    movimentos: [
      ...estornos,
      {
        lojaId: m0.lojaId,
        insumoId: m0.insumoId,
        tipo: 'REQUISICAO' as const,
        quantidadeMilesimos: -liquido,
        valorCentavos: -novoValor,
        insumoNome: m0.insumoNomeSnapshot,
        unidade: u,
        motivo: m0.motivo,
        chave: rotulo.chave,
        requisicaoItemId: m0.requisicaoItemId,
      },
    ],
  };
}

// ================================================================ cruzamento requisição × contagem

/** Uma contagem APLICADA do insumo na loja: quanto havia, e quando (abertura: a conclusão; as outras: quando foi contado). */
export interface Marco {
  instante: Date;
  contadoMilesimos: number;
}

/** Movimento que não é contagem (compra, requisição, produção, perda, ajuste e os estornos deles). */
export interface Fluxo {
  tipo: TipoDeMovimento;
  quantidadeMilesimos: number;
  ocorridoEm: Date;
  /** Setor da requisição (só nas baixas de requisição). */
  setor?: string | null;
}

export interface Trecho {
  de: Date;
  ate: Date;
  inicialMilesimos: number;
  entradasMilesimos: number;
  requisitadoMilesimos: number;
  /** Perda, produção e ajuste lançados (saídas que já têm explicação). */
  outrasSaidasMilesimos: number;
  finalMilesimos: number;
  /** Consumo apurado pela contagem: inicial + entradas − final. */
  consumoMilesimos: number;
  /** Consumo − requisitado − outras saídas: > 0 sumiu sem requisição; < 0 requisitou mais do que consumiu. */
  sumicoMilesimos: number;
  requisitadoPorSetor: Map<string, number>;
}

const ENTRADAS: ReadonlySet<TipoDeMovimento> = new Set(['ENTRADA_COMPRA', 'PRODUCAO_ENTRADA']);
const OUTRAS: ReadonlySet<TipoDeMovimento> = new Set(['PERDA', 'PRODUCAO_CONSUMO', 'AJUSTE']);

/**
 * Os trechos de um insumo entre duas contagens aplicadas consecutivas. O
 * fluxo de um trecho = os movimentos com `ocorridoEm` em (de, até] (o estorno
 * entra com o sinal dele: a compra cancelada sai das entradas, a devolução
 * sai do requisitado). É a mesma conta do "esperado" da 1.7: sumiço =
 * esperado no fim − contado no fim, quando o trecho começa numa contagem
 * aplicada.
 */
export function trechosDoInsumo(marcos: readonly Marco[], fluxos: readonly Fluxo[]): Trecho[] {
  const ms = [...marcos].sort((a, b) => a.instante.getTime() - b.instante.getTime());
  const out: Trecho[] = [];
  for (let k = 1; k < ms.length; k++) {
    const a = ms[k - 1];
    const b = ms[k];
    let entradas = 0;
    let requisitado = 0;
    let outras = 0;
    const porSetor = new Map<string, number>();
    for (const f of fluxos) {
      const t = f.ocorridoEm.getTime();
      if (t <= a.instante.getTime() || t > b.instante.getTime()) continue;
      if (ENTRADAS.has(f.tipo)) entradas += f.quantidadeMilesimos;
      else if (f.tipo === 'REQUISICAO') {
        requisitado -= f.quantidadeMilesimos;
        const s = f.setor ?? '';
        porSetor.set(s, (porSetor.get(s) ?? 0) - f.quantidadeMilesimos);
      } else if (OUTRAS.has(f.tipo)) outras -= f.quantidadeMilesimos;
    }
    const consumo = a.contadoMilesimos + entradas - b.contadoMilesimos;
    out.push({
      de: a.instante,
      ate: b.instante,
      inicialMilesimos: a.contadoMilesimos,
      entradasMilesimos: entradas,
      requisitadoMilesimos: requisitado,
      outrasSaidasMilesimos: outras,
      finalMilesimos: b.contadoMilesimos,
      consumoMilesimos: consumo,
      sumicoMilesimos: consumo - requisitado - outras,
      requisitadoPorSetor: porSetor,
    });
  }
  return out;
}

export interface DivergenciaDoInsumo {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  trechos: number;
  consumoMilesimos: number;
  requisitadoMilesimos: number;
  outrasSaidasMilesimos: number;
  sumicoMilesimos: number;
  /** O sumiço pelo custo de referência de hoje (null = sem preço). Positivo = perda. */
  sumicoCentavos: number | null;
  /** Trechos com sumiço pequeno (dentro da tolerância da loja) — o que o "fecha sozinha" deixa passar. */
  pequenos: { vezes: number; milesimos: number; centavos: number | null };
  requisitadoPorSetor: Map<string, number>;
  ultimoTrecho: { de: Date; ate: Date } | null;
}

/** Repetiu dentro da tolerância a partir de quantas vezes no período. */
export const PEQUENO_REPETIDO = 2;

/**
 * Junta os trechos de cada insumo que TERMINAM na janela [de, até): consumo,
 * requisitado, sumiço em quantidade e em R$ (custo de referência de hoje) e
 * os sumiços pequenos (dentro da tolerância em R$ por trecho, a mesma régua
 * do "fecha sozinha"). Só insumos com algum trecho na janela.
 */
export function divergenciasDoPeriodo(
  porInsumo: readonly { insumoId: string; nome: string; unidade: Unidade; marcos: readonly Marco[]; fluxos: readonly Fluxo[]; porUnidade: Fracao | null }[],
  janela: { de: Date; ate: Date },
  toleranciaCentavos: number,
): DivergenciaDoInsumo[] {
  const out: DivergenciaDoInsumo[] = [];
  for (const i of porInsumo) {
    const ts = trechosDoInsumo(i.marcos, i.fluxos).filter((t) => t.ate.getTime() >= janela.de.getTime() && t.ate.getTime() < janela.ate.getTime());
    if (ts.length === 0) continue;
    const soma = (f: (t: Trecho) => number) => ts.reduce((s, t) => s + f(t), 0);
    const sumico = soma((t) => t.sumicoMilesimos);
    const porSetor = new Map<string, number>();
    for (const t of ts) for (const [s, q] of Array.from(t.requisitadoPorSetor)) porSetor.set(s, (porSetor.get(s) ?? 0) + q);
    const pequenosTs = ts.filter((t) => {
      if (t.sumicoMilesimos <= 0) return false;
      const v = valorDaQuantidade(i.porUnidade, t.sumicoMilesimos);
      return v !== null && v <= toleranciaCentavos;
    });
    const pequenos = pequenosTs.reduce((s, t) => s + t.sumicoMilesimos, 0);
    out.push({
      insumoId: i.insumoId,
      nome: i.nome,
      unidade: i.unidade,
      trechos: ts.length,
      consumoMilesimos: soma((t) => t.consumoMilesimos),
      requisitadoMilesimos: soma((t) => t.requisitadoMilesimos),
      outrasSaidasMilesimos: soma((t) => t.outrasSaidasMilesimos),
      sumicoMilesimos: sumico,
      sumicoCentavos: valorDaQuantidade(i.porUnidade, sumico),
      pequenos: { vezes: pequenosTs.length, milesimos: pequenos, centavos: valorDaQuantidade(i.porUnidade, pequenos) },
      requisitadoPorSetor: porSetor,
      ultimoTrecho: { de: ts[ts.length - 1].de, ate: ts[ts.length - 1].ate },
    });
  }
  // Ranking: maior sumiço em R$ primeiro; sem preço depois dos com valor, pela quantidade.
  return out.sort((a, b) => (b.sumicoCentavos ?? -Infinity) - (a.sumicoCentavos ?? -Infinity) || b.sumicoMilesimos - a.sumicoMilesimos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface ResumoDasDivergencias {
  /** Sumiu sem requisição (perda/divergência), em R$, e quantos insumos. */
  sumicoCentavos: number;
  comSumico: number;
  /** Requisitou mais do que consumiu (devolução não registrada? contagem errada?). */
  sobraCentavos: number;
  comSobra: number;
  semPreco: number;
  /** Insumos com sumiço pequeno repetido (≥ 2 vezes dentro da tolerância). */
  pequenosRepetidos: number;
  pequenosCentavos: number;
}

export function resumoDasDivergencias(ds: readonly DivergenciaDoInsumo[]): ResumoDasDivergencias {
  const r: ResumoDasDivergencias = { sumicoCentavos: 0, comSumico: 0, sobraCentavos: 0, comSobra: 0, semPreco: 0, pequenosRepetidos: 0, pequenosCentavos: 0 };
  for (const d of ds) {
    if (d.sumicoMilesimos > 0) {
      r.comSumico++;
      if (d.sumicoCentavos === null) r.semPreco++;
      else r.sumicoCentavos += d.sumicoCentavos;
    } else if (d.sumicoMilesimos < 0) {
      r.comSobra++;
      if (d.sumicoCentavos === null) r.semPreco++;
      else r.sobraCentavos += -d.sumicoCentavos;
    }
    if (d.pequenos.vezes >= PEQUENO_REPETIDO) {
      r.pequenosRepetidos++;
      r.pequenosCentavos += d.pequenos.centavos ?? 0;
    }
  }
  return r;
}

export interface LinhaDoSetor {
  setor: string;
  /** O que o setor requisitou no período, em R$ (custo de referência de hoje). */
  requisitadoCentavos: number;
  quantosInsumos: number;
  /** Sumiço (R$) nos insumos que o setor pede: onde olhar primeiro, não culpa. */
  sumicoNosSeusCentavos: number;
  insumosComSumico: number;
}

/** Por setor: o que pediu e o sumiço nos insumos que ele pede (indício, nunca dono do sumiço). */
export function porSetor(ds: readonly DivergenciaDoInsumo[], custos: ReadonlyMap<string, Fracao | null>): LinhaDoSetor[] {
  const m = new Map<string, LinhaDoSetor>();
  for (const d of ds) {
    for (const [s, q] of Array.from(d.requisitadoPorSetor)) {
      if (q <= 0) continue;
      const l = m.get(s) ?? { setor: s, requisitadoCentavos: 0, quantosInsumos: 0, sumicoNosSeusCentavos: 0, insumosComSumico: 0 };
      l.requisitadoCentavos += valorDaQuantidade(custos.get(d.insumoId) ?? null, q) ?? 0;
      l.quantosInsumos++;
      if (d.sumicoMilesimos > 0) {
        l.insumosComSumico++;
        l.sumicoNosSeusCentavos += d.sumicoCentavos ?? 0;
      }
      m.set(s, l);
    }
  }
  return Array.from(m.values()).sort((a, b) => b.sumicoNosSeusCentavos - a.sumicoNosSeusCentavos || b.requisitadoCentavos - a.requisitadoCentavos);
}
