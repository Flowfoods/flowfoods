/**
 * Contagem do dia a dia (1.7) — com banco, sem tela. Inventário cíclico por
 * LOJA (contar um pedaço por vez: o lugar e o que venceu pela frequência da
 * curva ABC), que fecha sozinho quando tudo bate e fecha sem aplicar quando
 * passa do prazo; conferência contado × esperado; ajuste no livro-razão
 * (`CONTAGEM` ±); e o fechamento do período com piso obrigatório de
 * cobertura (base do CMV real da 2.3, que não é feito aqui).
 *
 * Recebe sempre o `ClienteDoParceiro` (parceiro da sessão) e o `Alcance`:
 * ver = `estoque.ver`, contar = `estoque.contar`, planejar/concluir/descartar
 * /fechar = `estoque.ajustar`, todos com a loja; mudar as regras da loja
 * (piso, frequência, tolerância) = `lojas.gerir` (rede inteira): o gerente
 * não baixa o piso que o trava.
 *
 * Concorrência:
 * - planejar e começar o fechamento: trava da loja (`pg_advisory_xact_lock`);
 *   um insumo só fica em UMA contagem aberta por loja; o fechamento tem
 *   índice parcial único (loja × período);
 * - contar: a mesma regra da 1.6 (versão da contagem + do item), e o esperado
 *   é fotografado do livro a cada número salvo; fechar sozinha acontece na
 *   transação de quem salvou o último número;
 * - concluir: `FOR UPDATE` na contagem, versão conferida, idempotente; o
 *   ajuste é contado − esperado somado ao saldo de agora (o que entrou
 *   depois de contar continua lá); a cobertura do fechamento é conferida sob
 *   a mesma trava.
 */

import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { alcancaLoja, recusa, type Alcance } from './permissoes';
import { hojeNoRio } from './compra-campos';
import { listarHistorico } from './historico';
import {
  aberturasDe,
  comRecusa,
  contarItem,
  custosDeReferencia,
  gravarMovimentos,
  itemCongelado,
  lojaDoAlcance,
  MENSAGEM_LOJA_FORA,
  paraTela,
  Recusa,
  SELECAO_DO_ITEM,
  type ContagemDoItem,
  type ItemDaContagem,
  type ResultadoDoItem,
  type ResultadoEstoque,
} from './estoque';
import { quantidadeComSinal, resumoDaContagem, totalAcimaDoLimite, valorAcimaDoTeto, valorDaQuantidade, type TipoDeMovimento } from './estoque-campos';
import {
  ajustesDaContagem,
  coberturaDoPeriodo,
  curvaAbc,
  divergenciaDoItem,
  estadoDaContagem,
  fechaSozinha,
  fraseAbaixoDoPiso,
  janelaDoFechamento,
  lerRegras,
  periodoAnterior,
  periodoDaData,
  prazoDoCiclo,
  regrasDaLoja,
  situacaoDoItem,
  somaDasDivergencias,
  sugerido,
  type Classe,
  type Cobertura,
  type Divergencia,
  type EstadoDaContagem,
  type Periodo,
  type Quais,
  type RegrasDaContagem,
  type SituacaoDoItem,
  type TipoDePeriodo,
} from './contagem-campos';
import { CONSERVACOES, type Conservacao } from './validade';
import { formatarDinheiro, type Fracao, type Unidade } from './unidades';

const ID = /^[a-z0-9]{1,64}$/i;
const motivoLimpo = (t: unknown) => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null);
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');

/** Como o parceiro fecha o período (do `ParceiroFlow` do contexto). */
export interface ConfigDoPeriodo {
  periodoTipo: TipoDePeriodo;
  periodoDiaInicio: number;
}

/** Até quantos insumos num ciclo (uma contagem cabe numa ida à câmara). */
export const TETO_DO_CICLO = 500;

// ================================================================ apoio

const SELECAO_DAS_REGRAS = {
  contagemPisoValorBp: true,
  contagemPisoItensBp: true,
  contagemFreqADias: true,
  contagemFreqBDias: true,
  contagemFreqCDias: true,
  contagemToleranciaCentavos: true,
} as const;

async function regrasDe(tx: ClienteDoParceiro, lojaId: string): Promise<RegrasDaContagem> {
  const l = await tx.loja.findUnique({ where: { id: lojaId }, select: SELECAO_DAS_REGRAS });
  if (!l) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_LOJA_FORA }, naoEncontrado: true });
  return regrasDaLoja(l);
}

/** O estoque da loja precisa estar aberto (abertura concluída) para contagem do dia a dia. */
async function exigirAberto(tx: ClienteDoParceiro, loja: { id: string; nome: string }): Promise<Date> {
  const a = (await aberturasDe(tx, [loja.id])).get(loja.id);
  if (!a || a.status !== 'FECHADA' || !a.fechadaEm) {
    throw new Recusa({ ok: false, erros: { geral: `O estoque da ${loja.nome} ainda não foi aberto: a contagem do dia a dia começa depois da abertura.` } });
  }
  return a.fechadaEm;
}

/** Uma escrita de contagem por vez na loja (planejar, começar o fechamento). */
async function travarLoja(tx: ClienteDoParceiro, lojaId: string) {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:contagem:${tx.parceiroId}:${lojaId}`}, 0))::text AS "trava"`;
}

/** Início de um dia do Rio (UTC−3) como instante. */
const inicioDoDia = (iso: string) => new Date(`${iso}T03:00:00.000Z`);

/**
 * O período de agora (e o registro dele em `PeriodoApuracao`, se já existe).
 * PERSONALIZADO usa o cadastrado que contém a data; sem cadastro, o mês civil
 * (e a frase diz isso).
 */
async function periodoDe(tx: ClienteDoParceiro, cfg: ConfigDoPeriodo, data: string): Promise<{ periodo: Periodo; aviso: string | null }> {
  if (cfg.periodoTipo === 'PERSONALIZADO') {
    const p = await tx.periodoApuracao.findFirst({
      where: { inicio: { lte: new Date(`${data}T00:00:00.000Z`) }, fim: { gte: new Date(`${data}T00:00:00.000Z`) } },
      orderBy: { inicio: 'desc' },
      select: { inicio: true, fim: true, nome: true },
    });
    if (p) return { periodo: { inicio: p.inicio.toISOString().slice(0, 10), fim: p.fim.toISOString().slice(0, 10), nome: p.nome }, aviso: null };
    return { periodo: periodoDaData({ tipo: 'MENSAL', diaInicio: 1 }, data), aviso: 'Período personalizado sem cadastro para hoje: vale o mês civil.' };
  }
  return { periodo: periodoDaData({ tipo: cfg.periodoTipo, diaInicio: cfg.periodoDiaInicio }, data), aviso: null };
}

