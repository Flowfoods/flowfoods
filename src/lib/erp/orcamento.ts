/**
 * Orçamento de compra ao vivo (2.5) — a leitura com banco. A conta mora em `orcamento-campos.ts` (pura).
 *
 * Lê, numa transação do portão e só nas lojas do alcance:
 *  - o período em curso (`periodoDe`, a regra única) e a meta vigente do CMV (`metasDoPeriodo`);
 *  - o faturamento pela leitura ÚNICA (`faturamentoDosGraos`), do começo do período ou das últimas 4 semanas (o que vier antes) até
 *    ontem, e o primeiro lançamento de cada loja (para saber se um dia é falta ou se a loja ainda não lançava);
 *  - as compras pela soma ÚNICA do CMV de compra (`comprasPorLoja`): o período inteiro e até ontem.
 *
 * QUEM VÊ O QUÊ (decisões 210 e 213): ver o orçamento pede `compras.ver` ou `compras.lancar` na loja. Só quem tem `dre.ver` NA LOJA
 * recebe a receita prevista, a meta, o teto exato, o já comprado e o farol; os outros recebem o "cabe" = teto ARREDONDADO PARA BAIXO
 * (degrau por faixa) − já comprado, e o motivo quando não há número. Arredonda-se o teto, nunca o saldo (o ataque do Guardião achava o
 * centavo comparando prévias e notas). A filtragem é AQUI, no servidor: a página nunca recebe o que a pessoa não vê (nem no HTML,
 * nem no payload). A linha da rede só existe para quem tem a rede inteira, e mostra a receita só com `dre.ver`; para quem não vê, o
 * teto da rede é a SOMA dos tetos arredondados das lojas (a rede bate com o "Por loja").
 */

import { hojeNoRio } from './compra-campos';
import { comprasPorLoja } from './cmv';
import { somarDias } from './contagem-campos';
import { metasDoPeriodo } from './dre-metas';
import { conjuntosVigentes, metaTotalDaLoja } from './metas-categorias';
import { faturamentoDosGraos, lojasDoFaturamento } from './faturamento';
import type { FarolDaLinha } from './farol-dre-campos';
import {
  CHAVE_DA_META,
  diaDoPeriodo,
  impactoDaNota,
  inicioDaLeitura,
  orcamentoDaLoja,
  orcamentoDoEscopo,
  fraseAcimaDoLimite,
  fraseDeQuemPassou,
  tetoArredondado,
  type ContaDoOrcamento,
  type ImpactoDaNota,
  type LojaDoOrcamento,
  type OrcamentoDaLoja,
  type PrevisaoDaLoja,
} from './orcamento-campos';
import type { Periodo } from './periodo-campos';
import { periodoDe } from './periodos';
import { alcancaLoja, pode, type Alcance } from './permissoes';
import { planoDoParceiro } from './plano';
import type { ClienteDoParceiro } from './tenant';

const isoDoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Uma loja que já passou do orçamento (a rede diz quem: a sobra de outra loja não cobre). */
export interface LojaQuePassou {
  nome: string;
  passouCentavos: number;
  frase: string;
}

/** O que quem vê a receita recebe de uma loja (ou da rede). */
export interface VistaCompleta {
  veReceita: true;
  /** A meta do CMV que vale nesta vista: da loja (a própria ou a da rede) ou, na rede, a média das lojas quando cada uma tem a sua. */
  metaBp: number | null;
  /** A meta contra a qual o ritmo foi medido. */
  ritmoMetaBp: number | null;
  /** Na rede: as lojas têm metas diferentes (I.2b). */
  metaMista: boolean;
  /** Nomes das lojas com meta própria diferente da rede (só a vista da rede). */
  comMetaPropria: string[];
  conta: ContaDoOrcamento | null;
  motivo: string | null;
  previsao: PrevisaoDaLoja | null;
  /** A receita prevista (da loja, ou a soma das lojas na rede), mesmo sem meta; nula sem previsão. */
  previstaCentavos: number | null;
  ritmo: FarolDaLinha | null;
  cmvAteOntemBp: number | null;
  compradoCentavos: number;
  compradoAteOntemCentavos: number;
  receitaAteOntemCentavos: number | null;
  diasSemLancamento: number;
  /** Lojas que venderam e não têm nota no período (na loja: ela mesma, ou vazio). */
  semNota: string[];
  /** Só na rede: as lojas que já passaram. */
  quemPassou: LojaQuePassou[];
}

