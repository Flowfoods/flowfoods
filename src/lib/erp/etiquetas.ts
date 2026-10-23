/**
 * Etiquetas (3.4) — com banco. Três coisas, sempre por LOJA (permissão `etiquetas.imprimir`, já no catálogo desde a 0.4; o
 * operador da cozinha tem):
 *
 * 1. EMITIR a etiqueta (a `Etiqueta` é o retrato imutável do que vai no papel): de um LOTE PRODUZIDO concluído (3.1/3.3: a
 *    validade é a que a conclusão fotografou; quem fez é quem pegou) ou de uma EMBALAGEM ABERTA (a validade efetiva da
 *    abertura). Reimprimir usa a emissão; nada recalcula (decisão 401).
 * 2. PEDIR A IMPRESSÃO (`EtiquetaImpressao`): Zebra pelo Browser Print (gravada PREPARADA antes do envio; o navegador diz o
 *    resultado depois), arquivo .zpl ou papel (gravados como "arquivo gerado": download não é impressão). Primeira = sequência 1;
 *    as outras são reimpressões. O ZPL sai daqui (servidor), do retrato.
 * 3. O ITEM COMPRADO: o lote do fornecedor (código e vencimento, opcionais e nunca inventados) registrado no recebimento — na
 *    nota, por insumo, com `compras.lancar` da loja; o `rastro` do XML é só sugestão — ou lido na embalagem na hora de abrir; e a
 *    ABERTURA (data e hora automáticas, do servidor) com a validade efetiva = mín(fim do dia do vencimento, abertura + prazo
 *    após abertura na conservação escolhida). Abrir não mexe no saldo, no livro nem na nota (decisão 404) e não depende do
 *    período do DRE (não mexe em dinheiro nem em estoque).
 *
 * Concorrência: a emissão lê o lote com FOR SHARE (o estorno, que trava FOR UPDATE, espera ou é esperado); o código da etiqueta
 * nasce sob `pg_advisory_xact_lock` do dia (o índice único é o cinto); o pedido de impressão trava a emissão (FOR UPDATE) para
 * a sequência; toda criação tem a chave do envio (duplo clique = o mesmo registro).
 */

import type { ClienteDoParceiro } from './tenant';
import { filtroDeLojas, pode, type Alcance } from './permissoes';
import { comRecusa, lojaDoAlcance, Recusa, type ResultadoEstoque } from './estoque';
import { formatarData, hojeNoRio, numeroDaNota } from './compra-campos';
import { rastrosDoXmlGuardado } from './nfe-xml';
import { limparTexto } from './texto-limpo';
import {
  codigoDaEtiqueta,
  diaNoRio,
  ehTransporte,
  fimDoVencimento,
  inicioDoDiaNoRio,
  lerAbertura,
  lerChaveDoEnvio,
  lerCopias,
  lerEmissaoDaAbertura,
  lerEmissaoDoLote,
  lerLote,
  lerResolucao,
  prazoNaConservacao,
  quandoNaTela,
  situacaoDaValidade,
  validadeDaAbertura,
  diaPorExtenso,
  fraseDoVencido,
  venceu,
  limiteDeUso,
  FORMATOS,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_TRANSPORTE,
  type Formato,
  type RegraDaValidade,
  type Resolucao,
  type SituacaoDaImpressao,
  type Transporte,
} from './etiqueta-campos';
import { conteudoDeTeste, montarEtiqueta, nomeDoArquivo, VERSAO_DO_LAYOUT, zplDoLayout, type ConteudoDaEtiqueta, type LayoutDaEtiqueta } from './etiqueta-zpl';
import { lerPeriodoDoHistorico, rotuloDoPeriodo, type PeriodoDoHistorico } from './producao-equipe-campos';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, formatarValidade, type Conservacao } from './validade';
import { formatarQuantidade, type Unidade } from './unidades';

const ID = /^[a-z0-9_-]{1,64}$/i;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const naoEncontrado = (o: string) => new Recusa({ ok: false, erros: { geral: `${o} não encontrada nesta loja.` }, naoEncontrado: true });

/** Quem faz (nome para o histórico e a etiqueta; o login, texto sem FK). */
export interface Autor {
  nome: string;
  userId?: string | null;
}

export const NIVEL1_NAO_ABRE = 'Abrir a embalagem é de quem está na cozinha: a FlowFoods não abre. Quem abriu é quem assina a etiqueta.';
const SEM_CHAVE = 'O formulário veio sem a chave do envio. Recarregue a tela e tente de novo; nada foi gravado.';

// ================================================================ o retrato → o papel

/** As colunas da emissão que o papel usa. */
const SELECAO_DA_EMISSAO = {
  id: true,
  lojaId: true,
  codigo: true,
  ordemProducaoId: true,
  aberturaId: true,
  insumoId: true,
  nomeSnapshot: true,
  unidadeSnapshot: true,
  quantidadeMilesimos: true,
  conservacao: true,
  loteFornecedor: true,
  loteProduzido: true,
  fabricadoEm: true,
  abertoEm: true,
  validadeEm: true,
  validadeMinSnapshot: true,
  vencimentoLoteEm: true,
  regraDaValidade: true,
  marcaSnapshot: true,
  responsavelNomeSnapshot: true,
  lojaNomeSnapshot: true,
  formato: true,
  quantas: true,
  mostrarHora: true,
  versaoDoLayout: true,
  impressaEm: true,
  emitidaPorNome: true,
} as const;

type EmissaoGravada = {
  codigo: string;
  ordemProducaoId: string | null;
  nomeSnapshot: string;
  unidadeSnapshot: string | null;
  quantidadeMilesimos: number | null;
  conservacao: string | null;
  loteFornecedor: string | null;
  loteProduzido: string | null;
  fabricadoEm: Date | null;
  abertoEm: Date | null;
  validadeEm: Date | null;
  vencimentoLoteEm: Date | null;
  regraDaValidade: string | null;
  marcaSnapshot: string | null;
  responsavelNomeSnapshot: string | null;
  lojaNomeSnapshot: string | null;
  mostrarHora: boolean;
};

/** O conteúdo do papel a partir da emissão GRAVADA: nenhuma consulta a ficha, insumo ou relógio (reimprimir = o mesmo). */
export function conteudoDaEmissao(e: EmissaoGravada): ConteudoDaEtiqueta {
  const unidade = (e.unidadeSnapshot ?? 'UN') as Unidade;
  const vencimento = iso(e.vencimentoLoteEm);
  return {
    origem: e.ordemProducaoId ? 'LOTE' : 'ABERTA',
    produto: e.nomeSnapshot,
    conservacao: (e.conservacao ?? null) as Conservacao | null,
    quantidade: e.quantidadeMilesimos ? formatarQuantidade(e.quantidadeMilesimos, unidade) : null,
    manipuladoEm: e.ordemProducaoId ? e.fabricadoEm : null,
    abertoEm: e.ordemProducaoId ? null : e.abertoEm,
    validade:
      e.regraDaValidade === 'VENCIMENTO_DO_LOTE' && vencimento
        ? { tipo: 'dia', dia: vencimento }
        : e.validadeEm
          ? { tipo: 'instante', em: e.validadeEm }
          : { tipo: 'nao-informada' },
    vencimentoLote: vencimento,
    lote: e.ordemProducaoId ? e.loteProduzido : e.loteFornecedor,
    marca: e.marcaSnapshot,
    responsavel: e.responsavelNomeSnapshot,
    loja: e.lojaNomeSnapshot ?? '',
    codigo: e.codigo,
    mostrarHora: e.mostrarHora,
  };
}

/**
 * Os desenhos por versão (rodada final, decisão 427): a emissão é desenhada com a versão do layout GRAVADA nela, para a
 * reimpressão sair igual mesmo depois de o desenho mudar. Hoje só existe a versão 1 (a primeira que vai para produção).
 * Mudou o desenho? Crie a versão 2 AO LADO da 1 (a 1 continua desenhando as emissões antigas) e suba `VERSAO_DO_LAYOUT`.
 */
const DESENHOS: Readonly<Record<number, typeof montarEtiqueta>> = { 1: montarEtiqueta };

/** O desenho de uma emissão gravada, pela versão dela; versão que este sistema não tem = layout com `erro` (não imprime). */
export function desenhoDaEmissao(e: EmissaoGravada & { formato: string; versaoDoLayout?: number | null }, resolucao: Resolucao = 203): LayoutDaEtiqueta {
  const versao = e.versaoDoLayout ?? 1;
  const desenhar = DESENHOS[versao];
  if (!desenhar) {
    return { formato: e.formato as Formato, resolucao, larguraPontos: 0, alturaPontos: 0, elementos: [], fora: [], erro: `Esta etiqueta foi emitida com o desenho versão ${versao}, que este sistema não tem: emita de novo.` };
  }
  return desenhar(conteudoDaEmissao(e), e.formato as Formato, resolucao);
}

/** O ZPL de uma emissão gravada, com as cópias e a resolução do pedido. */
export function zplDaEmissao(e: EmissaoGravada & { formato: string; versaoDoLayout?: number | null }, copias: number, resolucao: Resolucao = 203): string {
  return zplDoLayout(desenhoDaEmissao(e, resolucao), copias);
}

/** O próximo código do dia (sob a trava do dia: quem chega junto espera). */
async function proximoCodigo(tx: ClienteDoParceiro, agora: Date): Promise<string> {
  const dia = diaNoRio(agora);
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:etiqueta:${tx.parceiroId}:${dia}`}, 0))::text AS "trava"`;
  const prefixo = codigoDaEtiqueta(dia, 0).slice(0, 8);
  const [{ proximo }] = await tx.sql<{ proximo: number }>`
    SELECT (coalesce(max(CASE WHEN "codigo" ~ '^E[0-9]{6}-[0-9]{4,5}$' THEN split_part("codigo", '-', 2)::int END), 0) + 1)::int AS "proximo"
    FROM "Etiqueta" WHERE "parceiroId" = ${tx.parceiroId} AND "codigo" LIKE ${`${prefixo}%`}`;
  if (proximo > 99_999) throw new Recusa({ ok: false, erros: { geral: 'Passou do limite de etiquetas num dia só.' } });
  return codigoDaEtiqueta(dia, proximo);
}

/** A chave repetida: a mesma emissão (duplo clique, rede que voltou) ou recusa se a chave foi usada para outra coisa. */
async function emissaoDaChave(tx: ClienteDoParceiro, chave: string, lojaId: string, origem: { ordemProducaoId?: string; aberturaId?: string }) {
  const feita = await tx.etiqueta.findFirst({ where: { chaveEnvio: chave }, select: { id: true, lojaId: true, ordemProducaoId: true, aberturaId: true } });
  if (!feita) return null;
  // Rodada 1 (Guardião M6): a chave de outra loja não devolve o id de lá.
  if (feita.lojaId !== lojaId || (origem.ordemProducaoId && feita.ordemProducaoId !== origem.ordemProducaoId) || (origem.aberturaId && feita.aberturaId !== origem.aberturaId)) {
    throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado em outra etiqueta: recarregue a tela e emita de novo.' } });
  }
  return feita.id;
}