/** Contagens APLICADAS (abertura, cíclica, fechamento) por insumo na loja: a última data de cada um, ou só as do intervalo. */
async function contadosAplicados(tx: ClienteDoParceiro, lojaId: string, intervalo?: { de: Date; ate: Date }): Promise<Map<string, Date>> {
  const linhas = await tx.sql<{ insumoId: string; ultima: Date }>`
    SELECT ci."insumoId", max(ci."contadoEm") AS "ultima"
    FROM "ContagemItem" ci
    JOIN "Contagem" c ON c."parceiroId" = ci."parceiroId" AND c."id" = ci."contagemId"
    WHERE ci."parceiroId" = ${tx.parceiroId} AND c."lojaId" = ${lojaId}
      AND c."status" = 'FECHADA' AND c."desfecho" IN ('APLICADA', 'APLICADA_SOZINHA')
      AND ci."contadoMilesimos" IS NOT NULL
      AND (${intervalo ? intervalo.de.toISOString() : null}::timestamp IS NULL OR ci."contadoEm" >= ${intervalo ? intervalo.de.toISOString() : null}::timestamp)
      AND (${intervalo ? intervalo.ate.toISOString() : null}::timestamp IS NULL OR ci."contadoEm" < ${intervalo ? intervalo.ate.toISOString() : null}::timestamp)
    GROUP BY ci."insumoId"`;
  return new Map(linhas.map((l) => [l.insumoId, l.ultima]));
}

/** Insumos que estão numa contagem ABERTA da loja (não vencida), com o nome dela. */
async function emContagemAberta(tx: ClienteDoParceiro, lojaId: string, agora: Date, exceto?: string): Promise<Map<string, string>> {
  const itens = await tx.contagemItem.findMany({
    where: {
      contagem: {
        lojaId,
        status: 'ABERTA',
        tipo: { in: ['CICLICA', 'FECHAMENTO'] },
        OR: [{ fechaAutomaticoEm: null }, { fechaAutomaticoEm: { gte: agora } }],
        ...(exceto ? { id: { not: exceto } } : {}),
      },
    },
    select: { insumoId: true, contagem: { select: { titulo: true } } },
  });
  return new Map(itens.map((i) => [i.insumoId, i.contagem.titulo ?? 'outra contagem']));
}

/**
 * Fecha SEM aplicar as cíclicas da loja que passaram do prazo (nada vai ao
 * estoque; os números ficam como registro). Idempotente: só pega ABERTA.
 */
export async function vencerContagens(tx: ClienteDoParceiro, lojaId: string, agora: Date, so?: string): Promise<number> {
  const vencidas = await tx.sql<{ id: string; titulo: string | null; fechaAutomaticoEm: Date }>`
    UPDATE "Contagem"
    SET "status" = 'FECHADA', "desfecho" = 'VENCIDA', "fechadaEm" = "fechaAutomaticoEm", "fechadaPorNome" = 'Prazo', "versao" = "versao" + 1
    WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ${lojaId} AND "tipo" = 'CICLICA' AND "status" = 'ABERTA'
      AND "fechaAutomaticoEm" < ${agora.toISOString()}::timestamp
      AND (${so ?? null}::text IS NULL OR "id" = ${so ?? null}::text)
    RETURNING "id", "titulo", "fechaAutomaticoEm"`;
  for (const v of vencidas) {
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'Contagem',
        entidadeId: v.id,
        acao: 'VENCEU',
        antes: { nome: v.titulo ?? 'Contagem', situacao: 'Em contagem' },
        depois: { nome: v.titulo ?? 'Contagem', situacao: 'Fechou sem aplicar' },
        motivo: `Passou do prazo (${quando(v.fechaAutomaticoEm)}) sem ser aplicada: nada mudou no estoque.`,
        autorNome: 'Prazo',
      },
    });
  }
  return vencidas.length;
}

// ================================================================ regras da loja

/** As regras da contagem de uma loja (quem vê o estoque dela). */
export async function obterRegras(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      return { loja, regras: await regrasDe(tx, lojaId) };
    }),
  );
  return 'ok' in r ? null : r;
}

/**
 * Muda as regras da contagem da loja (piso, frequência, tolerância). Só com
 * "cadastrar lojas" (rede inteira) e a loja no alcance. Condicional aos
 * valores lidos (duas abas não se atropelam), histórico na mesma transação.
 */
export async function salvarRegras(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  form: Record<string, unknown>,
  lidas: RegrasDaContagem | null,
  autorNome = 'Sistema',
): Promise<ResultadoEstoque> {
  const lido = lerRegras(form);
  if (!lido.ok) return { ok: false, erros: lido.erros };
  const r = lido.regras;
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      if (!ID.test(lojaId) || !alcancaLoja(alcance, lojaId)) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_LOJA_FORA }, naoEncontrado: true });
      const negado = recusa(alcance, 'lojas.gerir');
      if (negado) throw new Recusa({ ok: false, erros: { geral: negado } });
      const loja = await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true, ...SELECAO_DAS_REGRAS } });
      if (!loja) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_LOJA_FORA }, naoEncontrado: true });
      const antes = regrasDaLoja(loja);
      // A trava de edição simultânea é obrigatória: sem as regras que a tela leu, não se grava (nunca "as de agora").
      if (!lidas) throw new Recusa({ ok: false, erros: { geral: 'Recarregue a página e confira as regras antes de salvar: não deu para saber o que você estava vendo.' }, conflito: true });
      const base = lidas;
      const mudou = await tx.loja.updateMany({
        where: {
          id: lojaId,
          contagemPisoValorBp: base.pisoValorBp,
          contagemPisoItensBp: base.pisoItensBp,
          contagemFreqADias: base.freqADias,
          contagemFreqBDias: base.freqBDias,
          contagemFreqCDias: base.freqCDias,
          contagemToleranciaCentavos: base.toleranciaCentavos,
        },
        data: {
          contagemPisoValorBp: r.pisoValorBp,
          contagemPisoItensBp: r.pisoItensBp,
          contagemFreqADias: r.freqADias,
          contagemFreqBDias: r.freqBDias,
          contagemFreqCDias: r.freqCDias,
          contagemToleranciaCentavos: r.toleranciaCentavos,
        },
      });
      if (mudou.count === 0) throw new Recusa({ ok: false, erros: { geral: 'Alguém mudou as regras desta loja agora há pouco. Recarregue e confira antes de salvar.' }, conflito: true });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'Loja', entidadeId: lojaId, acao: 'ALTEROU', antes: retratoDasRegras(loja.nome, antes), depois: retratoDasRegras(loja.nome, r), autorNome },
      });
      return { ok: true as const, id: lojaId };
    }),
  );
}

function retratoDasRegras(nome: string, r: RegrasDaContagem) {
  return {
    nome,
    pisoDoFechamento: `${r.pisoValorBp / 100} % do valor e ${r.pisoItensBp / 100} % dos insumos`,
    frequencia: `A a cada ${r.freqADias} dias · B ${r.freqBDias} · C ${r.freqCDias}`,
    tolerancia: formatarDinheiro(r.toleranciaCentavos),
  };
}

// ================================================================ planejar o ciclo

export interface LinhaDoPlanejamento {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
  ativo: boolean;
  classe: Classe;
  saldoMilesimos: number;
  valorCentavos: number | null;
  ultima: Date | null;
  situacao: SituacaoDoItem;
  venceEm: string | null;
  /** Nome da outra contagem aberta em que o insumo está (não pode entrar nesta). */
  emOutraContagem: string | null;
  sugerido: boolean;
}

export interface FiltroDoPlanejamento {
  conservacao: Conservacao | '';
  quais: Quais;
  /** Insumo pedido pelo link "Recontar" (vem marcado). */
  insumo?: string;
}