/** O que quem NÃO vê a receita recebe: o "cabe" pelo teto arredondado (nulo = sem número), o motivo e os avisos. Nada mais. */
export interface VistaResumida {
  veReceita: false;
  saldoCentavos: number | null;
  motivo: string | null;
  diasSemLancamento: number;
  semNota: string[];
  quemPassou: LojaQuePassou[];
}

export type VistaDoOrcamento = VistaCompleta | VistaResumida;

export interface OrcamentoDaLojaNaTela {
  lojaId: string;
  nome: string;
  vista: VistaDoOrcamento;
}

export interface OrcamentoDeCompra {
  periodo: Periodo;
  hoje: string;
  dia: { dia: number; de: number };
  /** A meta do CMV; só vai a quem vê a receita de alguma loja do escopo (senão nula sempre). */
  metaBp: number | null;
  /** Só para quem tem a rede inteira e pediu a rede. */
  rede: VistaDoOrcamento | null;
  lojas: OrcamentoDaLojaNaTela[];
}

/** O "cabe" de quem não vê a receita: teto arredondado para baixo − já comprado (decisão 213). */
const saldoResumido = (o: OrcamentoDaLoja) => (o.conta ? tetoArredondado(o.conta.tetoCentavos) - o.compradoCentavos : null);

function vistaDaLoja(o: OrcamentoDaLoja, veReceita: boolean): VistaDoOrcamento {
  const diasSemLancamento = o.previsao?.diasSemLancamento ?? 0;
  const semNota = o.semNota ? [o.nome] : [];
  if (!veReceita) return { veReceita: false, saldoCentavos: saldoResumido(o), motivo: o.motivo, diasSemLancamento, semNota, quemPassou: [] };
  return {
    veReceita: true,
    metaBp: o.metaBp,
    ritmoMetaBp: o.metaBp,
    metaMista: false,
    comMetaPropria: [],
    conta: o.conta,
    motivo: o.motivo,
    previsao: o.previsao,
    previstaCentavos: o.previsao?.previstaCentavos ?? null,
    ritmo: o.ritmo,
    cmvAteOntemBp: o.cmvAteOntemBp,
    compradoCentavos: o.compradoCentavos,
    compradoAteOntemCentavos: o.compradoAteOntemCentavos,
    receitaAteOntemCentavos: o.receitaAteOntemCentavos,
    diasSemLancamento,
    semNota,
    quemPassou: [],
  };
}

/** As lojas que já passaram, cada uma pelo número que a pessoa vê (exato com `dre.ver`, pelo teto arredondado sem). */
function quemPassouNa(porLoja: readonly OrcamentoDaLoja[], veReceita: boolean): LojaQuePassou[] {
  const out: LojaQuePassou[] = [];
  for (const o of porLoja) {
    const saldo = veReceita ? o.conta?.saldoCentavos ?? null : saldoResumido(o);
    if (saldo !== null && saldo < 0) out.push({ nome: o.nome, passouCentavos: -saldo, frase: veReceita ? fraseDeQuemPassou(o.nome, -saldo) : fraseAcimaDoLimite(o.nome, saldo) });
  }
  return out;
}

/** Pode ver o orçamento da loja: quem vê ou lança nota nela. */
const veOrcamento = (alcance: Alcance, lojaId?: string) => pode(alcance, 'compras.ver', { lojaId }) || pode(alcance, 'compras.lancar', { lojaId });

interface LeituraInterna {
  periodo: Periodo;
  metaBp: number | null;
  porLoja: OrcamentoDaLoja[];
}