/** Monta o layout e recusa no campo do formato quando algo essencial não cabe (nada é cortado calado). */
function layoutOuRecusa(c: ConteudoDaEtiqueta, formato: Formato): LayoutDaEtiqueta {
  const l = montarEtiqueta(c, formato, 203);
  if (l.erro) throw new Recusa({ ok: false, erros: { formato: l.erro } });
  return l;
}

// ================================================================ as lojas (entrada da área)

/** Lojas do alcance onde a pessoa imprime etiquetas, com quantas emissões estão na fila (sem envio nem arquivo, últimos 2 dias). */
export async function lojasDasEtiquetas(cliente: ClienteDoParceiro, alcance: Alcance, agora = new Date()) {
  return cliente.transacao(async (tx) => {
    const lojas = (await tx.loja.findMany({ where: { ativa: true, id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) =>
      pode(alcance, 'etiquetas.imprimir', { lojaId: l.id }),
    );
    if (lojas.length === 0) return [];
    const fila = await filaDeImpressao(tx, lojas.map((l) => l.id), agora);
    return lojas.map((l) => ({ ...l, naFila: fila.filter((f) => f.lojaId === l.id).length }));
  });
}

/**
 * A fila do computador da Zebra: emissões dos últimos 2 dias que ainda não saíram. Rodada 1 (decisão 418): sai da fila quando a
 * Zebra ACEITA o envio ou quando alguém diz "Já imprimi"; baixar o arquivo ou abrir o papel NÃO tira da fila. Vencida ou de lote
 * estornado não fica na fila (não se imprime mais).
 */
async function filaDeImpressao(tx: ClienteDoParceiro, lojaIds: readonly string[], agora: Date) {
  const desde = new Date(agora.getTime() - 2 * 86_400_000);
  const emissoes = await tx.etiqueta.findMany({
    where: {
      lojaId: { in: [...lojaIds] },
      regraDaValidade: { not: null },
      impressaEm: { gte: desde },
      // Válida: a validade não passou; sem validade, o lote do fornecedor (se houver) ainda não venceu (decisão 425).
      OR: [{ validadeEm: { gt: agora } }, { validadeEm: null, OR: [{ vencimentoLoteEm: null }, { vencimentoLoteEm: { gte: new Date(`${hojeNoRio(agora)}T00:00:00Z`) } }] }],
      NOT: { ordemProducao: { status: 'CANCELADA' } },
    },
    orderBy: { impressaEm: 'desc' },
    select: {
      id: true,
      lojaId: true,
      codigo: true,
      nomeSnapshot: true,
      impressaEm: true,
      quantas: true,
      formato: true,
      emitidaPorNome: true,
      impressoes: { where: { OR: [{ situacao: 'ENVIADA' }, { confirmadaEm: { not: null } }] }, select: { id: true }, take: 1 },
    },
  });
  return emissoes.filter((e) => e.impressoes.length === 0).map(({ impressoes: _i, ...e }) => e);
}

// ================================================================ a tela "Imprimir" da loja

export const DIAS_NA_TELA = 7;

/** O que dá para etiquetar na loja: lotes concluídos e embalagens abertas dos últimos 7 dias (ou o lote procurado pelo código), e a fila. */
export async function painelDeEtiquetas(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, filtros: { lote?: unknown }, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      const hoje = hojeNoRio(agora);
      const desde = inicioDoDiaNoRio(new Date(Date.parse(`${hoje}T12:00:00Z`) - (DIAS_NA_TELA - 1) * 86_400_000).toISOString().slice(0, 10));
      const busca = typeof filtros.lote === 'string' ? limparTexto(filtros.lote).toUpperCase().slice(0, 20) : '';
      const ordens = await tx.ordemProducao.findMany({
        where: {
          lojaId,
          status: 'CONCLUIDA',
          produzidoMilesimos: { gt: 0 },
          ...(busca ? { codigoLote: { contains: busca } } : { concluidaEm: { gte: desde } }),
        },
        orderBy: [{ concluidaEm: 'desc' }, { id: 'asc' }],
        take: 40,
        select: { id: true, codigoLote: true, fichaNomeSnapshot: true, unidadeSnapshot: true, produzidoMilesimos: true, conservacaoSnapshot: true, validadeEm: true, concluidaEm: true, responsavelNomeSnapshot: true, _count: { select: { etiquetas: true } } },
      });
      const aberturas = await tx.aberturaDeLote.findMany({
        where: { lojaId, abertoEm: { gte: desde } },
        orderBy: [{ abertoEm: 'desc' }, { id: 'asc' }],
        take: 40,
        select: { id: true, insumoNomeSnapshot: true, conservacao: true, abertoEm: true, validadeEm: true, regraDaValidade: true, vencimentoLoteEm: true, codigoLoteSnapshot: true, abertoPorNome: true, _count: { select: { etiquetas: true } } },
      });
      const fila = await filaDeImpressao(tx, [lojaId], agora);
      return {
        loja,
        hoje,
        busca,
        lotes: ordens.map((o) => ({
          id: o.id,
          codigo: o.codigoLote,
          nome: o.fichaNomeSnapshot,
          quanto: formatarQuantidade(o.produzidoMilesimos ?? 0, (o.unidadeSnapshot ?? 'KG') as Unidade),
          conservacao: (o.conservacaoSnapshot ?? null) as Conservacao | null,
          validadeEm: o.validadeEm,
          situacao: situacaoDaValidade(o.validadeEm, agora),
          vencido: venceu(o.validadeEm, agora),
          concluidaEm: o.concluidaEm,
          quemFez: o.responsavelNomeSnapshot,
          emissoes: o._count.etiquetas,
        })),
        aberturas: aberturas.map((a) => ({
          id: a.id,
          nome: a.insumoNomeSnapshot,
          conservacao: a.conservacao as Conservacao,
          abertoEm: a.abertoEm,
          validadeEm: a.validadeEm,
          situacao: situacaoDaAbertura(a, agora),
          vencido: venceu(limiteDeUso(a.validadeEm, iso(a.vencimentoLoteEm)), agora),
          lote: a.codigoLoteSnapshot,
          abertoPor: a.abertoPorNome,
          emissoes: a._count.etiquetas,
        })),
        fila,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type PainelDeEtiquetas = NonNullable<Awaited<ReturnType<typeof painelDeEtiquetas>>>;

// ================================================================ o lote produzido

interface OrdemLida {
  id: string;
  lojaId: string;
  status: string;
  codigoLote: string;
  fichaNomeSnapshot: string;
  insumoProduzidoId: string | null;
  unidadeSnapshot: string | null;
  produzidoMilesimos: number | null;
  conservacaoSnapshot: string | null;
  validadeMinSnapshot: number | null;
  validadeEm: Date | null;
  concluidaEm: Date | null;
  responsavelUsuarioId: string | null;
  responsavelNomeSnapshot: string | null;
}

async function lerOrdem(tx: ClienteDoParceiro, lojaId: string, id: string, travar: boolean): Promise<OrdemLida> {
  if (!ID.test(id)) throw naoEncontrado('Produção');
  const consulta = travar
    ? tx.sql<OrdemLida>`
      SELECT "id", "lojaId", "status"::text AS "status", "codigoLote", "fichaNomeSnapshot", "insumoProduzidoId", "unidadeSnapshot"::text AS "unidadeSnapshot",
             "produzidoMilesimos", "conservacaoSnapshot"::text AS "conservacaoSnapshot", "validadeMinSnapshot", "validadeEm", "concluidaEm",
             "responsavelUsuarioId", "responsavelNomeSnapshot"
      FROM "OrdemProducao" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} AND "lojaId" = ${lojaId} FOR SHARE`
    : tx.sql<OrdemLida>`
      SELECT "id", "lojaId", "status"::text AS "status", "codigoLote", "fichaNomeSnapshot", "insumoProduzidoId", "unidadeSnapshot"::text AS "unidadeSnapshot",
             "produzidoMilesimos", "conservacaoSnapshot"::text AS "conservacaoSnapshot", "validadeMinSnapshot", "validadeEm", "concluidaEm",
             "responsavelUsuarioId", "responsavelNomeSnapshot"
      FROM "OrdemProducao" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} AND "lojaId" = ${lojaId}`;
  const [o] = await consulta;
  if (!o) throw new Recusa({ ok: false, erros: { geral: 'Lote não encontrado nesta loja.' }, naoEncontrado: true });
  return o;
}

/** Por que o lote não emite etiqueta (null = emite). Rodada 1 (decisão 417): lote vencido não emite. */
function motivoSemEtiqueta(o: OrdemLida, agora: Date): string | null {
  if (o.status === 'CANCELADA') return o.concluidaEm ? 'Este lote foi estornado: saiu do estoque e não leva etiqueta nova.' : 'Este lote foi cancelado: não tem o que etiquetar.';
  if (o.status !== 'CONCLUIDA') return 'O lote ainda não foi concluído: a validade nasce na conclusão. Conclua e volte para imprimir.';
  if (!o.produzidoMilesimos) return 'Este lote se perdeu (saiu zero): não tem o que etiquetar.';
  if (!o.insumoProduzidoId) return 'O lote não tem o pré-preparo que entra no estoque: refaça a ficha.';
  if (venceu(o.validadeEm, agora)) return fraseDoVencido({ origem: 'LOTE', validadeEm: o.validadeEm!, porDia: null });
  return null;
}

/** A situação da validade de uma abertura, com o termo único quando não há prazo (rodada 1, UX 8). */
function situacaoDaAbertura(a: { validadeEm: Date | null; regraDaValidade: string | null; vencimentoLoteEm: Date | null }, agora: Date) {
  if (a.regraDaValidade === 'PRAZO_NAO_INFORMADO') {
    // Rodada final (decisão 425): sem prazo, mas o lote do fornecedor venceu = venceu.
    if (venceu(limiteDeUso(null, iso(a.vencimentoLoteEm)), agora)) return { texto: 'Venceu', tom: 'erro' as const };
    return { texto: 'Prazo após abertura não informado', tom: 'alerta' as const };
  }
  return situacaoDaValidade(a.validadeEm, agora, a.regraDaValidade === 'VENCIMENTO_DO_LOTE' ? iso(a.vencimentoLoteEm) : null);
}

/**
 * Por que uma emissão GRAVADA não se imprime mais (null = imprime): o lote foi estornado depois, ou a validade passou (lote
 * produzido ou embalagem aberta). Vale para a Zebra, o arquivo e o papel (rodada 1: decisão 417 e Guardião I1).
 */
async function bloqueioDaEmissao(tx: ClienteDoParceiro, e: { ordemProducaoId: string | null; validadeEm: Date | null; regraDaValidade: string | null; vencimentoLoteEm: Date | null }, agora: Date): Promise<string | null> {
  if (e.ordemProducaoId) {
    const o = await tx.ordemProducao.findFirst({ where: { id: e.ordemProducaoId }, select: { status: true } });
    if (o?.status === 'CANCELADA') return 'O lote desta etiqueta foi estornado: saiu do estoque e a etiqueta não se imprime mais.';
  }
  const limite = limiteDeUso(e.validadeEm, iso(e.vencimentoLoteEm));
  if (venceu(limite, agora)) {
    const porDia = e.regraDaValidade === 'VENCIMENTO_DO_LOTE' || !e.validadeEm ? iso(e.vencimentoLoteEm) : null;
    return fraseDoVencido({ origem: e.ordemProducaoId ? 'LOTE' : 'ABERTA', validadeEm: limite!, porDia });
  }
  return null;
}

/** Quem fez o lote, para a etiqueta: a pessoa da equipe que pegou (3.3); a FlowFoods nunca assina (decisão 241). */
function quemFezDoLote(o: Pick<OrdemLida, 'responsavelUsuarioId' | 'responsavelNomeSnapshot'>, equipe: ReadonlySet<string> | null): { nome: string | null; usuarioId: string | null } {
  if (!o.responsavelNomeSnapshot) return { nome: null, usuarioId: null };
  if (o.responsavelUsuarioId && equipe && !equipe.has(o.responsavelUsuarioId)) return { nome: null, usuarioId: null };
  return { nome: o.responsavelNomeSnapshot, usuarioId: o.responsavelUsuarioId };
}

function conteudoDoLote(o: OrdemLida, loja: string, quemFez: string | null, e: { quantidadeMilesimos: number | null; mostrarHora: boolean; codigo: string }): ConteudoDaEtiqueta {
  const unidade = (o.unidadeSnapshot ?? 'KG') as Unidade;
  return {
    origem: 'LOTE',
    produto: o.fichaNomeSnapshot,
    conservacao: (o.conservacaoSnapshot ?? null) as Conservacao | null,
    quantidade: e.quantidadeMilesimos ? formatarQuantidade(e.quantidadeMilesimos, unidade) : null,
    manipuladoEm: o.concluidaEm,
    abertoEm: null,
    validade: o.validadeEm ? { tipo: 'instante', em: o.validadeEm } : { tipo: 'nao-informada' },
    vencimentoLote: null,
    lote: o.codigoLote,
    marca: null,
    responsavel: quemFez,
    loja,
    codigo: e.codigo,
    mostrarHora: e.mostrarHora,
  };
}

/** Emissões de uma origem (para a tela: as já feitas, com quantos pedidos de impressão). */
async function emissoesDe(tx: ClienteDoParceiro, where: { ordemProducaoId?: string; aberturaId?: string }) {
  const lista = await tx.etiqueta.findMany({
    where,
    orderBy: [{ impressaEm: 'desc' }, { id: 'asc' }],
    take: 30,
    select: { id: true, codigo: true, formato: true, quantas: true, quantidadeMilesimos: true, unidadeSnapshot: true, impressaEm: true, emitidaPorNome: true, _count: { select: { impressoes: true } } },
  });
  return lista.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    formato: e.formato as Formato,
    quantas: e.quantas ?? 1,
    quantidade: e.quantidadeMilesimos ? formatarQuantidade(e.quantidadeMilesimos, (e.unidadeSnapshot ?? 'UN') as Unidade) : null,
    impressaEm: e.impressaEm,
    emitidaPorNome: e.emitidaPorNome,
    pedidos: e._count.impressoes,
  }));
}

/**
 * A tela "Etiqueta do lote": o lote concluído (o retrato da validade), a prévia com o que vai no papel e as emissões já feitas.
 * `equipe` = os logins da equipe do parceiro (credenciais): quem não está nela não assina a etiqueta (a FlowFoods).
 */
export async function loteParaEtiqueta(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, ordemId: string, equipe: ReadonlySet<string> | null, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      const o = await lerOrdem(tx, lojaId, ordemId, false);
      const quemFez = quemFezDoLote(o, equipe);
      const unidade = (o.unidadeSnapshot ?? 'KG') as Unidade;
      return {
        loja,
        hoje: hojeNoRio(agora),
        lote: {
          id: o.id,
          codigo: o.codigoLote,
          nome: o.fichaNomeSnapshot,
          unidade,
          produzidoMilesimos: o.produzidoMilesimos ?? 0,
          conservacao: (o.conservacaoSnapshot ?? null) as Conservacao | null,
          validadeMin: o.validadeMinSnapshot,
          validadeEm: o.validadeEm,
          situacao: situacaoDaValidade(o.validadeEm, agora),
          concluidaEm: o.concluidaEm,
          quemFez: quemFez.nome,
        },
        motivo: motivoSemEtiqueta(o, agora),
        /** Rodada 1 (decisão 417): o lote concluído venceu — a tela diz em vermelho o que fazer. */
        vencido: o.status === 'CONCLUIDA' && venceu(o.validadeEm, agora),
        /** O conteúdo da prévia (o código e a quantidade entram na emissão). */
        previa: conteudoDoLote(o, loja.nome, quemFez.nome, { quantidadeMilesimos: o.produzidoMilesimos, mostrarHora: true, codigo: codigoDaEtiqueta(diaNoRio(agora), 0) }),
        emissoes: await emissoesDe(tx, { ordemProducaoId: o.id }),
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type LoteParaEtiqueta = NonNullable<Awaited<ReturnType<typeof loteParaEtiqueta>>>;

/**
 * Emite a etiqueta de um lote concluído: o retrato da conclusão (validade, conservação, manipulação, quem fez), o formato, quantas
 * etiquetas e quanto em cada. Idempotente pela chave do envio. Não mexe em estoque nem em dinheiro: vale com o período fechado.
 */
export async function emitirEtiquetaDoLote(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  ordemId: string,
  entrada: { formato: unknown; quantas: unknown; quanto: unknown; escala: unknown; hora: unknown; envio: unknown },
  autor: Autor,
  equipe: ReadonlySet<string> | null,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
        const chave = lerChaveDoEnvio(entrada.envio);
        if (!chave) throw new Recusa({ ok: false, erros: { geral: SEM_CHAVE } });
        const codigo = await proximoCodigo(tx, agora);
        const feita = await emissaoDaChave(tx, chave, lojaId, { ordemProducaoId: ordemId });
        if (feita) return { ok: true as const, id: feita, jaFeito: true };
        const o = await lerOrdem(tx, lojaId, ordemId, true);
        const motivo = motivoSemEtiqueta(o, agora);
        if (motivo) throw new Recusa({ ok: false, erros: { geral: motivo }, conflito: true });
        const unidade = (o.unidadeSnapshot ?? 'KG') as Unidade;
        const lido = lerEmissaoDoLote(entrada, { unidade, produzidoMilesimos: o.produzidoMilesimos ?? 0 });
        if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
        const e = lido.emissao;
        const quemFez = quemFezDoLote(o, equipe);
        layoutOuRecusa(conteudoDoLote(o, loja.nome, quemFez.nome, { quantidadeMilesimos: e.quantidadeMilesimos, mostrarHora: e.mostrarHora, codigo }), e.formato);
        const criada = await tx.etiqueta.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId,
            codigo,
            insumoId: o.insumoProduzidoId,
            ordemProducaoId: o.id,
            nomeSnapshot: o.fichaNomeSnapshot,
            unidadeSnapshot: unidade,
            quantidadeMilesimos: e.quantidadeMilesimos,
            conservacao: (o.conservacaoSnapshot ?? null) as Conservacao | null,
            fabricadoEm: o.concluidaEm,
            validadeEm: o.validadeEm,
            validadeMinSnapshot: o.validadeMinSnapshot,
            regraDaValidade: o.validadeEm ? 'LOTE_PRODUZIDO' : 'LOTE_SEM_VALIDADE',
            loteProduzido: o.codigoLote,
            responsavelNomeSnapshot: quemFez.nome,
            responsavelUsuarioId: quemFez.usuarioId,
            lojaNomeSnapshot: loja.nome,
            formato: e.formato,
            quantas: e.quantas,
            mostrarHora: e.mostrarHora,
            versaoDoLayout: VERSAO_DO_LAYOUT,
            emitidaPorNome: autor.nome,
            emitidaPorUsuarioId: autor.userId ?? null,
            chaveEnvio: chave,
            impressaEm: agora,
          },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Etiqueta',
            entidadeId: criada.id,
            acao: 'EMITIU',
            depois: {
              nome: `Etiqueta ${codigo} · ${o.fichaNomeSnapshot}`,
              origemDaEtiqueta: `Lote ${o.codigoLote}`,
              formatoDaEtiqueta: FORMATOS[e.formato].rotulo,
              quantasEtiquetas: e.quantas,
              ...(e.quantidadeMilesimos ? { quantidadePorEtiqueta: formatarQuantidade(e.quantidadeMilesimos, unidade) } : {}),
              validadeDaEtiqueta: o.validadeEm ? quandoNaTela(o.validadeEm) : 'não informada (o lote foi concluído sem validade)',
              ...(quemFez.nome ? { feitoPor: quemFez.nome } : {}),
            },
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: criada.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ o item comprado: abrir a embalagem

/** O insumo que se abre: comprado (o pré-preparo segue o lote produzido) e ativo. */
const SELECAO_DO_INSUMO = {
  id: true,
  nome: true,
  unidade: true,
  tipo: true,
  ativo: true,
  conservacao: true,
  marcaReferencia: true,
  validadeSecoMin: true,
  validadePistaFriaMin: true,
  validadeRefrigeradoMin: true,
  validadeCongeladoMin: true,
} as const;

/** Os prazos após abertura do insumo, por conservação (null = não informado). */
function prazosDoInsumo(i: { validadeSecoMin: number | null; validadePistaFriaMin: number | null; validadeRefrigeradoMin: number | null; validadeCongeladoMin: number | null }) {
  return Object.fromEntries(ORDEM_DAS_CONSERVACOES.map((c) => [c, prazoNaConservacao(i, c)])) as Record<Conservacao, number | null>;
}

export interface LoteParaAbrir {
  id: string;
  codigo: string | null;
  vencimento: string | null;
  fabricacao: string | null;
  marca: string | null;
  origem: 'RECEBIMENTO' | 'ABERTURA';
  registradoEm: Date;
  /** Só para quem vê compras naquela loja (nota e fornecedor). */
  nota: { id: string; rotulo: string; fornecedor: string | null; entradaEm: string } | null;
  vencido: boolean;
  notaCancelada: boolean;
  aberturas: number;
}

/**
 * O formulário "Abrir uma embalagem": os insumos comprados ativos (com os prazos após abertura de cada conservação) e, para o
 * insumo escolhido, os lotes dele nesta loja (do recebimento ou lidos antes na embalagem), do que vence antes para o que vence
 * depois. Nota e fornecedor só para quem vê compras na loja (decisão 1.5 do Guardião).
 */
export async function opcoesDeAbertura(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, insumoId: unknown, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      const comprados = await tx.insumo.findMany({ where: { ativo: true, tipo: { not: 'PRE_PREPARO' } }, orderBy: { nome: 'asc' }, select: SELECAO_DO_INSUMO });
      const escolhido = typeof insumoId === 'string' && ID.test(insumoId) ? comprados.find((i) => i.id === insumoId) ?? null : null;
      const hoje = hojeNoRio(agora);
      let lotes: LoteParaAbrir[] = [];
      if (escolhido) {
        const veCompras = pode(alcance, 'compras.ver', { lojaId });
        const lidos = await tx.loteDeInsumo.findMany({
          where: { lojaId, insumoId: escolhido.id },
          orderBy: [{ criadoEm: 'desc' }, { id: 'asc' }],
          take: 60,
          select: {
            id: true,
            codigo: true,
            vencimentoEm: true,
            fabricadoEm: true,
            marca: true,
            origem: true,
            criadoEm: true,
            nota: { select: { id: true, numero: true, serie: true, status: true, entradaEm: true, fornecedorNomeSnapshot: true } },
            _count: { select: { aberturas: true } },
          },
        });
        lotes = lidos
          .map((l) => ({
            id: l.id,
            codigo: l.codigo,
            vencimento: iso(l.vencimentoEm),
            fabricacao: iso(l.fabricadoEm),
            marca: l.marca,
            origem: l.origem as 'RECEBIMENTO' | 'ABERTURA',
            registradoEm: l.criadoEm,
            nota: l.nota && veCompras ? { id: l.nota.id, rotulo: `Nota ${numeroDaNota(l.nota)}`, fornecedor: l.nota.fornecedorNomeSnapshot, entradaEm: iso(l.nota.entradaEm)! } : null,
            vencido: !!l.vencimentoEm && iso(l.vencimentoEm)! < hoje,
            notaCancelada: l.nota?.status === 'CANCELADA',
            aberturas: l._count.aberturas,
          }))
          .sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') || b.registradoEm.getTime() - a.registradoEm.getTime());
      }
      // Em atalho: a chave "insumos" seguida de dois-pontos é o que a guarda do portão lê como a relação do parceiro.
      const insumos = comprados.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao, marcaReferencia: i.marcaReferencia, prazos: prazosDoInsumo(i) }));
      return {
        loja,
        hoje,
        insumos,
        escolhido: escolhido ? { id: escolhido.id, nome: escolhido.nome, unidade: escolhido.unidade as Unidade, conservacao: escolhido.conservacao as Conservacao, marcaReferencia: escolhido.marcaReferencia, prazos: prazosDoInsumo(escolhido) } : null,
        lotes,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type OpcoesDeAbertura = NonNullable<Awaited<ReturnType<typeof opcoesDeAbertura>>>;

/**
 * Registra a ABERTURA de uma embalagem (decisões 402 a 404): a hora é a do servidor (automática); a validade efetiva é o menor
 * entre o fim do dia do vencimento do lote e abertura + prazo após abertura na conservação escolhida; sem prazo, sem data;
 * lote vencido não abre. O lote vem da lista (`lote` = id), é lido agora na embalagem (`lote` = "novo", com código e/ou
 * vencimento) ou não é informado (`lote` = "sem"). Não mexe em saldo, livro nem nota. Idempotente pela chave do envio.
 */
export async function abrirEmbalagem(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { insumo: unknown; lote: unknown; codigo: unknown; vencimento: unknown; fabricacao: unknown; marca: unknown; conservacao: unknown; quanto: unknown; escala: unknown; envio: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
        if (alcance.nivel === 'FLOWFOODS' || !autor.userId) throw new Recusa({ ok: false, erros: { geral: NIVEL1_NAO_ABRE } });
        const chave = lerChaveDoEnvio(entrada.envio);
        if (!chave) throw new Recusa({ ok: false, erros: { geral: SEM_CHAVE } });
        await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:abertura:${tx.parceiroId}:${chave}`}, 0))::text AS "trava"`;
        const feita = await tx.aberturaDeLote.findFirst({ where: { chaveEnvio: chave }, select: { id: true, lojaId: true } });
        if (feita) {
          if (feita.lojaId !== lojaId) throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado: recarregue a tela e abra de novo.' } });
          return { ok: true as const, id: feita.id, jaFeito: true };
        }
        const insumoId = typeof entrada.insumo === 'string' && ID.test(entrada.insumo) ? entrada.insumo : null;
        const insumo = insumoId ? await tx.insumo.findFirst({ where: { id: insumoId }, select: SELECAO_DO_INSUMO }) : null;
        if (!insumo) throw new Recusa({ ok: false, erros: { insumo: 'Escolha o insumo que foi aberto.' } });
        if (insumo.tipo === 'PRE_PREPARO') throw new Recusa({ ok: false, erros: { insumo: 'Pré-preparo não se abre por aqui: a etiqueta dele vem do lote produzido.' } });
        if (!insumo.ativo) throw new Recusa({ ok: false, erros: { insumo: 'Este insumo está desativado. Reative em Insumos para registrar a abertura.' } });
        const unidade = insumo.unidade as Unidade;
        const ab = lerAbertura(entrada, unidade);
        if (!ab.ok) throw new Recusa({ ok: false, erros: ab.erros });
        const hoje = hojeNoRio(agora);

        // O lote: da lista, lido agora na embalagem, ou não informado.
        let lote: { id: string; codigo: string | null; vencimento: string | null; marca: string | null } | null = null;
        const qual = typeof entrada.lote === 'string' ? entrada.lote : '';
        if (qual === 'novo') {
          const lido = lerLote(entrada, { hoje, exigeAlgo: true });
          if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
          const novo = await tx.loteDeInsumo.create({
            data: {
              parceiroId: tx.parceiroId,
              lojaId,
              insumoId: insumo.id,
              origem: 'ABERTURA',
              insumoNomeSnapshot: insumo.nome,
              unidadeSnapshot: unidade,
              codigo: lido.lote.codigo,
              vencimentoEm: lido.lote.vencimento ? new Date(`${lido.lote.vencimento}T00:00:00.000Z`) : null,
              fabricadoEm: lido.lote.fabricacao ? new Date(`${lido.lote.fabricacao}T00:00:00.000Z`) : null,
              marca: lido.lote.marca,
              criadoPorNome: autor.nome,
              criadoPorUsuarioId: autor.userId ?? null,
              criadoEm: agora,
            },
            select: { id: true },
          });
          lote = { id: novo.id, codigo: lido.lote.codigo, vencimento: lido.lote.vencimento, marca: lido.lote.marca };
        } else if (qual && qual !== 'sem') {
          if (!ID.test(qual)) throw new Recusa({ ok: false, erros: { lote: 'Escolha o lote da lista, leia o da embalagem ou marque "lote não informado".' } });
          const [l] = await tx.sql<{ id: string; lojaId: string; insumoId: string; codigo: string | null; vencimentoEm: Date | null; marca: string | null; notaStatus: string | null }>`
            SELECT l."id", l."lojaId", l."insumoId", l."codigo", l."vencimentoEm", l."marca", n."status"::text AS "notaStatus"
            FROM "LoteDeInsumo" l LEFT JOIN "NotaEntrada" n ON n."parceiroId" = l."parceiroId" AND n."id" = l."notaId"
            WHERE l."parceiroId" = ${tx.parceiroId} AND l."id" = ${qual} FOR SHARE OF l`;
          if (!l || l.lojaId !== lojaId || l.insumoId !== insumo.id) throw new Recusa({ ok: false, erros: { lote: 'Este lote não é deste insumo nesta loja. Escolha outro.' } });
          if (l.notaStatus === 'CANCELADA') throw new Recusa({ ok: false, erros: { lote: 'A nota deste lote foi cancelada. Leia o lote na embalagem ou escolha outro.' } });
          lote = { id: l.id, codigo: l.codigo, vencimento: iso(l.vencimentoEm), marca: l.marca };
        } else if (qual !== 'sem') {
          throw new Recusa({ ok: false, erros: { lote: 'Diga de qual lote é a embalagem: da lista, lido agora na embalagem, ou "lote não informado".' } });
        }

        const prazo = prazoNaConservacao(insumo, ab.abertura.conservacao);
        const v = validadeDaAbertura({ abertoEm: agora, prazoMin: prazo, vencimentoLote: lote?.vencimento ?? null });
        if (!v.ok) throw new Recusa({ ok: false, erros: { lote: v.erro } });
        const criada = await tx.aberturaDeLote.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId,
            insumoId: insumo.id,
            loteId: lote?.id ?? null,
            insumoNomeSnapshot: insumo.nome,
            unidadeSnapshot: unidade,
            conservacao: ab.abertura.conservacao,
            abertoEm: agora,
            prazoAposAberturaMin: prazo,
            vencimentoLoteEm: lote?.vencimento ? new Date(`${lote.vencimento}T00:00:00.000Z`) : null,
            codigoLoteSnapshot: lote?.codigo ?? null,
            marcaSnapshot: lote?.marca ?? null,
            validadeEm: v.validadeEm,
            regraDaValidade: v.regra,
            quantidadeMilesimos: ab.abertura.quantidadeMilesimos,
            abertoPorNome: autor.nome,
            abertoPorUsuarioId: autor.userId ?? null,
            chaveEnvio: chave,
          },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'AberturaDeLote',
            entidadeId: criada.id,
            acao: 'ABRIU',
            depois: {
              nome: `${insumo.nome} · aberta em ${quandoNaTela(agora)}`,
              loja: loja.nome,
              conservacao: ab.abertura.conservacao,
              codigoDoLote: lote ? (lote.codigo ?? 'não informado') : 'lote não informado',
              vencimentoDoLote: lote?.vencimento ? diaPorExtenso(lote.vencimento) : 'não informado',
              prazoAposAbertura: prazo ? formatarValidade(prazo) : 'não informado',
              validadeEfetiva: v.validadeEm ? (v.regra === 'VENCIMENTO_DO_LOTE' ? `${diaPorExtenso(lote!.vencimento!)} (vencimento do lote)` : quandoNaTela(v.validadeEm)) : 'Prazo após abertura não informado',
              ...(ab.abertura.quantidadeMilesimos ? { quantoFoiAberto: formatarQuantidade(ab.abertura.quantidadeMilesimos, unidade) } : {}),
            },
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: criada.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

interface AberturaLida {
  id: string;
  lojaId: string;
  insumoId: string;
  insumoNomeSnapshot: string;
  unidadeSnapshot: string;
  conservacao: string;
  abertoEm: Date;
  prazoAposAberturaMin: number | null;
  vencimentoLoteEm: Date | null;
  codigoLoteSnapshot: string | null;
  marcaSnapshot: string | null;
  validadeEm: Date | null;
  regraDaValidade: string;
  quantidadeMilesimos: number | null;
  abertoPorNome: string;
  abertoPorUsuarioId: string | null;
}

async function lerAberturaGravada(tx: ClienteDoParceiro, lojaId: string, id: string): Promise<AberturaLida> {
  if (!ID.test(id)) throw naoEncontrado('Abertura');
  const a = await tx.aberturaDeLote.findFirst({
    where: { id, lojaId },
    select: {
      id: true,
      lojaId: true,
      insumoId: true,
      insumoNomeSnapshot: true,
      unidadeSnapshot: true,
      conservacao: true,
      abertoEm: true,
      prazoAposAberturaMin: true,
      vencimentoLoteEm: true,
      codigoLoteSnapshot: true,
      marcaSnapshot: true,
      validadeEm: true,
      regraDaValidade: true,
      quantidadeMilesimos: true,
      abertoPorNome: true,
      abertoPorUsuarioId: true,
    },
  });
  if (!a) throw naoEncontrado('Abertura');
  return a;
}

function conteudoDaAbertura(a: AberturaLida, loja: string, e: { mostrarHora: boolean; codigo: string }): ConteudoDaEtiqueta {
  const vencimento = iso(a.vencimentoLoteEm);
  return {
    origem: 'ABERTA',
    produto: a.insumoNomeSnapshot,
    conservacao: a.conservacao as Conservacao,
    quantidade: a.quantidadeMilesimos ? formatarQuantidade(a.quantidadeMilesimos, a.unidadeSnapshot as Unidade) : null,
    manipuladoEm: null,
    abertoEm: a.abertoEm,
    validade: a.regraDaValidade === 'VENCIMENTO_DO_LOTE' && vencimento ? { tipo: 'dia', dia: vencimento } : a.validadeEm ? { tipo: 'instante', em: a.validadeEm } : { tipo: 'nao-informada' },
    vencimentoLote: vencimento,
    lote: a.codigoLoteSnapshot,
    marca: a.marcaSnapshot,
    responsavel: a.abertoPorNome,
    loja,
    codigo: e.codigo,
    mostrarHora: e.mostrarHora,
  };
}

/** A tela de uma embalagem aberta: o que foi aberto, a validade efetiva e a regra, a prévia e as emissões. */
export async function aberturaParaEtiqueta(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, aberturaId: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      const a = await lerAberturaGravada(tx, lojaId, aberturaId);
      const vencimento = iso(a.vencimentoLoteEm);
      return {
        loja,
        hoje: hojeNoRio(agora),
        abertura: {
          id: a.id,
          nome: a.insumoNomeSnapshot,
          unidade: a.unidadeSnapshot as Unidade,
          conservacao: a.conservacao as Conservacao,
          abertoEm: a.abertoEm,
          prazoMin: a.prazoAposAberturaMin,
          vencimentoLote: vencimento,
          codigoLote: a.codigoLoteSnapshot,
          marca: a.marcaSnapshot,
          validadeEm: a.validadeEm,
          regra: a.regraDaValidade as RegraDaValidade,
          quanto: a.quantidadeMilesimos ? formatarQuantidade(a.quantidadeMilesimos, a.unidadeSnapshot as Unidade) : null,
          abertoPor: a.abertoPorNome,
          situacao: situacaoDaAbertura(a, agora),
        },
        /** Rodada 1 (decisão 417): a embalagem vencida não emite etiqueta nova. */
        motivo: venceu(limiteDeUso(a.validadeEm, vencimento), agora)
          ? fraseDoVencido({ origem: 'ABERTA', validadeEm: limiteDeUso(a.validadeEm, vencimento)!, porDia: a.regraDaValidade === 'VENCIMENTO_DO_LOTE' || !a.validadeEm ? vencimento : null })
          : null,
        previa: conteudoDaAbertura(a, loja.nome, { mostrarHora: true, codigo: codigoDaEtiqueta(diaNoRio(agora), 0) }),
        emissoes: await emissoesDe(tx, { aberturaId: a.id }),
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type AberturaParaEtiqueta = NonNullable<Awaited<ReturnType<typeof aberturaParaEtiqueta>>>;

/** Emite a etiqueta da embalagem aberta: o retrato da abertura (a validade efetiva nunca é recalculada). */
export async function emitirEtiquetaDaAbertura(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  aberturaId: string,
  entrada: { formato: unknown; quantas: unknown; hora: unknown; envio: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
        const chave = lerChaveDoEnvio(entrada.envio);
        if (!chave) throw new Recusa({ ok: false, erros: { geral: SEM_CHAVE } });
        const codigo = await proximoCodigo(tx, agora);
        const feita = await emissaoDaChave(tx, chave, lojaId, { aberturaId });
        if (feita) return { ok: true as const, id: feita, jaFeito: true };
        const a = await lerAberturaGravada(tx, lojaId, aberturaId);
        const limite = limiteDeUso(a.validadeEm, iso(a.vencimentoLoteEm));
        if (venceu(limite, agora)) {
          const porDia = a.regraDaValidade === 'VENCIMENTO_DO_LOTE' || !a.validadeEm ? iso(a.vencimentoLoteEm) : null;
          throw new Recusa({ ok: false, erros: { geral: fraseDoVencido({ origem: 'ABERTA', validadeEm: limite!, porDia }) }, conflito: true });
        }
        const lido = lerEmissaoDaAbertura(entrada);
        if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
        const e = lido.emissao;
        layoutOuRecusa(conteudoDaAbertura(a, loja.nome, { mostrarHora: e.mostrarHora, codigo }), e.formato);
        const criada = await tx.etiqueta.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId,
            codigo,
            insumoId: a.insumoId,
            aberturaId: a.id,
            nomeSnapshot: a.insumoNomeSnapshot,
            unidadeSnapshot: a.unidadeSnapshot as Unidade,
            quantidadeMilesimos: a.quantidadeMilesimos,
            conservacao: a.conservacao as Conservacao,
            loteFornecedor: a.codigoLoteSnapshot,
            abertoEm: a.abertoEm,
            validadeEm: a.validadeEm,
            validadeMinSnapshot: a.prazoAposAberturaMin,
            vencimentoLoteEm: a.vencimentoLoteEm,
            regraDaValidade: a.regraDaValidade as RegraDaValidade,
            marcaSnapshot: a.marcaSnapshot,
            responsavelNomeSnapshot: a.abertoPorNome,
            responsavelUsuarioId: a.abertoPorUsuarioId,
            lojaNomeSnapshot: loja.nome,
            formato: e.formato,
            quantas: e.quantas,
            mostrarHora: e.mostrarHora,
            versaoDoLayout: VERSAO_DO_LAYOUT,
            emitidaPorNome: autor.nome,
            emitidaPorUsuarioId: autor.userId ?? null,
            chaveEnvio: chave,
            impressaEm: agora,
          },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Etiqueta',
            entidadeId: criada.id,
            acao: 'EMITIU',
            depois: {
              nome: `Etiqueta ${codigo} · ${a.insumoNomeSnapshot}`,
              origemDaEtiqueta: `Embalagem aberta em ${quandoNaTela(a.abertoEm)}`,
              formatoDaEtiqueta: FORMATOS[e.formato].rotulo,
              quantasEtiquetas: e.quantas,
              validadeDaEtiqueta: a.validadeEm ? quandoNaTela(a.validadeEm) : 'Prazo após abertura não informado',
            },
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: criada.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ a emissão e os pedidos de impressão

export interface PedidoDeImpressao {
  id: string;
  sequencia: number;
  copias: number;
  transporte: Transporte;
  situacao: SituacaoDaImpressao;
  resolucao: Resolucao;
  erro: string | null;
  solicitadaEm: Date;
  solicitadaPorNome: string;
  concluidaEm: Date | null;
  /** "Já imprimi" (decisão 418): quem disse e quando. */
  confirmadaEm: Date | null;
  confirmadaPorNome: string | null;
}

const SELECAO_DO_PEDIDO = { id: true, sequencia: true, copias: true, transporte: true, situacao: true, resolucao: true, erro: true, solicitadaEm: true, solicitadaPorNome: true, concluidaEm: true, confirmadaEm: true, confirmadaPorNome: true } as const;

function pedidoParaTela(p: { id: string; sequencia: number; copias: number; transporte: string; situacao: string; resolucao: number; erro: string | null; solicitadaEm: Date; solicitadaPorNome: string; concluidaEm: Date | null; confirmadaEm: Date | null; confirmadaPorNome: string | null }): PedidoDeImpressao {
  return { ...p, transporte: p.transporte as Transporte, situacao: p.situacao as SituacaoDaImpressao, resolucao: lerResolucao(p.resolucao) };
}

/** Uma emissão: o retrato, a prévia (dos dois formatos não: do formato dela), os pedidos de impressão e de onde veio. */
export async function obterEmissao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, etiquetaId: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      if (!ID.test(etiquetaId)) throw naoEncontrado('Etiqueta');
      const e = await tx.etiqueta.findFirst({ where: { id: etiquetaId, lojaId, regraDaValidade: { not: null } }, select: SELECAO_DA_EMISSAO });
      if (!e) throw naoEncontrado('Etiqueta');
      const pedidos = await tx.etiquetaImpressao.findMany({ where: { etiquetaId: e.id }, orderBy: { sequencia: 'desc' }, select: SELECAO_DO_PEDIDO });
      const conteudo = conteudoDaEmissao(e);
      const ordem = e.ordemProducaoId ? await tx.ordemProducao.findFirst({ where: { id: e.ordemProducaoId }, select: { id: true, codigoLote: true, status: true, concluidaEm: true } }) : null;
      return {
        loja,
        hoje: hojeNoRio(agora),
        etiqueta: {
          id: e.id,
          codigo: e.codigo,
          formato: e.formato as Formato,
          quantas: e.quantas ?? 1,
          nome: e.nomeSnapshot,
          regra: e.regraDaValidade as RegraDaValidade | 'LOTE_PRODUZIDO' | 'LOTE_SEM_VALIDADE',
          validadeEm: e.validadeEm,
          situacao:
            e.regraDaValidade === 'PRAZO_NAO_INFORMADO'
              ? situacaoDaAbertura(e, agora)
              : situacaoDaValidade(e.validadeEm, agora, e.regraDaValidade === 'VENCIMENTO_DO_LOTE' ? iso(e.vencimentoLoteEm) : null),
          emitidaEm: e.impressaEm,
          emitidaPorNome: e.emitidaPorNome,
          quemFez: e.responsavelNomeSnapshot,
        },
        origem: e.ordemProducaoId
          ? { tipo: 'LOTE' as const, id: e.ordemProducaoId, codigo: e.loteProduzido, estornado: ordem?.status === 'CANCELADA' && !!ordem.concluidaEm }
          : { tipo: 'ABERTA' as const, id: e.aberturaId!, codigo: e.loteFornecedor, estornado: false },
        conteudo,
        layout: desenhoDaEmissao(e, 203),
        pedidos: pedidos.map(pedidoParaTela),
        /** Rodada 1: estornada ou vencida = não se imprime mais (Zebra, arquivo e papel). */
        bloqueio: await bloqueioDaEmissao(tx, e, agora),
        /** Ainda na fila "Esperando a impressora": a Zebra não aceitou nenhum envio e ninguém disse "Já imprimi". */
        naFila: !pedidos.some((p) => p.situacao === 'ENVIADA' || p.confirmadaEm),
        /** O pedido que o "Já imprimi" confirma: o último de arquivo, de papel ou da Zebra sem resposta. */
        aConfirmar: pedidos.find((p) => !p.confirmadaEm && (p.situacao === 'EXPORTADA' || p.situacao === 'PREPARADA'))?.id ?? null,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type EmissaoDaTela = NonNullable<Awaited<ReturnType<typeof obterEmissao>>>;

/**
 * O papel (A4) de um pedido de impressão em PAPEL: a emissão, quantas cópias e o retrato para o desenho. Só o pedido desta
 * emissão, desta loja, feito para o papel (o pedido é gravado antes de a tela abrir: abrir a página não grava nada).
 */
export async function papelDoPedido(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, etiquetaId: string, pedidoId: unknown, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      if (!ID.test(etiquetaId) || typeof pedidoId !== 'string' || !ID.test(pedidoId)) throw naoEncontrado('Etiqueta');
      const e = await tx.etiqueta.findFirst({ where: { id: etiquetaId, lojaId, regraDaValidade: { not: null } }, select: SELECAO_DA_EMISSAO });
      if (!e) throw naoEncontrado('Etiqueta');
      const p = await tx.etiquetaImpressao.findFirst({ where: { id: pedidoId, etiquetaId: e.id, transporte: 'PAPEL' }, select: SELECAO_DO_PEDIDO });
      if (!p) throw naoEncontrado('Impressão');
      const conteudo = conteudoDaEmissao(e);
      // Rodada 1 (Guardião I1): o papel de um pedido antigo não reabre a etiqueta de lote estornado nem a vencida.
      const bloqueio = await bloqueioDaEmissao(tx, e, agora);
      // Rodada 1 (decisão 418): abrir o papel não tira da fila; o "Já imprimi" desta tela tira.
      const saiu = await tx.etiquetaImpressao.count({ where: { etiquetaId: e.id, OR: [{ situacao: 'ENVIADA' }, { confirmadaEm: { not: null } }] } });
      // Bloqueada: a tela recebe só o porquê; nada para desenhar (nem o conteúdo, nem o layout).
      return {
        loja,
        etiqueta: { id: e.id, codigo: e.codigo, formato: e.formato as Formato, nome: e.nomeSnapshot },
        pedido: pedidoParaTela(p),
        conteudo: bloqueio ? null : conteudo,
        layout: bloqueio ? null : desenhoDaEmissao(e, 203),
        bloqueio,
        naFila: saiu === 0,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type PapelDoPedido = NonNullable<Awaited<ReturnType<typeof papelDoPedido>>>;

/** O ZPL da etiqueta de TESTE (dados fictícios, uma cópia): nada é gravado. */
export function zplDeTeste(formato: unknown, resolucao: unknown, agora = new Date()): { ok: true; zpl: string; nomeArquivo: string } | { ok: false; erro: string } {
  const f: Formato = formato === 'E60X60' ? 'E60X60' : 'E60X40';
  const l = montarEtiqueta(conteudoDeTeste(f, agora), f, lerResolucao(resolucao));
  if (l.erro) return { ok: false, erro: l.erro };
  return { ok: true, zpl: zplDoLayout(l, 1), nomeArquivo: `etiqueta-teste-${f === 'E60X40' ? '60x40' : '60x60'}.zpl` };
}

export type ResultadoDoPedido =
  | { ok: true; id: string; sequencia: number; zpl: string; nomeArquivo: string; situacao: SituacaoDaImpressao; jaFeito?: true }
  | { ok: false; erros: Record<string, string>; conflito?: boolean; naoEncontrado?: boolean };

/**
 * Pede uma impressão de uma emissão (primeira ou reimpressão, do MESMO retrato): grava o pedido ANTES do envio (Browser Print =
 * PREPARADA; arquivo e papel = "arquivo gerado", que não é impressão) e devolve o ZPL com as cópias. A sequência sai sob a
 * trava da emissão (FOR UPDATE); a chave do envio faz o duplo clique devolver o MESMO pedido (sem duplicar o envio).
 */
export async function pedirImpressao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  etiquetaId: string,
  entrada: { copias: unknown; transporte: unknown; resolucao: unknown; envio: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoDoPedido> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
        if (!ID.test(etiquetaId)) throw naoEncontrado('Etiqueta');
        const chave = lerChaveDoEnvio(entrada.envio);
        if (!chave) throw new Recusa({ ok: false, erros: { geral: SEM_CHAVE } });
        if (!ehTransporte(entrada.transporte)) throw new Recusa({ ok: false, erros: { geral: 'Como imprimir: Zebra, arquivo .zpl ou papel.' } });
        const transporte = entrada.transporte;
        const copias = lerCopias(entrada.copias);
        if (!copias.ok) throw new Recusa({ ok: false, erros: { copias: copias.erro } });
        const resolucao = lerResolucao(entrada.resolucao);
        const [travada] = await tx.sql<{ id: string }>`SELECT "id" FROM "Etiqueta" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${etiquetaId} AND "lojaId" = ${lojaId} AND "regraDaValidade" IS NOT NULL FOR UPDATE`;
        if (!travada) throw naoEncontrado('Etiqueta');
        const e = await tx.etiqueta.findFirst({ where: { id: etiquetaId }, select: SELECAO_DA_EMISSAO });
        if (!e) throw naoEncontrado('Etiqueta');
        // O lote estornado depois da emissão saiu do estoque, e a etiqueta vencida não serve: não se imprime mais (decisão 417).
        const bloqueio = await bloqueioDaEmissao(tx, e, agora);
        if (bloqueio) throw new Recusa({ ok: false, erros: { geral: bloqueio }, conflito: true });
        const desenho = desenhoDaEmissao(e, 203);
        if (desenho.erro) throw new Recusa({ ok: false, erros: { geral: desenho.erro }, conflito: true });
        const zplDe = (n: number, res: Resolucao) => zplDaEmissao(e, n, res);
        const repetido = await tx.etiquetaImpressao.findFirst({ where: { chaveEnvio: chave }, select: { ...SELECAO_DO_PEDIDO, etiquetaId: true } });
        if (repetido) {
          if (repetido.etiquetaId !== e.id) throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado em outra etiqueta: recarregue a tela.' } });
          return { ok: true as const, id: repetido.id, sequencia: repetido.sequencia, zpl: zplDe(repetido.copias, lerResolucao(repetido.resolucao)), nomeArquivo: nomeDoArquivo(e.codigo), situacao: repetido.situacao as SituacaoDaImpressao, jaFeito: true as const };
        }
        const [{ proxima }] = await tx.sql<{ proxima: number }>`SELECT (coalesce(max("sequencia"), 0) + 1)::int AS "proxima" FROM "EtiquetaImpressao" WHERE "parceiroId" = ${tx.parceiroId} AND "etiquetaId" = ${e.id}`;
        const zpl = zplDe(copias.copias, resolucao);
        const situacao: SituacaoDaImpressao = transporte === 'BROWSER_PRINT' ? 'PREPARADA' : 'EXPORTADA';
        const criado = await tx.etiquetaImpressao.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId,
            etiquetaId: e.id,
            sequencia: proxima,
            copias: copias.copias,
            transporte,
            situacao,
            resolucao,
            solicitadaEm: agora,
            solicitadaPorNome: autor.nome,
            solicitadaPorUsuarioId: autor.userId ?? null,
            concluidaEm: situacao === 'PREPARADA' ? null : agora,
            chaveEnvio: chave,
          },
          select: { id: true },
        });
        return { ok: true as const, id: criado.id, sequencia: proxima, zpl, nomeArquivo: nomeDoArquivo(e.codigo), situacao };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

/**
 * O resultado do envio pela Zebra, dito pelo navegador: ENVIADA (o aplicativo aceitou; não é prova de papel) ou FALHOU (com o
 * porquê; sem resposta também é falha, e pode ter saído). Só uma vez, de PREPARADA para o resultado; repetir o mesmo = "já
 * feito"; outro resultado depois = conflito. Reenviar é um pedido NOVO, por clique.
 */
export async function resultadoDaImpressao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  pedidoId: string,
  entrada: { resultado: unknown; erro: unknown },
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      if (!ID.test(pedidoId)) throw naoEncontrado('Impressão');
      const resultado = entrada.resultado === 'ENVIADA' || entrada.resultado === 'FALHOU' ? entrada.resultado : null;
      if (!resultado) throw new Recusa({ ok: false, erros: { geral: 'Resultado desconhecido.' } });
      const [p] = await tx.sql<{ id: string; lojaId: string; situacao: string; transporte: string; confirmada: boolean }>`
        SELECT "id", "lojaId", "situacao"::text AS "situacao", "transporte"::text AS "transporte", "confirmadaEm" IS NOT NULL AS "confirmada" FROM "EtiquetaImpressao"
        WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${pedidoId} FOR UPDATE`;
      if (!p || p.lojaId !== lojaId) throw naoEncontrado('Impressão');
      if (p.transporte !== 'BROWSER_PRINT') throw new Recusa({ ok: false, erros: { geral: 'Só o envio pela Zebra tem resultado a registrar.' } });
      if (p.situacao === resultado) return { ok: true as const, id: p.id, jaFeito: true };
      if (p.confirmada) throw new Recusa({ ok: false, erros: { geral: 'Alguém já disse que esta etiqueta saiu (“Já imprimi”). Para imprimir de novo, faça um pedido novo.' }, conflito: true });
      if (p.situacao !== 'PREPARADA') {
        throw new Recusa({ ok: false, erros: { geral: `Este pedido já ficou como “${ROTULO_DA_SITUACAO[p.situacao as SituacaoDaImpressao].toLowerCase()}”. Para tentar de novo, faça um pedido novo.` }, conflito: true });
      }
      const erro = resultado === 'FALHOU' ? limparTexto(entrada.erro).slice(0, 300) || 'Sem resposta da impressora.' : null;
      await tx.etiquetaImpressao.update({ where: { id: p.id }, data: { situacao: resultado, erro, concluidaEm: agora } });
      return { ok: true as const, id: p.id };
    }),
  );
}

/**
 * "Já imprimi" (rodada 1, decisão 418): a pessoa diz que a etiqueta saiu no papel — depois de baixar o arquivo, abrir o papel ou
 * de a Zebra não responder. Grava quem e quando no último pedido ainda sem resultado da Zebra; a etiqueta sai da fila. Uma vez
 * só (de novo = "já feito"). Estornada ou vencida não confirma (não deveria ter saído).
 */
export async function confirmarImpressao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, etiquetaId: string, autor: Autor, agora = new Date()): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      if (!ID.test(etiquetaId)) throw naoEncontrado('Etiqueta');
      const [travada] = await tx.sql<{ id: string }>`SELECT "id" FROM "Etiqueta" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${etiquetaId} AND "lojaId" = ${lojaId} AND "regraDaValidade" IS NOT NULL FOR UPDATE`;
      if (!travada) throw naoEncontrado('Etiqueta');
      const e = (await tx.etiqueta.findFirst({ where: { id: etiquetaId }, select: SELECAO_DA_EMISSAO }))!;
      // Rodada final (Guardião): os pedidos são lidos TRAVADOS — a resposta da Zebra que chega junto termina antes, e aqui se
      // vê o resultado dela (a Zebra aceitou = "já feito"), em vez de confirmar um pedido que acabou de virar "enviada".
      const pedidos = await tx.sql<{ id: string; situacao: string; confirmada: boolean }>`
        SELECT "id", "situacao"::text AS "situacao", "confirmadaEm" IS NOT NULL AS "confirmada" FROM "EtiquetaImpressao"
        WHERE "parceiroId" = ${tx.parceiroId} AND "etiquetaId" = ${etiquetaId} ORDER BY "sequencia" DESC FOR UPDATE`;
      const feito = pedidos.find((p) => p.situacao === 'ENVIADA' || p.confirmada);
      if (feito) return { ok: true as const, id: feito.id, jaFeito: true };
      const bloqueio = await bloqueioDaEmissao(tx, e, agora);
      if (bloqueio) throw new Recusa({ ok: false, erros: { geral: bloqueio }, conflito: true });
      const alvo = pedidos.find((p) => p.situacao === 'EXPORTADA' || p.situacao === 'PREPARADA');
      if (!alvo) throw new Recusa({ ok: false, erros: { geral: 'Peça a impressão primeiro (Zebra, arquivo ou papel); depois diga que saiu.' } });
      // Só confirma o pedido que ainda está sem resultado e sem confirmação (o banco relê a linha na hora de gravar).
      const { count } = await tx.etiquetaImpressao.updateMany({
        where: { id: alvo.id, confirmadaEm: null, situacao: { in: ['EXPORTADA', 'PREPARADA'] } },
        data: { confirmadaEm: agora, confirmadaPorNome: autor.nome, confirmadaPorUsuarioId: autor.userId ?? null },
      });
      if (count !== 1) throw new Recusa({ ok: false, erros: { geral: 'A impressora respondeu agora mesmo: veja a etiqueta de novo.' }, conflito: true });
      return { ok: true as const, id: alvo.id };
    }),
  );
}