/** O que contar hoje: cada insumo da loja com a classe ABC, a última contagem, se venceu e se já vem marcado. */
export async function planejamentoDoCiclo(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, filtro: FiltroDoPlanejamento, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      const abertoEm = await exigirAberto(tx, loja);
      const regras = await regrasDe(tx, lojaId);
      const hoje = hojeNoRio(agora);
      const [insumos, saldos, ultimas, ocupados, fechamento] = await Promise.all([
        tx.insumo.findMany({ select: { id: true, nome: true, unidade: true, conservacao: true, ativo: true } }),
        tx.saldoEstoque.findMany({ where: { lojaId }, select: { insumoId: true, quantidadeMilesimos: true } }),
        contadosAplicados(tx, lojaId),
        emContagemAberta(tx, lojaId, agora),
        tx.contagem.findFirst({ where: { lojaId, tipo: 'FECHAMENTO', status: 'ABERTA' }, select: { id: true, titulo: true } }),
      ]);
      const saldoDe = new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos]));
      const universo = insumos.filter((i) => i.ativo || (saldoDe.get(i.id) ?? 0) !== 0);
      const custos = await custosDeReferencia(
        tx,
        universo.map((i) => i.id),
      );
      const valores = universo.map((i) => ({ insumoId: i.id, valorCentavos: valorDaQuantidade(custos.get(i.id)?.porUnidade ?? null, saldoDe.get(i.id) ?? 0) }));
      const valorDe = new Map(valores.map((v) => [v.insumoId, v.valorCentavos]));
      const classes = curvaAbc(valores);
      const linhas: LinhaDoPlanejamento[] = universo
        .map((i) => {
          const ultima = ultimas.get(i.id) ?? null;
          const classe = classes.get(i.id) ?? 'C';
          const s = situacaoDoItem(ultima ? hojeNoRio(ultima) : null, classe, regras, hoje);
          const emOutraContagem = ocupados.get(i.id) ?? null;
          const conservacao = i.conservacao as Conservacao;
          return {
            insumoId: i.id,
            nome: i.nome,
            unidade: i.unidade as Unidade,
            conservacao,
            ativo: i.ativo,
            classe,
            saldoMilesimos: saldoDe.get(i.id) ?? 0,
            valorCentavos: valorDe.get(i.id) ?? null,
            ultima,
            situacao: s.situacao,
            venceEm: s.venceEm,
            emOutraContagem,
            sugerido: filtro.insumo ? filtro.insumo === i.id && !emOutraContagem : sugerido({ conservacao, classe, situacao: s.situacao, emOutraContagem: !!emOutraContagem }, filtro),
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { loja, regras, hoje, abertoEm, linhas, fechamentoAberto: fechamento };
    }),
  );
  return 'ok' in r ? null : r;
}

export type PlanejamentoDoCiclo = NonNullable<Awaited<ReturnType<typeof planejamentoDoCiclo>>>;

/**
 * Começa um ciclo: congela a lista escolhida (nome, unidade, conservação,
 * embalagem padrão e o esperado de agora), prazo = fim do dia seguinte.
 * Recusa: loja não aberta, fechamento em andamento, insumo de outra
 * contagem aberta, lista vazia ou grande demais.
 */
export async function iniciarCiclo(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { insumoIds: unknown; titulo: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const ids = Array.isArray(entrada.insumoIds) ? Array.from(new Set(entrada.insumoIds.filter((x): x is string => typeof x === 'string' && ID.test(x)))) : [];
  if (ids.length === 0) return { ok: false, erros: { lista: 'Marque pelo menos um insumo para contar.' } };
  if (ids.length > TETO_DO_CICLO) return { ok: false, erros: { lista: `No máximo ${TETO_DO_CICLO} insumos por contagem: divida em duas.` } };
  const tituloDigitado = motivoLimpo(entrada.titulo)?.slice(0, 120) ?? null;
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
        await exigirAberto(tx, loja);
        await travarLoja(tx, lojaId);
        await vencerContagens(tx, lojaId, agora);
        const fechamento = await tx.contagem.findFirst({ where: { lojaId, tipo: 'FECHAMENTO', status: 'ABERTA' }, select: { titulo: true } });
        if (fechamento) throw new Recusa({ ok: false, erros: { geral: `O fechamento do período está em andamento (${fechamento.titulo ?? 'fechamento'}): conclua ou descarte antes de começar outra contagem.` } });
        const insumos = await tx.insumo.findMany({ where: { id: { in: ids } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, unidade: true, conservacao: true, conteudoMilesimos: true, tipo: true } });
        if (insumos.length !== ids.length) throw new Recusa({ ok: false, erros: { lista: 'Algum insumo marcado não existe mais. Recarregue a página.' } });
        const ocupados = await emContagemAberta(tx, lojaId, agora);
        const presos = insumos.filter((i) => ocupados.has(i.id));
        if (presos.length) {
          throw new Recusa({
            ok: false,
            erros: { lista: `Já estão em outra contagem aberta: ${presos.map((i) => `${i.nome} (${ocupados.get(i.id)})`).join(', ')}. Desmarque ou termine aquela antes.` },
            conflito: true,
          });
        }
        const saldos = await tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: ids } }, select: { insumoId: true, quantidadeMilesimos: true, valorCentavos: true } });
        const saldoDe = new Map(saldos.map((s) => [s.insumoId, s]));
        const lugares = Array.from(new Set(insumos.map((i) => i.conservacao)));
        const titulo = tituloDigitado ?? `${lugares.length === 1 ? CONSERVACOES[lugares[0] as Conservacao] : 'Vários lugares'} · ${insumos.length} ${insumos.length === 1 ? 'insumo' : 'insumos'}`;
        const hoje = hojeNoRio(agora);
        const c = await tx.contagem.create({
          data: {
            parceiroId: tx.parceiroId,
            lojaId,
            tipo: 'CICLICA',
            status: 'ABERTA',
            referenciaEm: new Date(`${hoje}T00:00:00.000Z`),
            fechaAutomaticoEm: prazoDoCiclo(hoje),
            iniciadaPorNome: autorNome,
            titulo,
            criadoEm: agora,
          },
          select: { id: true, fechaAutomaticoEm: true },
        });
        await tx.contagemItem.createMany({
          data: insumos.map((i) => itemCongelado(tx.parceiroId, c.id, { ...i, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao }, saldoDe.get(i.id))),
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Contagem',
            entidadeId: c.id,
            acao: 'INICIOU',
            depois: { nome: `${titulo} · ${loja.nome}`, itens: insumos.length, prazo: quando(c.fechaAutomaticoEm!) },
            autorNome,
          },
        });
        return { ok: true as const, id: c.id };
      },
      { timeout: 20_000 },
    ),
  );
}

// ================================================================ contar

/** Uma contagem da loja para contar e ver (abertura, cíclica ou fechamento). */
export async function obterContagem(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, contagemId: string, cfg: ConfigDoPeriodo, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      if (!ID.test(contagemId)) throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
      const c = await tx.contagem.findFirst({ where: { id: contagemId, lojaId }, select: SELECAO_DA_CONTAGEM });
      if (!c) throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
      const itens = (await tx.contagemItem.findMany({ where: { contagemId }, orderBy: { insumoNomeSnapshot: 'asc' }, select: SELECAO_DO_ITEM })).map(paraTela);
      const resumo = resumoDaContagem(itens);
      const estado = estadoDaContagem(c, resumo.naoContados, agora);
      // Fechamento: os de maior valor que levam ao piso vêm marcados.
      const paraOPiso = c.tipo === 'FECHAMENTO' && c.status === 'ABERTA' ? (await coberturaDaLoja(tx, lojaId, cfg, agora, c.id, c.periodo ?? undefined)).cobertura.paraOPiso : [];
      return { loja, contagem: c, estado, itens, resumo, paraOPiso };
    }),
  );
  return 'ok' in r ? null : r;
}