/** A leitura e a conta, dentro de uma transação já aberta (a prévia da nota usa a dela). */
async function lerOrcamento(tx: ClienteDoParceiro, alcance: Alcance, hoje: string, opcoes: { lojaId?: string; semNotaId?: string }): Promise<LeituraInterna> {
  const periodo = await periodoDe(tx, hoje);
  const plano = await planoDoParceiro(tx);
  const metaBp = (await metasDoPeriodo(tx, plano, periodo.inicio)).get(CHAVE_DA_META) ?? null;
  // Loja desativada não compra: fica fora do orçamento (e da soma da rede).
  const lojas = (await lojasDoFaturamento(tx, alcance)).filter((l) => l.ativa && (!opcoes.lojaId || l.id === opcoes.lojaId));
  if (lojas.length === 0) return { periodo, metaBp, porLoja: [] };
  const ids = lojas.map((l) => l.id);
  const vigentes = await conjuntosVigentes(tx, ids, periodo.inicio);
  const ontem = somarDias(hoje, -1);
  const de = inicioDaLeitura(periodo, hoje);
  const graos = de <= ontem ? await faturamentoDosGraos(tx, alcance, { de, ate: ontem }) : [];
  const primeiras = await tx.faturamentoLancamento.groupBy({ by: ['lojaId'], where: { lojaId: { in: ids } }, _min: { data: true } });
  const primeira = new Map(primeiras.map((p) => [p.lojaId, p._min.data ? isoDoDia(p._min.data) : null]));
  const doPeriodo = await comprasPorLoja(tx, ids, periodo.inicio, periodo.fim, { semNotaId: opcoes.semNotaId });
  const ateOntem = await comprasPorLoja(tx, ids, periodo.inicio, ontem, { semNotaId: opcoes.semNotaId });
  const porLoja = lojas.map((l) => {
    const entrada: LojaDoOrcamento = {
      lojaId: l.id,
      nome: l.nome,
      canais: l.canais,
      primeiroLancamento: primeira.get(l.id) ?? null,
      graos: graos.filter((g) => g.lojaId === l.id).map((g) => ({ data: g.data, canal: g.canal, valorCentavos: g.valorCentavos })),
      compradoCentavos: doPeriodo.get(l.id) ?? 0,
      compradoAteOntemCentavos: ateOntem.get(l.id) ?? 0,
    };
    // I.2b: a loja que personalizou a meta total do CMV tem a dela no orçamento; as outras, a da rede.
    return orcamentoDaLoja(entrada, periodo, hoje, metaTotalDaLoja(vigentes, l.id, metaBp).bp);
  });
  return { periodo, metaBp, porLoja };
}

/**
 * O orçamento de compra do período em curso, no escopo pedido (`lojaId` = uma loja; sem ele, as lojas do alcance e, para quem tem a
 * rede inteira, a linha da rede). Null = a pessoa não vê o orçamento (sem `compras.ver`/`compras.lancar`, ou loja fora do alcance).
 */
export async function orcamentoDeCompra(cliente: ClienteDoParceiro, alcance: Alcance, opcoes: { lojaId?: string; hoje?: string } = {}): Promise<OrcamentoDeCompra | null> {
  const hoje = opcoes.hoje ?? hojeNoRio();
  if (opcoes.lojaId !== undefined && (!alcancaLoja(alcance, opcoes.lojaId) || !veOrcamento(alcance, opcoes.lojaId))) return null;
  if (!veOrcamento(alcance)) return null;
  return cliente.transacao(async (tx) => {
    const { periodo, metaBp, porLoja } = await lerOrcamento(tx, alcance, hoje, { lojaId: opcoes.lojaId });
    const lojas = porLoja.filter((o) => veOrcamento(alcance, o.lojaId)).map((o) => ({ lojaId: o.lojaId, nome: o.nome, vista: vistaDaLoja(o, pode(alcance, 'dre.ver', { lojaId: o.lojaId })) }));
    let rede: VistaDoOrcamento | null = null;
    if (!opcoes.lojaId && alcance.lojas === 'todas') {
      const e = orcamentoDoEscopo(porLoja);
      const veReceita = pode(alcance, 'dre.ver');
      const semNota = porLoja.filter((l) => l.semNota).map((l) => l.nome);
      const quemPassou = quemPassouNa(porLoja, veReceita);
      // Sem `dre.ver`: o teto da rede é a soma dos tetos ARREDONDADOS das lojas (a rede bate com o "Por loja").
      const saldoResumidoDaRede = e.conta ? porLoja.reduce((s, l) => s + (saldoResumido(l) ?? 0), 0) : null;
      rede = veReceita
        ? {
            veReceita: true,
            metaBp: e.conta?.metaBp ?? (porLoja.find((l) => l.metaBp !== null)?.metaBp ?? null),
            ritmoMetaBp: e.ritmoMetaBp,
            metaMista: e.conta?.metaMista === true,
            comMetaPropria: porLoja.filter((l) => l.metaBp !== null && l.metaBp !== metaBp).map((l) => l.nome),
            conta: e.conta,
            motivo: e.motivo,
            previsao: null,
            previstaCentavos: e.previstaCentavos,
            ritmo: e.ritmo,
            cmvAteOntemBp: e.cmvAteOntemBp,
            compradoCentavos: porLoja.reduce((s, l) => s + l.compradoCentavos, 0),
            compradoAteOntemCentavos: porLoja.reduce((s, l) => s + l.compradoAteOntemCentavos, 0),
            receitaAteOntemCentavos: porLoja.some((l) => l.receitaAteOntemCentavos === null) ? null : porLoja.reduce((s, l) => s + (l.receitaAteOntemCentavos ?? 0), 0),
            diasSemLancamento: e.diasSemLancamento,
            semNota,
            quemPassou,
          }
        : { veReceita: false, saldoCentavos: saldoResumidoDaRede, motivo: e.motivo, diasSemLancamento: e.diasSemLancamento, semNota, quemPassou };
    }
    const algumaComReceita = lojas.some((l) => l.vista.veReceita) || rede?.veReceita === true;
    return { periodo, hoje, dia: diaDoPeriodo(periodo, hoje), metaBp: algumaComReceita ? metaBp : null, rede, lojas };
  });
}