// ================================================================ o histórico

export const PEDIDOS_POR_PAGINA = 25;

/**
 * O histórico de impressões da loja no período: cada pedido (primeira ou reimpressão), quantas cópias, como (Zebra, arquivo,
 * papel), o resultado SEM fingir ("enviada" não é "saiu no papel"), quem pediu e quem fez/abriu. Os totais separam PEDIDOS de
 * ETIQUETAS (soma das cópias) e as que a Zebra aceitou das que só viraram arquivo (Kairu: total de trabalhos não é total de etiquetas).
 */
export async function historicoDeImpressoes(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  q: { periodo?: unknown; de?: unknown; ate?: unknown; origem?: unknown; pagina?: unknown },
  agora = new Date(),
) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'etiquetas.imprimir');
      const hoje = hojeNoRio(agora);
      const periodo: PeriodoDoHistorico = lerPeriodoDoHistorico(q, hoje);
      const inicio = inicioDoDiaNoRio(periodo.de);
      const fim = fimDoVencimento(periodo.ate);
      const origem = q.origem === 'lote' || q.origem === 'aberta' ? q.origem : null;
      const daOrigem = origem ? (origem === 'lote' ? { ordemProducaoId: { not: null } } : { aberturaId: { not: null } }) : {};
      const where = {
        lojaId,
        solicitadaEm: { gte: inicio, lt: fim },
        ...(origem ? { etiqueta: daOrigem } : {}),
      };
      const total = await tx.etiquetaImpressao.count({ where });
      const porSituacao = await tx.etiquetaImpressao.groupBy({ by: ['situacao'], where, _count: { _all: true }, _sum: { copias: true } });
      const confirmadas = await tx.etiquetaImpressao.aggregate({ where: { ...where, confirmadaEm: { not: null } }, _sum: { copias: true } });
      const semResultado = await tx.etiquetaImpressao.count({ where: { ...where, situacao: 'PREPARADA', confirmadaEm: null } });
      // Rodada final (UX 6): etiquetas com arquivo baixado ou papel aberto que ninguém confirmou e que a Zebra não recebeu.
      const esperandoConfirmacao = await tx.etiquetaImpressao.findMany({
        where: {
          ...where,
          situacao: 'EXPORTADA',
          confirmadaEm: null,
          etiqueta: { ...daOrigem, impressoes: { none: { OR: [{ situacao: 'ENVIADA' }, { confirmadaEm: { not: null } }] } } },
        },
        distinct: ['etiquetaId'],
        select: { etiquetaId: true },
      });
      const paginas = Math.max(1, Math.ceil(total / PEDIDOS_POR_PAGINA));
      const pedida = typeof q.pagina === 'string' && /^\d{1,7}$/.test(q.pagina) ? Number(q.pagina) : 1;
      const pagina = Math.min(Math.max(1, pedida), paginas);
      const linhas = await tx.etiquetaImpressao.findMany({
        where,
        orderBy: [{ solicitadaEm: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * PEDIDOS_POR_PAGINA,
        take: PEDIDOS_POR_PAGINA,
        select: {
          ...SELECAO_DO_PEDIDO,
          etiqueta: { select: { id: true, codigo: true, nomeSnapshot: true, ordemProducaoId: true, loteProduzido: true, loteFornecedor: true, responsavelNomeSnapshot: true, formato: true } },
        },
      });
      const soma = (s: SituacaoDaImpressao) => porSituacao.find((x) => x.situacao === s);
      return {
        loja,
        hoje,
        periodo,
        rotuloDoPeriodo: rotuloDoPeriodo(periodo, hoje),
        origem,
        pagina,
        paginas,
        total,
        totais: {
          pedidos: total,
          etiquetas: porSituacao.reduce((s, x) => s + (x._sum.copias ?? 0), 0),
          enviadas: soma('ENVIADA')?._sum.copias ?? 0,
          arquivos: soma('EXPORTADA')?._sum.copias ?? 0,
          falharam: soma('FALHOU')?._count._all ?? 0,
          semResultado,
          /** "Já imprimi": cópias que a pessoa disse que saíram (arquivo, papel ou Zebra sem resposta). */
          confirmadas: confirmadas._sum.copias ?? 0,
          /** Etiquetas com arquivo ou papel pedido e ainda sem o "Já imprimi" (nem a Zebra recebeu). */
          esperandoConfirmacao: esperandoConfirmacao.length,
        },
        linhas: linhas.map((l) => ({
          ...pedidoParaTela(l),
          reimpressao: l.sequencia > 1,
          etiqueta: {
            id: l.etiqueta.id,
            codigo: l.etiqueta.codigo,
            nome: l.etiqueta.nomeSnapshot,
            origem: l.etiqueta.ordemProducaoId ? ('LOTE' as const) : ('ABERTA' as const),
            lote: l.etiqueta.ordemProducaoId ? l.etiqueta.loteProduzido : l.etiqueta.loteFornecedor,
            quemFez: l.etiqueta.responsavelNomeSnapshot,
            formato: l.etiqueta.formato as Formato,
          },
        })),
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type HistoricoDeImpressoes = NonNullable<Awaited<ReturnType<typeof historicoDeImpressoes>>>;

export const rotuloDoTransporte = (t: Transporte) => ROTULO_DO_TRANSPORTE[t];

// ================================================================ o lote do fornecedor no recebimento (a nota)

/** Uma sugestão do XML (o `rastro` do item ligado ao insumo): a pessoa confirma; nada entra sozinho. */
export interface SugestaoDoXml {
  codigo: string;
  vencimento: string | null;
  fabricacao: string | null;
  quantidade: string | null;
  item: string;
}

/**
 * A tela "Lote e vencimento" de uma nota lançada: os insumos dela, os lotes já registrados (por insumo) e, quando a nota veio
 * do XML (ou foi ligada a ele), o `rastro` que o fornecedor declarou, como sugestão. `compras.ver` na loja da nota para ver;
 * `compras.lancar` para registrar e tirar. Nota de outra loja ou parceiro: null (404).
 */
export async function lotesDaNota(cliente: ClienteDoParceiro, alcance: Alcance, notaId: string) {
  return cliente.transacao(async (tx) => {
    if (!ID.test(notaId)) return null;
    const n = await tx.notaEntrada.findFirst({
      where: { id: notaId, lojaId: filtroDeLojas(alcance) },
      select: {
        id: true,
        numero: true,
        serie: true,
        status: true,
        entradaEm: true,
        lojaId: true,
        loja: { select: { nome: true } },
        fornecedorNomeSnapshot: true,
        itens: { orderBy: { ordem: 'asc' }, select: { insumoId: true, insumoNomeSnapshot: true, unidadeSnapshot: true, embalagemSnapshot: true, quantidadeMilesimos: true, insumo: { select: { tipo: true } } } },
      },
    });
    if (!n || !pode(alcance, 'compras.ver', { lojaId: n.lojaId })) return null;
    const lotes = await tx.loteDeInsumo.findMany({
      where: { notaId: n.id },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: { id: true, insumoId: true, codigo: true, vencimentoEm: true, fabricadoEm: true, marca: true, sugeridoPeloXml: true, criadoEm: true, criadoPorNome: true, _count: { select: { aberturas: true } } },
    });
    // Insumos da nota (um por insumo, somando as linhas): é por insumo que o lote se registra.
    // Rodada 1 (Guardião M4): pré-preparo (até um "solto", sem ficha) não tem lote de fornecedor: a tela diz e não oferece o formulário.
    const porInsumo = new Map<string, { id: string; nome: string; unidade: Unidade; quantidadeMilesimos: number; embalagens: string[]; prePreparo: boolean }>();
    for (const i of n.itens) {
      if (!i.insumoId) continue;
      const atual = porInsumo.get(i.insumoId) ?? { id: i.insumoId, nome: i.insumoNomeSnapshot ?? '?', unidade: (i.unidadeSnapshot ?? 'UN') as Unidade, quantidadeMilesimos: 0, embalagens: [], prePreparo: i.insumo?.tipo === 'PRE_PREPARO' };
      atual.quantidadeMilesimos += i.quantidadeMilesimos;
      if (i.embalagemSnapshot && !atual.embalagens.includes(i.embalagemSnapshot)) atual.embalagens.push(i.embalagemSnapshot);
      porInsumo.set(i.insumoId, atual);
    }
    // O XML guardado (F.1b): o rastro de cada item ligado a um insumo desta nota.
    const sugestoes = new Map<string, SugestaoDoXml[]>();
    const semInsumo: SugestaoDoXml[] = [];
    const doc = await tx.documentoFiscal.findFirst({ where: { notaEntradaId: n.id }, select: { xml: true, itens: { select: { nItem: true, insumoId: true, descricao: true, unidadeComercial: true } } } });
    if (doc) {
      const rastros = rastrosDoXmlGuardado(doc.xml);
      for (const it of doc.itens) {
        for (const r of rastros.get(it.nItem) ?? []) {
          const s: SugestaoDoXml = {
            codigo: limparTexto(r.nLote).slice(0, 40),
            vencimento: r.dVal,
            fabricacao: r.dFab,
            quantidade: r.qLoteMilesimos ? `${(r.qLoteMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${it.unidadeComercial}` : null,
            item: it.descricao,
          };
          if (it.insumoId && porInsumo.has(it.insumoId)) {
            const ja = lotes.some((l) => l.insumoId === it.insumoId && l.codigo === s.codigo && iso(l.vencimentoEm) === s.vencimento);
            if (!ja) sugestoes.set(it.insumoId, [...(sugestoes.get(it.insumoId) ?? []), s]);
          } else semInsumo.push(s);
        }
      }
    }
    const insumos = [...porInsumo.values()].map((i) => ({
      ...i,
      quantidade: formatarQuantidade(i.quantidadeMilesimos, i.unidade),
      lotes: lotes
        .filter((l) => l.insumoId === i.id)
        .map((l) => ({ id: l.id, codigo: l.codigo, vencimento: iso(l.vencimentoEm), fabricacao: iso(l.fabricadoEm), marca: l.marca, doXml: l.sugeridoPeloXml, registradoEm: l.criadoEm, registradoPor: l.criadoPorNome, aberturas: l._count.aberturas })),
      sugestoes: sugestoes.get(i.id) ?? [],
    }));
    return {
      id: n.id,
      rotulo: `Nota ${numeroDaNota(n)}`,
      lojaId: n.lojaId,
      loja: n.loja.nome,
      fornecedor: n.fornecedorNomeSnapshot,
      entradaEm: iso(n.entradaEm)!,
      cancelada: n.status === 'CANCELADA',
      lancada: n.status === 'LANCADA',
      doXml: !!doc,
      insumos,
      /** Lotes registrados para um insumo que saiu da nota numa edição (o registro fica; a nota manda). */
      foraDaNota: lotes.filter((l) => !porInsumo.has(l.insumoId)).length,
      semInsumo,
    };
  });
}

export type LotesDaNota = NonNullable<Awaited<ReturnType<typeof lotesDaNota>>>;

/** Quantos lotes do fornecedor a nota já tem (o detalhe da nota diz, sem abrir a tela). */
export async function contarLotesDaNota(cliente: ClienteDoParceiro, notaId: string): Promise<number> {
  if (!ID.test(notaId)) return 0;
  return cliente.transacao((tx) => tx.loteDeInsumo.count({ where: { notaId } }));
}

/** A nota travada para registrar ou tirar lote: lançada, da loja do alcance, com `compras.lancar` nela. */
async function notaParaLote(tx: ClienteDoParceiro, alcance: Alcance, notaId: string) {
  if (!ID.test(notaId)) throw new Recusa({ ok: false, erros: { geral: 'Nota não encontrada.' }, naoEncontrado: true });
  const [n] = await tx.sql<{ id: string; lojaId: string; status: string; numero: string | null; serie: string }>`
    SELECT "id", "lojaId", "status"::text AS "status", "numero", "serie" FROM "NotaEntrada" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${notaId} FOR SHARE`;
  if (!n || !pode(alcance, 'compras.ver', { lojaId: n.lojaId })) throw new Recusa({ ok: false, erros: { geral: 'Nota não encontrada.' }, naoEncontrado: true });
  await lojaDoAlcance(tx, alcance, n.lojaId, 'compras.lancar');
  // Um registro de lote por vez na nota (o "já registrado" se confere depois da trava).
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:lote-da-nota:${tx.parceiroId}:${n.id}`}, 0))::text AS "trava"`;
  return n;
}

/**
 * Registra o lote do fornecedor de um insumo da nota (decisão 406): código, vencimento, fabricação e marca, como estão na
 * embalagem (pelo menos o código ou o vencimento). A nota não muda. O mesmo lote (código e vencimento) duas vezes no mesmo
 * insumo da nota = "já registrado". `xml` marca que a pessoa aceitou a sugestão do rastro (conferido contra o XML guardado).
 */
export async function registrarLoteDaNota(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  notaId: string,
  entrada: { insumo: unknown; codigo: unknown; vencimento: unknown; fabricacao: unknown; marca: unknown; envio: unknown; xml?: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const n = await notaParaLote(tx, alcance, notaId);
        const chave = lerChaveDoEnvio(entrada.envio);
        if (chave) {
          const feito = await tx.loteDeInsumo.findFirst({ where: { chaveEnvio: chave }, select: { id: true, notaId: true } });
          if (feito) {
            if (feito.notaId !== n.id) throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado: recarregue a tela.' } });
            return { ok: true as const, id: feito.id, jaFeito: true };
          }
        }
        if (n.status !== 'LANCADA') throw new Recusa({ ok: false, erros: { geral: 'Esta nota está cancelada: o lote se registra na nota que vale.' }, conflito: true });
        const insumoId = typeof entrada.insumo === 'string' && ID.test(entrada.insumo) ? entrada.insumo : null;
        const item = insumoId ? await tx.notaEntradaItem.findFirst({ where: { notaId: n.id, insumoId }, select: { insumoId: true, insumoNomeSnapshot: true, unidadeSnapshot: true, insumo: { select: { nome: true, tipo: true } } } }) : null;
        if (!item || !item.insumoId) throw new Recusa({ ok: false, erros: { insumo: 'Este insumo não está nesta nota.' } });
        if (item.insumo?.tipo === 'PRE_PREPARO') throw new Recusa({ ok: false, erros: { geral: 'Pré-preparo não tem lote de fornecedor: a etiqueta dele vem do lote produzido.' } });
        const lido = lerLote(entrada, { hoje: hojeNoRio(agora), exigeAlgo: true });
        if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
        const l = lido.lote;
        const venc = l.vencimento ? new Date(`${l.vencimento}T00:00:00.000Z`) : null;
        const repetido = await tx.loteDeInsumo.findFirst({ where: { notaId: n.id, insumoId: item.insumoId, codigo: l.codigo, vencimentoEm: venc }, select: { id: true } });
        if (repetido) return { ok: true as const, id: repetido.id, jaFeito: true };
        // A sugestão do XML vale só se bate com o rastro guardado (o formulário não decide sozinho o que é "do XML").
        let doXml = false;
        if (entrada.xml === 'sim') {
          const doc = await tx.documentoFiscal.findFirst({ where: { notaEntradaId: n.id }, select: { xml: true, itens: { where: { insumoId: item.insumoId }, select: { nItem: true } } } });
          if (doc) {
            const rastros = rastrosDoXmlGuardado(doc.xml);
            doXml = doc.itens.some((it) => (rastros.get(it.nItem) ?? []).some((r) => limparTexto(r.nLote).slice(0, 40) === l.codigo && r.dVal === l.vencimento));
          }
        }
        const nome = item.insumo?.nome ?? item.insumoNomeSnapshot ?? '?';
        const criado = await tx.loteDeInsumo.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId: n.lojaId,
            insumoId: item.insumoId,
            notaId: n.id,
            origem: 'RECEBIMENTO',
            insumoNomeSnapshot: nome,
            unidadeSnapshot: (item.unidadeSnapshot ?? 'UN') as Unidade,
            codigo: l.codigo,
            vencimentoEm: venc,
            fabricadoEm: l.fabricacao ? new Date(`${l.fabricacao}T00:00:00.000Z`) : null,
            marca: l.marca,
            sugeridoPeloXml: doXml,
            criadoPorNome: autor.nome,
            criadoPorUsuarioId: autor.userId ?? null,
            chaveEnvio: chave,
            criadoEm: agora,
          },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'LoteDeInsumo',
            entidadeId: criado.id,
            acao: 'REGISTROU',
            depois: {
              nome: `${nome} · lote ${l.codigo ?? 'sem código'}`,
              notaDeCompra: `Nota ${numeroDaNota(n)}`,
              codigoDoLote: l.codigo ?? 'não informado',
              vencimentoDoLote: l.vencimento ? diaPorExtenso(l.vencimento) : 'não informado',
              ...(l.fabricacao ? { fabricacaoDoLote: diaPorExtenso(l.fabricacao) } : {}),
              ...(l.marca ? { marcaQueVeio: l.marca } : {}),
              ...(doXml ? { veioDoXml: 'sim (sugestão do rastro aceita)' } : {}),
            },
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: criado.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

/** Tira um lote registrado por engano: só se ninguém abriu embalagem dele (a FK das aberturas é o cinto). A nota não muda. */
export async function tirarLoteDaNota(cliente: ClienteDoParceiro, alcance: Alcance, notaId: string, loteId: unknown, autor: Autor): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const n = await notaParaLote(tx, alcance, notaId);
      const id = typeof loteId === 'string' && ID.test(loteId) ? loteId : null;
      const [l] = id
        ? await tx.sql<{ id: string; notaId: string | null; codigo: string | null; vencimentoEm: Date | null; insumoNomeSnapshot: string }>`
            SELECT "id", "notaId", "codigo", "vencimentoEm", "insumoNomeSnapshot" FROM "LoteDeInsumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`
        : [];
      if (!l || l.notaId !== n.id) return { ok: true as const, id: id ?? '', jaFeito: true };
      const aberturas = await tx.aberturaDeLote.count({ where: { loteId: l.id } });
      if (aberturas > 0) {
        throw new Recusa({ ok: false, erros: { geral: `Já abriram ${aberturas === 1 ? 'uma embalagem' : `${aberturas} embalagens`} deste lote: ele fica (a etiqueta e a validade dependem dele).` }, conflito: true });
      }
      await tx.loteDeInsumo.delete({ where: { id: l.id } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'LoteDeInsumo',
          entidadeId: l.id,
          acao: 'EXCLUIU',
          antes: { nome: `${l.insumoNomeSnapshot} · lote ${l.codigo ?? 'sem código'}`, notaDeCompra: `Nota ${numeroDaNota(n)}`, codigoDoLote: l.codigo ?? 'não informado', vencimentoDoLote: l.vencimentoEm ? formatarData(l.vencimentoEm) : 'não informado' },
          autorNome: autor.nome,
        },
      });
      return { ok: true as const, id: l.id };
    }),
  );
}

/** Para a tela da abertura e do lote: a frase do prazo de uma conservação ("3 dias depois de aberto" / "não informado"). */
export function fraseDoPrazo(prazos: Record<Conservacao, number | null>, c: Conservacao): string {
  const m = prazos[c];
  return m ? `${formatarValidade(m)} depois de aberto` : 'prazo após abertura não informado';
}

export const NOME_DA_CONSERVACAO = CONSERVACOES;