export type ContagemDaLoja = NonNullable<Awaited<ReturnType<typeof obterContagem>>>;

const SELECAO_DA_CONTAGEM = {
  id: true,
  tipo: true,
  status: true,
  desfecho: true,
  titulo: true,
  versao: true,
  criadoEm: true,
  referenciaEm: true,
  iniciadaPorNome: true,
  fechadaEm: true,
  fechadaPorNome: true,
  fechaAutomaticoEm: true,
  valorTotalCentavos: true,
  naoContadosNoFechamento: true,
  periodo: { select: { id: true, nome: true, inicio: true, fim: true } },
} as const;

/** Salvar o número de um item (operador conta: `estoque.contar`). Fecha sozinha quando tudo bate; vencida não aceita. */
export function contarNaContagem(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  contagemId: string,
  entrada: { itemId: unknown; embalagens: unknown; solto: unknown; escala: unknown; versao: unknown; idadeMs?: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoDoItem> {
  if (!ID.test(contagemId)) return Promise.resolve({ ok: false, erros: { geral: 'Contagem não encontrada. Recarregue a página.' } });
  return contarItem(cliente, alcance, lojaId, entrada, autorNome, {
    contagemId,
    agora,
    ganchos: {
      antes: async (tx, c, quandoSalva) => {
        if (c.tipo !== 'CICLICA' || !c.fechaAutomaticoEm || c.fechaAutomaticoEm.getTime() >= quandoSalva.getTime()) return null;
        await vencerContagens(tx, lojaId, quandoSalva, c.id);
        return `O prazo desta contagem acabou (${quando(c.fechaAutomaticoEm)}): ela fechou sem mexer no estoque e este número não entrou. Peça ao gerente outra contagem.`;
      },
      depois: (tx, c, quandoSalva, autor) => fecharSozinhaSePuder(tx, lojaId, c, quandoSalva, autor),
    },
  });
}

/**
 * Contou o último item de uma CÍCLICA e tudo bateu (dentro da tolerância, e
 * nada mexeu nos itens depois de contados)? Aplica agora, na transação de
 * quem salvou: é a regra que o gerente deixou (a tolerância da loja), não o
 * operador ajustando. Fora disso, nada acontece: o gerente confere.
 */
async function fecharSozinhaSePuder(tx: ClienteDoParceiro, lojaId: string, c: ContagemDoItem, agora: Date, autorNome: string): Promise<{ fechouSozinha: boolean }> {
  if (c.tipo !== 'CICLICA') return { fechouSozinha: false };
  const itens = await tx.contagemItem.findMany({ where: { contagemId: c.id }, select: SELECAO_PARA_APLICAR });
  if (itens.some((i) => i.contadoMilesimos === null)) return { fechouSozinha: false };
  const regras = await regrasDe(tx, lojaId);
  const { linhas } = await divergencias(tx, lojaId, itens, regras);
  if (!fechaSozinha(linhas.map((l) => l.div))) return { fechouSozinha: false };
  const loja = (await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true } }))!;
  const cab = (await tx.contagem.findUnique({ where: { id: c.id }, select: { id: true, tipo: true, titulo: true, periodoId: true } }))!;
  await aplicar(tx, loja, cab, itens, 'APLICADA_SOZINHA', `${autorNome} (fechou sozinha: tudo dentro da tolerância de ${formatarDinheiro(regras.toleranciaCentavos)})`, agora);
  return { fechouSozinha: true };
}

// ================================================================ conferir

const SELECAO_PARA_APLICAR = {
  ...SELECAO_DO_ITEM,
  saldoSistemaMilesimos: true,
  valorSistemaCentavos: true,
} as const;

type ItemParaAplicar = {
  id: string;
  insumoId: string;
  insumoNomeSnapshot: string;
  unidadeSnapshot: string;
  contadoMilesimos: number | null;
  contadoEm: Date | null;
  saldoSistemaMilesimos: number;
};

export interface MovimentoDepois {
  tipo: TipoDeMovimento;
  quantidadeMilesimos: number;
  motivo: string | null;
  notaId: string | null;
  estorno: boolean;
  ocorridoEm: Date;
}

/** Divergência de cada item contra o saldo de AGORA, com o que entrou/saiu depois de contado. */
async function divergencias<T extends ItemParaAplicar>(tx: ClienteDoParceiro, lojaId: string, itens: readonly T[], regras: RegrasDaContagem) {
  const insumoIds = itens.map((i) => i.insumoId);
  const [saldos, custos] = await Promise.all([
    tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: insumoIds } }, select: { insumoId: true, quantidadeMilesimos: true } }),
    custosDeReferencia(tx, insumoIds),
  ]);
  const atualDe = new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos]));
  const linhas = itens.map((i) => {
    const porUnidade: Fracao | null = custos.get(i.insumoId)?.porUnidade ?? null;
    const atual = atualDe.get(i.insumoId) ?? 0;
    return { item: i, porUnidade, atualMilesimos: atual, div: divergenciaDoItem({ contadoMilesimos: i.contadoMilesimos, esperadoMilesimos: i.saldoSistemaMilesimos, atualMilesimos: atual }, porUnidade, regras.toleranciaCentavos) };
  });
  return { linhas, custos };
}

export interface LinhaDaDivergencia {
  item: ItemDaContagem;
  conservacao: Conservacao;
  esperadoMilesimos: number;
  atualMilesimos: number;
  porUnidade: Fracao | null;
  div: Divergencia;
  /** Movimentos do insumo nesta loja depois que ele foi contado. */
  depois: MovimentoDepois[];
  /** Valor do contado pelo custo de referência (para o teto). */
  valorContadoCentavos: number | null;
}