// ================================================================ a nota

export type OrcamentoNaNota =
  | {
      tipo: 'conta';
      lojaNome: string;
      periodoNome: string;
      impacto: ImpactoDaNota;
      /** A loja vendeu e não tem nota no período (sem contar a nota em edição). */
      semNota: boolean;
      /** Quem lê define as metas (a frase "vale combinar com quem define as metas" não é para essa pessoa). */
      defineMetas: boolean;
    }
  /** `arredondado`: quem lê não vê a receita (a tela fala em "limite seguro", nunca em "orçamento"). */
  | { tipo: 'sem'; lojaNome: string; periodoNome: string; motivo: string; arredondado: boolean }
  /** A data da nota não é do período em curso: o orçamento é só dele. */
  | { tipo: 'fora'; periodoNome: string };

/**
 * O orçamento da loja de uma nota, com a nota (prévia) ou já com ela lançada (`notaCentavos` = 0 e sem `semNotaId`).
 * Chamada DENTRO da transação de quem já conferiu a loja (a prévia da nota) ou pela página da nota (que já leu a nota pelo alcance).
 */
export async function orcamentoNaNota(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  p: { lojaId: string; entradaEm: string; notaCentavos: number; semNotaId?: string; hoje?: string },
): Promise<OrcamentoNaNota | null> {
  const hoje = p.hoje ?? hojeNoRio();
  if (!alcancaLoja(alcance, p.lojaId) || !veOrcamento(alcance, p.lojaId)) return null;
  const { periodo, porLoja } = await lerOrcamento(tx, alcance, hoje, { lojaId: p.lojaId, semNotaId: p.semNotaId });
  if (p.entradaEm < periodo.inicio || p.entradaEm > periodo.fim) return { tipo: 'fora', periodoNome: periodo.nome };
  const o = porLoja[0];
  if (!o) return null;
  if (!o.conta) return { tipo: 'sem', lojaNome: o.nome, periodoNome: periodo.nome, motivo: o.motivo ?? 'sem número', arredondado: !pode(alcance, 'dre.ver', { lojaId: p.lojaId }) };
  const veReceita = pode(alcance, 'dre.ver', { lojaId: p.lojaId });
  return {
    tipo: 'conta',
    lojaNome: o.nome,
    periodoNome: periodo.nome,
    // `o.conta.compradoCentavos` já está SEM a versão gravada da nota em edição (`semNotaId`).
    impacto: impactoDaNota(o.conta, o.conta.compradoCentavos, p.notaCentavos, veReceita),
    semNota: o.semNota,
    defineMetas: pode(alcance, 'metas.editar'),
  };
}

/** O orçamento da loja de uma nota já lançada (a página da nota): numa transação própria. */
export async function orcamentoDaNotaLancada(cliente: ClienteDoParceiro, alcance: Alcance, nota: { lojaId: string; entradaEm: string; cancelada: boolean }, hoje?: string): Promise<OrcamentoNaNota | null> {
  if (nota.cancelada) return null;
  return cliente.transacao((tx) => orcamentoNaNota(tx, alcance, { lojaId: nota.lojaId, entradaEm: nota.entradaEm, notaCentavos: 0, hoje }));
}