/** A conferência de uma contagem cíclica ou de fechamento (quem vê: `estoque.ver`). */
export async function conferenciaDaContagem(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, contagemId: string, cfg: ConfigDoPeriodo, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      if (!ID.test(contagemId)) throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
      const c = await tx.contagem.findFirst({ where: { id: contagemId, lojaId, tipo: { in: ['CICLICA', 'FECHAMENTO'] } }, select: SELECAO_DA_CONTAGEM });
      if (!c) throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
      const regras = await regrasDe(tx, lojaId);
      const brutos = await tx.contagemItem.findMany({ where: { contagemId }, orderBy: { insumoNomeSnapshot: 'asc' }, select: SELECAO_PARA_APLICAR });
      const { linhas: base } = await divergencias(tx, lojaId, brutos, regras);
      const contados = brutos.filter((i) => i.contadoEm);
      const desde = contados.length ? new Date(Math.min(...contados.map((i) => i.contadoEm!.getTime()))) : null;
      const movs = desde
        ? await tx.movimentoEstoque.findMany({
            where: { lojaId, insumoId: { in: contados.map((i) => i.insumoId) }, ocorridoEm: { gt: desde }, OR: [{ contagemItemId: null }, { contagemItemId: { notIn: brutos.map((i) => i.id) } }] },
            orderBy: [{ ocorridoEm: 'asc' }, { criadoEm: 'asc' }],
            select: { insumoId: true, tipo: true, quantidadeMilesimos: true, motivo: true, notaId: true, estornoDeId: true, ocorridoEm: true },
          })
        : [];
      const linhas: LinhaDaDivergencia[] = base.map((l) => {
        const t = paraTela(l.item);
        return {
          item: t,
          conservacao: t.conservacao,
          esperadoMilesimos: l.item.saldoSistemaMilesimos,
          atualMilesimos: l.atualMilesimos,
          porUnidade: l.porUnidade,
          div: l.div,
          depois: l.item.contadoEm
            ? movs
                .filter((m) => m.insumoId === l.item.insumoId && m.ocorridoEm.getTime() > l.item.contadoEm!.getTime())
                .map((m) => ({ tipo: m.tipo as TipoDeMovimento, quantidadeMilesimos: m.quantidadeMilesimos, motivo: m.motivo, notaId: m.notaId, estorno: !!m.estornoDeId, ocorridoEm: m.ocorridoEm }))
            : [],
          valorContadoCentavos: l.item.contadoMilesimos === null ? 0 : valorDaQuantidade(l.porUnidade, l.item.contadoMilesimos),
        };
      });
      const resumo = resumoDaContagem(brutos);
      const soma = somaDasDivergencias(linhas.map((l) => l.div));
      const acimaDoTeto = linhas.map((l) => valorAcimaDoTeto(l.item.nome, l.valorContadoCentavos)).filter((x): x is string => !!x);
      const estado = estadoDaContagem(c, resumo.naoContados, agora);
      const cobertura = c.tipo === 'FECHAMENTO' ? await coberturaDaLoja(tx, lojaId, cfg, agora, c.status === 'ABERTA' ? c.id : undefined, c.periodo ?? undefined) : null;
      return { loja, contagem: c, estado, regras, linhas, resumo, soma, acimaDoTeto, cobertura };
    }),
  );
  return 'ok' in r ? null : r;
}

export type ConferenciaDaContagem = NonNullable<Awaited<ReturnType<typeof conferenciaDaContagem>>>;

// ================================================================ concluir (aplicar)

/**
 * Aplica: um `CONTAGEM` (±) por item contado com diferença (contado −
 * esperado, valor pelo custo de referência de agora), saldo e razão juntos;
 * item recontado e aplicado por OUTRA contagem depois deste fica de fora
 * (o número dele é mais velho); contagem FECHADA com o desfecho, o valor e o
 * histórico.
 */
async function aplicar(
  tx: ClienteDoParceiro,
  loja: { id: string; nome: string },
  c: { id: string; tipo: string; titulo: string | null; periodoId: string | null },
  itens: readonly ItemParaAplicar[],
  desfecho: 'APLICADA' | 'APLICADA_SOZINHA',
  autorNome: string,
  agora: Date,
) {
  const contados = itens.filter((i) => i.contadoMilesimos !== null);
  // Recontado e aplicado depois por outra contagem: este número é mais velho, não se aplica por cima.
  const posteriores = contados.length
    ? await tx.movimentoEstoque.findMany({
        where: { lojaId: loja.id, insumoId: { in: contados.map((i) => i.insumoId) }, tipo: { in: ['CONTAGEM', 'ABERTURA'] }, estornoDeId: null, contagemItemId: { notIn: itens.map((i) => i.id) } },
        select: { insumoId: true, ocorridoEm: true },
      })
    : [];
  const velhos = new Set(contados.filter((i) => posteriores.some((m) => m.insumoId === i.insumoId && m.ocorridoEm.getTime() > i.contadoEm!.getTime())).map((i) => i.id));
  const custos = await custosDeReferencia(
    tx,
    contados.map((i) => i.insumoId),
  );
  const porUnidade = new Map(Array.from(custos).map(([k, v]) => [k, v.porUnidade]));
  const titulo = c.titulo ?? 'Contagem';
  const movimentos = ajustesDaContagem(
    loja.id,
    contados
      .filter((i) => !velhos.has(i.id))
      .map((i) => ({ id: i.id, insumoId: i.insumoId, nome: i.insumoNomeSnapshot, unidade: i.unidadeSnapshot as Unidade, contadoMilesimos: i.contadoMilesimos, esperadoMilesimos: i.saldoSistemaMilesimos })),
    porUnidade,
    `Contagem · ${titulo}`,
  );
  // Herança a da 1.6: valor de item contado acima do teto vira frase (o razão confere o INTEGER).
  const valoresContados = contados.map((i) => ({ nome: i.insumoNomeSnapshot, valor: valorDaQuantidade(porUnidade.get(i.insumoId) ?? null, i.contadoMilesimos!) }));
  const teto = valoresContados.map((v) => valorAcimaDoTeto(v.nome, v.valor)).find(Boolean);
  if (teto) throw new Recusa({ ok: false, erros: { geral: teto } });
  await gravarMovimentos(tx, movimentos, { ocorridoEm: agora });
  // Valor fotografado: na cíclica, o que foi contado; no fechamento, o estoque final inteiro da loja (base do CMV real, 2.3).
  let valorTotal = valoresContados.reduce((s, v) => s + Math.max(0, v.valor ?? 0), 0);
  if (c.tipo === 'FECHAMENTO') {
    const saldos = await tx.saldoEstoque.findMany({ where: { lojaId: loja.id, quantidadeMilesimos: { gt: 0 } }, select: { insumoId: true, quantidadeMilesimos: true } });
    const todos = await custosDeReferencia(
      tx,
      saldos.map((s) => s.insumoId),
    );
    valorTotal = saldos.reduce((s, x) => s + (valorDaQuantidade(todos.get(x.insumoId)?.porUnidade ?? null, x.quantidadeMilesimos) ?? 0), 0);
  }
  const estouro = totalAcimaDoLimite(valorTotal);
  if (estouro) throw new Recusa({ ok: false, erros: { geral: estouro } });
  const naoContados = itens.length - contados.length;
  await tx.contagem.updateMany({
    where: { id: c.id, status: 'ABERTA' },
    data: { status: 'FECHADA', desfecho, fechadaEm: agora, fechadaPorNome: autorNome, valorTotalCentavos: valorTotal, naoContadosNoFechamento: naoContados },
  });
  const sobra = movimentos.filter((m) => m.valorCentavos > 0).reduce((s, m) => s + m.valorCentavos, 0);
  const falta = movimentos.filter((m) => m.valorCentavos < 0).reduce((s, m) => s - m.valorCentavos, 0);
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'Contagem',
      entidadeId: c.id,
      acao: desfecho === 'APLICADA_SOZINHA' ? 'FECHOU_SOZINHA' : 'CONCLUIU',
      antes: { nome: `${titulo} · ${loja.nome}`, situacao: 'Em contagem' },
      depois: {
        nome: `${titulo} · ${loja.nome}`,
        situacao: desfecho === 'APLICADA_SOZINHA' ? 'Fechou sozinha' : 'Aplicada',
        contados: contados.length,
        ajustes: movimentos.length ? movimentos.map((m) => `${m.insumoNome} ${quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}`).join(' · ') : 'nenhum (tudo bateu)',
        ...(sobra ? { sobrou: formatarDinheiro(sobra) } : {}),
        ...(falta ? { faltou: formatarDinheiro(falta) } : {}),
        ...(naoContados ? { naoAjustados: naoContados } : {}),
        ...(velhos.size ? { recontadosDepois: velhos.size } : {}),
        ...(c.tipo === 'FECHAMENTO' ? { estoqueFinal: formatarDinheiro(valorTotal) } : {}),
      },
      motivo: naoContados ? `${naoContados} sem contar ficaram como estavam (sem ajuste).` : null,
      autorNome,
    },
  });
  return { ajustes: movimentos.length, velhos: velhos.size };
}

/**
 * Concluir (aplicar) uma contagem cíclica ou de fechamento: `estoque.ajustar`,
 * versão conferida, não contados só com confirmação (ficam como estão),
 * vencida não aplica (e fica gravada como "fechou sem aplicar"), fechamento
 * só com a cobertura do período no piso. Concluir de novo = já feito.
 */
export async function concluirContagem(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  contagemId: string,
  entrada: { versao: unknown; confirmarNaoContados: unknown },
  cfg: ConfigDoPeriodo,
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versao = Number(entrada.versao);
  const confirmou = entrada.confirmarNaoContados === true || entrada.confirmarNaoContados === 'sim' || entrada.confirmarNaoContados === 'on';
  if (!ID.test(contagemId)) return { ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true };
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
        const [c] = await tx.sql<{ id: string; tipo: string; status: string; desfecho: string | null; versao: number; titulo: string | null; periodoId: string | null; fechaAutomaticoEm: Date | null }>`
          SELECT "id", "tipo"::text AS "tipo", "status"::text AS "status", "desfecho"::text AS "desfecho", "versao", "titulo", "periodoId", "fechaAutomaticoEm"
          FROM "Contagem"
          WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${contagemId} AND "lojaId" = ${lojaId}
          FOR UPDATE`;
        if (!c || c.tipo === 'ABERTURA') throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
        if (c.status === 'CANCELADA') throw new Recusa({ ok: false, erros: { geral: 'Esta contagem foi descartada: não há o que aplicar.' }, conflito: true });
        if (c.status === 'FECHADA') {
          if (c.desfecho === 'VENCIDA') throw new Recusa({ ok: false, erros: { geral: 'Esta contagem passou do prazo e fechou sem aplicar. Comece outra para os mesmos insumos.' }, conflito: true });
          return { ok: true as const, id: c.id, jaFeito: true };
        }
        if (c.tipo === 'CICLICA' && c.fechaAutomaticoEm && c.fechaAutomaticoEm.getTime() < agora.getTime()) {
          // Gravar o "fechou sem aplicar" e recusar: devolver (não lançar) para a transação valer.
          await vencerContagens(tx, lojaId, agora, c.id);
          return { ok: false as const, erros: { geral: `O prazo desta contagem acabou em ${quando(c.fechaAutomaticoEm)}: ela fechou sem mexer no estoque. Contagem velha não se aplica como se fosse de agora; comece outra.` }, conflito: true };
        }
        if (!Number.isSafeInteger(versao) || versao !== c.versao) {
          throw new Recusa({ ok: false, erros: { geral: 'A contagem mudou depois que você conferiu (alguém salvou um número). Confira de novo antes de aplicar; nada foi gravado.' }, conflito: true });
        }
        const itens = await tx.contagemItem.findMany({ where: { contagemId: c.id }, select: SELECAO_PARA_APLICAR });
        const naoContados = itens.filter((i) => i.contadoMilesimos === null).length;
        if (naoContados > 0 && !confirmou) {
          throw new Recusa({
            ok: false,
            erros: { confirmarNaoContados: `${naoContados} ${naoContados === 1 ? 'insumo não foi contado' : 'insumos não foram contados'}. Conte ou confirme que ${naoContados === 1 ? 'ele fica' : 'eles ficam'} como está no livro (sem ajuste).` },
          });
        }
        if (c.tipo === 'FECHAMENTO') {
          const p = c.periodoId ? await tx.periodoApuracao.findUnique({ where: { id: c.periodoId }, select: { id: true, nome: true, inicio: true, fim: true, status: true } }) : null;
          if (!p) throw new Recusa({ ok: false, erros: { geral: 'O período deste fechamento não foi encontrado.' } });
          if (p.status === 'FECHADO') throw new Recusa({ ok: false, erros: { geral: `O período ${p.nome} já foi fechado no DRE: o estoque dele não muda mais.` } });
          const { cobertura, regras } = await coberturaDaLoja(tx, lojaId, cfg, agora, c.id, p);
          if (!cobertura.atinge) throw new Recusa({ ok: false, erros: { geral: fraseAbaixoDoPiso(cobertura, regras) } });
        }
        await aplicar(tx, loja, c, itens, 'APLICADA', autorNome, agora);
        return { ok: true as const, id: c.id };
      },
      { timeout: 30_000, maxWait: 10_000 },
    ),
  );
}

/** Descarta uma cíclica ou um fechamento EM ANDAMENTO (nada vai ao estoque). Motivo obrigatório. */
export async function descartarContagem(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, contagemId: string, motivoTexto: unknown, autorNome = 'Sistema'): Promise<ResultadoEstoque> {
  const motivo = motivoLimpo(motivoTexto);
  if (!motivo || motivo.length < 3) return { ok: false, erros: { motivo: 'Diga por que a contagem sai (ex.: contamos o lugar errado).' } };
  if (!ID.test(contagemId)) return { ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true };
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
      const [c] = await tx.sql<{ id: string; tipo: string; status: string; titulo: string | null }>`
        SELECT "id", "tipo"::text AS "tipo", "status"::text AS "status", "titulo" FROM "Contagem"
        WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${contagemId} AND "lojaId" = ${lojaId}
        FOR UPDATE`;
      if (!c || c.tipo === 'ABERTURA') throw new Recusa({ ok: false, erros: { geral: 'Contagem não encontrada.' }, naoEncontrado: true });
      if (c.status !== 'ABERTA') throw new Recusa({ ok: false, erros: { geral: 'Esta contagem já não está em andamento: não se descarta.' }, conflito: true });
      await tx.contagem.updateMany({ where: { id: c.id, status: 'ABERTA' }, data: { status: 'CANCELADA', versao: { increment: 1 } } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Contagem',
          entidadeId: c.id,
          acao: 'DESCARTOU',
          antes: { nome: `${c.titulo ?? 'Contagem'} · ${loja.nome}`, situacao: 'Em contagem' },
          depois: { nome: `${c.titulo ?? 'Contagem'} · ${loja.nome}`, situacao: 'Descartada' },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id: c.id };
    }),
  );
}

// ================================================================ período: cobertura e fechamento

/**
 * Cobertura do período na loja: o universo (saldo ≠ 0 agora ∪ contados no
 * período) e quem teve contagem APLICADA no período — mais os números já
 * contados no fechamento em andamento (`fechamentoId`), que valem se ele for
 * aplicado.
 */
async function coberturaDaLoja(
  tx: ClienteDoParceiro,
  lojaId: string,
  cfg: ConfigDoPeriodo,
  agora: Date,
  fechamentoId?: string,
  periodoFixo?: { nome: string; inicio: Date; fim: Date },
): Promise<{ periodo: Periodo; aviso: string | null; cobertura: Cobertura; regras: RegrasDaContagem; contadosNoPeriodo: Map<string, Date>; valores: Map<string, number | null>; nomes: Map<string, { nome: string; unidade: Unidade; conservacao: Conservacao }> }> {
  const regras = await regrasDe(tx, lojaId);
  const { periodo, aviso } = periodoFixo
    ? { periodo: { inicio: periodoFixo.inicio.toISOString().slice(0, 10), fim: periodoFixo.fim.toISOString().slice(0, 10), nome: periodoFixo.nome }, aviso: null }
    : await periodoDe(tx, cfg, hojeNoRio(agora));
  const intervalo = { de: inicioDoDia(periodo.inicio), ate: inicioDoDia(somarUmDia(periodo.fim)) };
  const contadosNoPeriodo = await contadosAplicados(tx, lojaId, intervalo);
  const saldos = await tx.saldoEstoque.findMany({ where: { lojaId }, select: { insumoId: true, quantidadeMilesimos: true } });
  const saldoDe = new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos]));
  if (fechamentoId) {
    // O que já foi contado no fechamento em andamento vale como se aplicado: conta na cobertura e o saldo
    // dele é o de depois do ajuste (atual + contado − esperado) — a mesma conta de antes e de depois de fechar.
    const doFechamento = await tx.contagemItem.findMany({ where: { contagemId: fechamentoId, contadoMilesimos: { not: null } }, select: { insumoId: true, contadoEm: true, contadoMilesimos: true, saldoSistemaMilesimos: true } });
    for (const i of doFechamento) {
      contadosNoPeriodo.set(i.insumoId, i.contadoEm!);
      saldoDe.set(i.insumoId, (saldoDe.get(i.insumoId) ?? 0) + i.contadoMilesimos! - i.saldoSistemaMilesimos);
    }
  }
  const ids = Array.from(new Set([...saldos.filter((s) => s.quantidadeMilesimos !== 0).map((s) => s.insumoId), ...Array.from(contadosNoPeriodo.keys())]));
  const custos = await custosDeReferencia(tx, ids);
  const valores = new Map(ids.map((id) => [id, valorDaQuantidade(custos.get(id)?.porUnidade ?? null, saldoDe.get(id) ?? 0)]));
  const cobertura = coberturaDoPeriodo(
    ids.map((id) => ({ insumoId: id, valorCentavos: valores.get(id) ?? null, contadoNoPeriodo: contadosNoPeriodo.has(id) })),
    regras,
  );
  const insumos = await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true, conservacao: true } });
  const nomes = new Map(insumos.map((i) => [i.id, { nome: i.nome, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao }]));
  return { periodo, aviso, cobertura, regras, contadosNoPeriodo, valores, nomes };
}

const somarUmDia = (iso: string) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

export interface ResumoDaContagemDaLoja {
  id: string;
  tipo: 'CICLICA' | 'FECHAMENTO';
  titulo: string;
  estado: EstadoDaContagem;
  contados: number;
  total: number;
  criadoEm: Date;
  iniciadaPorNome: string | null;
  fechaAutomaticoEm: Date | null;
  fechadaEm: Date | null;
  fechadaPorNome: string | null;
}

/** As contagens do dia a dia da loja: as abertas e as últimas fechadas (quem vê o estoque). */
async function contagensDe(tx: ClienteDoParceiro, lojaId: string, agora: Date): Promise<ResumoDaContagemDaLoja[]> {
  const cs = await tx.contagem.findMany({
    where: { lojaId, tipo: { in: ['CICLICA', 'FECHAMENTO'] } },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: 12,
    select: { id: true, tipo: true, status: true, desfecho: true, titulo: true, criadoEm: true, iniciadaPorNome: true, fechaAutomaticoEm: true, fechadaEm: true, fechadaPorNome: true },
  });
  const contas = cs.length
    ? await tx.contagemItem.groupBy({ by: ['contagemId'], where: { contagemId: { in: cs.map((c) => c.id) } }, _count: { _all: true, contadoMilesimos: true } })
    : [];
  const porId = new Map(contas.map((c) => [c.contagemId, c._count]));
  return cs.map((c) => {
    const n = porId.get(c.id);
    const total = n?._all ?? 0;
    const contados = n?.contadoMilesimos ?? 0;
    return {
      id: c.id,
      tipo: c.tipo as 'CICLICA' | 'FECHAMENTO',
      titulo: c.titulo ?? 'Contagem',
      estado: estadoDaContagem(c, total - contados, agora),
      contados,
      total,
      criadoEm: c.criadoEm,
      iniciadaPorNome: c.iniciadaPorNome,
      fechaAutomaticoEm: c.fechaAutomaticoEm,
      fechadaEm: c.fechadaEm,
      fechadaPorNome: c.fechadaPorNome,
    };
  });
}

/**
 * A situação do período na loja (quem vê o estoque): o período de agora, a
 * cobertura contra o piso, o que falta contar (os "para o piso" primeiro),
 * se o fechamento já pode começar, o fechamento em andamento ou feito, o
 * período anterior sem fechar, e as contagens da loja.
 */
export async function situacaoDoPeriodo(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, cfg: ConfigDoPeriodo, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      const a = (await aberturasDe(tx, [lojaId])).get(lojaId);
      const abertoEm = a?.status === 'FECHADA' ? a.fechadaEm : null;
      if (!abertoEm) return { loja, aberto: false as const };
      const hoje = hojeNoRio(agora);
      const atual = await periodoDe(tx, cfg, hoje);
      // O anterior entra se a loja já estava aberta nele e o estoque dele não foi fechado.
      const anteriorP = cfg.periodoTipo === 'PERSONALIZADO' ? null : periodoAnterior({ tipo: cfg.periodoTipo, diaInicio: cfg.periodoDiaInicio }, atual.periodo);
      const fechamentoDe = async (p: Periodo) => {
        const reg = await tx.periodoApuracao.findFirst({ where: { inicio: new Date(`${p.inicio}T00:00:00.000Z`), fim: new Date(`${p.fim}T00:00:00.000Z`) }, select: { id: true, status: true } });
        if (!reg) return { registro: null, contagem: null };
        const contagem = await tx.contagem.findFirst({
          where: { lojaId, tipo: 'FECHAMENTO', periodoId: reg.id, status: { not: 'CANCELADA' } },
          select: { id: true, status: true, fechadaEm: true, fechadaPorNome: true, valorTotalCentavos: true, criadoEm: true, iniciadaPorNome: true },
        });
        return { registro: reg, contagem };
      };
      const fechAtual = await fechamentoDe(atual.periodo);
      let anterior: { periodo: Periodo; janela: ReturnType<typeof janelaDoFechamento> } | null = null;
      if (anteriorP && hojeNoRio(abertoEm) <= anteriorP.fim) {
        const f = await fechamentoDe(anteriorP);
        if (!f.contagem || f.contagem.status !== 'FECHADA') anterior = { periodo: anteriorP, janela: janelaDoFechamento(anteriorP, hoje) };
      }
      const fechamentoAberto = fechAtual.contagem?.status === 'ABERTA' ? fechAtual.contagem.id : undefined;
      const cob = await coberturaDaLoja(tx, lojaId, cfg, agora, fechamentoAberto);
      const paraOPiso = new Set(cob.cobertura.paraOPiso);
      const faltam = Array.from(cob.valores.keys())
        .filter((id) => !cob.contadosNoPeriodo.has(id))
        .map((id) => ({ insumoId: id, ...cob.nomes.get(id)!, valorCentavos: cob.valores.get(id) ?? null, paraOPiso: paraOPiso.has(id) }))
        .sort((x, y) => Number(y.paraOPiso) - Number(x.paraOPiso) || (y.valorCentavos ?? -1) - (x.valorCentavos ?? -1) || x.nome.localeCompare(y.nome, 'pt-BR'));
      const contagens = await contagensDe(tx, lojaId, agora);
      return {
        loja,
        aberto: true as const,
        abertoEm,
        hoje,
        regras: cob.regras,
        periodo: atual.periodo,
        aviso: atual.aviso,
        janela: janelaDoFechamento(atual.periodo, hoje),
        cobertura: cob.cobertura,
        faltam,
        fechamento: fechAtual.contagem,
        periodoFechadoNoDre: fechAtual.registro?.status === 'FECHADO',
        anterior,
        contagens,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type SituacaoDoPeriodo = NonNullable<Awaited<ReturnType<typeof situacaoDoPeriodo>>>;

/**
 * Começa a contagem de FECHAMENTO do período (o de agora ou o anterior que
 * ficou sem fechar): só nos 3 últimos dias do período ou depois, com a loja
 * aberta antes do fim, sem cíclica aberta. A lista = o que ainda não foi
 * contado no período (o resto já está coberto). Idempotente (índice
 * parcial): começar de novo, ou dois juntos, dá a mesma.
 */
export async function iniciarFechamento(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { inicio: unknown },
  cfg: ConfigDoPeriodo,
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const pedido = typeof entrada.inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entrada.inicio) ? entrada.inicio : null;
  const tentar = () =>
    comRecusa(() =>
      cliente.transacao(
        async (tx) => {
          const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
          const abertoEm = await exigirAberto(tx, loja);
          const hoje = hojeNoRio(agora);
          const atual = (await periodoDe(tx, cfg, hoje)).periodo;
          const anterior = cfg.periodoTipo === 'PERSONALIZADO' ? null : periodoAnterior({ tipo: cfg.periodoTipo, diaInicio: cfg.periodoDiaInicio }, atual);
          const periodo = !pedido || pedido === atual.inicio ? atual : anterior && pedido === anterior.inicio ? anterior : null;
          if (!periodo) throw new Recusa({ ok: false, erros: { geral: 'Escolha o período de agora ou o anterior.' } });
          const janela = janelaDoFechamento(periodo, hoje);
          if (!janela.pode) {
            throw new Recusa({ ok: false, erros: { geral: `O fechamento de ${periodo.nome} abre em ${janela.abreEm.split('-').reverse().join('/')} (os 3 últimos dias do período). Até lá, siga com as contagens do dia a dia.` } });
          }
          if (hojeNoRio(abertoEm) > periodo.fim) throw new Recusa({ ok: false, erros: { geral: `O estoque da ${loja.nome} abriu depois de ${periodo.nome}: não há o que fechar nele.` } });
          await travarLoja(tx, lojaId);
          await vencerContagens(tx, lojaId, agora);
          const ciclo = await tx.contagem.findFirst({ where: { lojaId, tipo: 'CICLICA', status: 'ABERTA' }, select: { titulo: true } });
          if (ciclo) throw new Recusa({ ok: false, erros: { geral: `Conclua ou descarte a contagem “${ciclo.titulo ?? 'em andamento'}” antes de fechar o período.` }, conflito: true });
          const inicio = new Date(`${periodo.inicio}T00:00:00.000Z`);
          const fim = new Date(`${periodo.fim}T00:00:00.000Z`);
          await tx.periodoApuracao.createMany({ data: [{ parceiroId: tx.parceiroId, nome: periodo.nome, inicio, fim }], skipDuplicates: true });
          const reg = (await tx.periodoApuracao.findFirst({ where: { inicio, fim }, select: { id: true, status: true, nome: true } }))!;
          if (reg.status === 'FECHADO') throw new Recusa({ ok: false, erros: { geral: `O período ${reg.nome} já foi fechado no DRE: o estoque dele não muda mais.` } });
          const ja = await tx.contagem.findFirst({ where: { lojaId, tipo: 'FECHAMENTO', periodoId: reg.id, status: { not: 'CANCELADA' } }, select: { id: true, status: true, fechadaEm: true } });
          if (ja?.status === 'ABERTA') return { ok: true as const, id: ja.id, jaFeito: true };
          if (ja) throw new Recusa({ ok: false, erros: { geral: `O estoque de ${periodo.nome} já foi fechado${ja.fechadaEm ? ` em ${quando(ja.fechadaEm)}` : ''}.` }, conflito: true });
          const cob = await coberturaDaLoja(tx, lojaId, cfg, agora, undefined, { nome: reg.nome, inicio, fim });
          const saldos = await tx.saldoEstoque.findMany({ where: { lojaId }, select: { insumoId: true, quantidadeMilesimos: true, valorCentavos: true } });
          const saldoDe = new Map(saldos.map((s) => [s.insumoId, s]));
          const insumos = await tx.insumo.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true, unidade: true, conservacao: true, conteudoMilesimos: true, tipo: true, ativo: true } });
          const lista = insumos.filter((i) => (i.ativo || (saldoDe.get(i.id)?.quantidadeMilesimos ?? 0) !== 0) && !cob.contadosNoPeriodo.has(i.id));
          const c = await tx.contagem.create({
            data: {
              parceiroId: tx.parceiroId,
              lojaId,
              periodoId: reg.id,
              tipo: 'FECHAMENTO',
              status: 'ABERTA',
              referenciaEm: fim,
              iniciadaPorNome: autorNome,
              titulo: `Fechamento · ${reg.nome}`.slice(0, 120),
              criadoEm: agora,
            },
            select: { id: true },
          });
          if (lista.length) {
            await tx.contagemItem.createMany({
              data: lista.map((i) => itemCongelado(tx.parceiroId, c.id, { ...i, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao }, saldoDe.get(i.id))),
            });
          }
          await tx.historicoAlteracao.create({
            data: {
              parceiroId: tx.parceiroId,
              entidade: 'Contagem',
              entidadeId: c.id,
              acao: 'INICIOU',
              depois: { nome: `Fechamento · ${reg.nome} · ${loja.nome}`, itens: lista.length, cobertura: `${cob.cobertura.valor.bp / 100} % do valor e ${cob.cobertura.itens.bp / 100} % dos insumos` },
              autorNome,
            },
          });
          return { ok: true as const, id: c.id };
        },
        { timeout: 20_000 },
      ),
    );
  try {
    return await tentar();
  } catch (e) {
    if (ehErroDeUnicidade(e)) return tentar();
    throw e;
  }
}

/** Histórico de uma contagem (começou, recontou, fechou sozinha, concluiu, venceu, descartou). */
export async function historicoDaContagem(cliente: ClienteDoParceiro, contagemId: string) {
  return cliente.transacao(async (tx) => {
    const itens = await tx.contagemItem.findMany({ where: { contagemId }, select: { id: true } });
    return listarHistorico(tx, {
      de: [
        { entidade: 'Contagem', ids: [contagemId] },
        { entidade: 'ContagemItem', ids: itens.map((i) => i.id) },
      ],
      limite: 30,
    });
  });
}
