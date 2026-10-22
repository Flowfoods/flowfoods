/**
 * Fechar e reabrir o período (2.2b, decisões 152 a 154) — regras com banco.
 *
 * FECHAR é uma transação que pega a trava EXCLUSIVA do período ANTES de ler qualquer coisa
 * (`travarParaFechar`): toda escrita que cai num período — faturamento, despesa, nota de compra,
 * fechamento de estoque, regra — pega a mesma chave COMPARTILHADA antes de ler o status. Ou ela
 * termina antes e entra no fechamento, ou espera e é recusada por período fechado. Não existe janela.
 * Ordem das travas, regra da casa (para nunca dar deadlock): chave do período → loja/aberturas →
 * períodos (`travarPeriodos`, dentro de `registrarPeriodo`).
 *
 * O que sai do fechamento é uma FOTOGRAFIA imutável: o DRE da rede e de cada loja como `montarDre`
 * o calculou naquele instante, com a taxa do iFood, as metas e o plano DAQUELA hora. Fechado é lido
 * só dela. A leitura é a MESMA do DRE ao vivo (`entradaDoDre`): o fechado bate centavo a centavo com
 * o que a tela mostrava um minuto antes.
 *
 * REABRIR é só do nível 1 (o período fechado é o ponto de controle do consultor): marca a fotografia
 * como substituída, com quem reabriu e por quê, e o período volta a ser ABERTO. Fechar de novo grava a
 * versão seguinte; todas ficam legíveis.
 */

import type { Prisma } from '@prisma/client';
import { hojeNoRio, formatarData } from './compra-campos';
import { cmvDoEscopo, cmvParaGravar } from './cmv-campos';
import { categoriasParaFotografia } from './cmv-categorias';
import { montarDre, type EntradaDoDre, type LinhaDoDre } from './dre-campos';
import { entradaDoDre, type LeituraDoDre } from './dre-entrada';
import {
  fraseDaRecusaDeFechar,
  impressaoDasCondicoes,
  lerJustificativa,
  lerMotivoDaReabertura,
  linhasParaGravar,
  MENSAGEM_DE_ALGO_MUDOU,
  type CondicaoDura,
  type CondicoesParaFechar,
  type LinhaGravada,
  type Ressalva,
} from './dre-fechamento-campos';
import { gravarFotografia, lerFotografiaVigente, lerVersoesDoPeriodo, proximaVersao, type FotografiaLida } from './dre-fotografia';
import { aceitaMeta, anoPassadoParaGravar, mesmaDataNoAnoPassado, metaApareceNaLoja } from './dre-metas-campos';
import { VERSAO_DAS_FAIXAS } from './farol-campos';
import { faturamentoDosGraos } from './faturamento';
import { metasDoPeriodo } from './dre-metas';
import { CODIGO, codigoDoSubtotal } from './dre-plano';
import { garantirPlano } from './plano';
import { rotuloDoMes } from './faturamento-campos';
import { aberturasDe } from './estoque';
import { travarParaFechar } from './periodo-trava';
import { PRIMEIRO_DIA_DO_ERP, type Periodo } from './periodo-campos';
import { periodoDe, registrarPeriodo } from './periodos';
import { ALCANCE_FLOWFOODS, recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { formatarDinheiro } from './unidades';

/** "R$ 27.950,00 (misto)" para o Histórico do fechamento; sem CMV, "não apurado". */
function textoDoCmvDaRede(leitura: Pick<LeituraDoDre, 'cmv' | 'receitas'>): string {
  const c = cmvDoEscopo(leitura.cmv, { tipo: 'rede' }, (id) => leitura.receitas.filter((r) => r.lojaId === id).reduce((t, r) => t + r.valorCentavos, 0));
  return c.centavos === null ? 'não apurado' : `${formatarDinheiro(c.centavos)} (${c.fonte})`;
}

const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ehData = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`)) && new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s;

export const MENSAGEM_PERIODO_NAO_ENCONTRADO = 'Período não encontrado.';
export const MENSAGEM_SO_A_FLOWFOODS_REABRE = 'Só a FlowFoods reabre um período fechado: ele é o ponto de controle do trabalho com a rede. Fale com o seu consultor.';

/** Quem fecha: `metas.editar` (que exige a rede inteira) e `dre.ver`. O nível 1 passa em tudo. */
export function recusaDoFechamento(alcance: Alcance): string | null {
  if (alcance.lojas !== 'todas') return 'Só quem tem a rede inteira fecha o período.';
  return recusa(alcance, 'metas.editar') ?? recusa(alcance, 'dre.ver');
}

// ================================================================ as condições

const dias = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * As condições para fechar o período, lidas na transação de quem chama (a de fechar, sob a trava
 * exclusiva, ou a da tela, que só confere). Período em curso: só a condição de esperar.
 */
async function condicoesDe(tx: ClienteDoParceiro, periodo: Periodo, registroId: string | null, leitura: LeituraDoDre | null, hoje: string): Promise<CondicoesParaFechar> {
  const duras: CondicaoDura[] = [];
  const ressalvas: Ressalva[] = [];
  const pronto = () => ({ duras, ressalvas, impressao: impressaoDasCondicoes(periodo.inicio, periodo.fim, duras, ressalvas) });

  if (hoje <= periodo.fim || !leitura) {
    duras.push({
      codigo: 'EM_CURSO',
      titulo: `o período ${periodo.nome} ainda não terminou`,
      detalhe: `Ele termina em ${formatarData(periodo.fim)}. Só se fotografa um período inteiro: fecha a partir de ${formatarData(somaUmDia(periodo.fim))}.`,
    });
    return pronto();
  }

  // --- duras
  const redeSemLancamento = leitura.receitas.length === 0;
  // Rede sem lançamento nenhum é "nada a fechar": as faltas de cada loja só repetiriam o mesmo problema.
  if (!redeSemLancamento && leitura.faltas.total > 0) {
    const lojas = leitura.faltas.porLoja.filter((f) => f.faltas > 0).map((f) => `${f.loja.nome} (${f.faltas})`);
    duras.push({
      codigo: 'FALTA_FATURAMENTO',
      titulo: `${dias(leitura.faltas.total, 'lançamento de faturamento está faltando', 'lançamentos de faturamento estão faltando')}`,
      detalhe: `Sem o faturamento de todos os canais e dias, a receita (a base de todo percentual) ficaria errada para sempre. Faltam: ${lojas.join(', ')}. Lance, ou marque “Não vendeu” no dia sem venda.`,
      resolverEm: { rotulo: 'Ver as faltas', caminho: `/faturamento?mes=${periodo.inicio.slice(0, 7)}&rede=1` },
    });
  }
  const ifood = leitura.receitas.filter((r) => r.canal === 'IFOOD').reduce((s, r) => s + r.valorCentavos, 0);
  if (ifood > 0 && leitura.taxaIfood === null) {
    duras.push({
      codigo: 'SEM_TAXA_IFOOD',
      titulo: 'houve venda no iFood e a taxa do iFood não está configurada',
      detalhe: 'Fechar agora congelaria “falta configurar a taxa” no resultado. Configure a comissão e o pagamento online do seu plano e feche em seguida.',
      resolverEm: { rotulo: 'Configurar a taxa', caminho: '/fichas/canais' },
    });
  }
  if (registroId) {
    const emAndamento = await tx.contagem.findMany({ where: { tipo: 'FECHAMENTO', status: 'ABERTA', periodoId: registroId }, select: { lojaId: true, loja: { select: { nome: true } } } });
    if (emAndamento.length > 0) {
      const nomes = emAndamento.map((c) => c.loja.nome);
      duras.push({
        codigo: 'ESTOQUE_EM_ANDAMENTO',
        titulo: `${dias(emAndamento.length, 'loja está', 'lojas estão')} com o fechamento do estoque em andamento`,
        detalhe: `${nomes.join(', ')}: conclua ou descarte a contagem de fechamento. Depois que o DRE fecha ela não se aplica mais e ainda prende as contagens do dia a dia da loja.`,
        resolverEm: { rotulo: 'Abrir o estoque', caminho: `/estoque/${emAndamento[0].lojaId}/periodo` },
      });
    }
  }
  if (redeSemLancamento) {
    duras.push({
      codigo: 'REDE_SEM_LANCAMENTO',
      titulo: 'a rede não tem nenhum lançamento de faturamento neste período',
      detalhe: 'Nada a fechar. Fechar um período vazio travaria a importação do histórico dele (e a comparação com o ano seguinte).',
      resolverEm: { rotulo: 'Lançar faturamento', caminho: '/faturamento/lancar' },
    });
  }

  // --- ressalvas (confirmáveis)
  for (const f of leitura.faltaLancar) {
    const onde = f.lojaNome ? ` · ${f.lojaNome}` : ' · rede';
    ressalvas.push({
      id: `recorrente:${f.origemId}`,
      tipo: 'RECORRENTE',
      lojaId: f.lojaId,
      lojaNome: f.lojaNome,
      titulo: `${f.descricao}${onde}: falta a de ${rotuloDoMes(f.mesAlvo)}`,
      detalhe: `Repete todo mês e a última lançada foi de ${formatarDinheiro(f.valorCentavos)}. Fechando assim, o resultado do período fica sem ela.`,
      origemId: f.origemId,
      mesAlvo: f.mesAlvo,
      valorCentavos: f.valorCentavos,
      linhaId: f.linhaId,
      grupo: f.grupo,
    });
  }
  const ativas = leitura.lojas.filter((l) => l.ativa);
  const abertas = await aberturasDe(tx, ativas.map((l) => l.id));
  const aplicadas = new Set(
    registroId ? (await tx.contagem.findMany({ where: { tipo: 'FECHAMENTO', status: 'FECHADA', periodoId: registroId }, select: { lojaId: true } })).map((c) => c.lojaId) : [],
  );
  for (const l of ativas) {
    const a = abertas.get(l.id);
    if (!a || a.status !== 'FECHADA' || !a.fechadaEm || hojeNoRio(a.fechadaEm) > periodo.fim || aplicadas.has(l.id)) continue;
    ressalvas.push({
      id: `estoque:${l.id}`,
      tipo: 'ESTOQUE',
      lojaId: l.id,
      lojaNome: l.nome,
      titulo: `${l.nome}: o fechamento do estoque não foi aplicado`,
      detalhe: 'Depois do fechamento do DRE ele não se aplica mais (o estoque só fecha o período de agora e o anterior). O CMV real da loja neste período fica “não apurado”.',
    });
  }
  if (!redeSemLancamento) {
    const comReceita = new Set(leitura.receitas.map((r) => r.lojaId));
    const nomes = new Map<string, string>();
    for (const l of ativas) nomes.set(l.id, l.nome);
    const lojasComData = await tx.loja.findMany({ where: { id: { in: ativas.map((l) => l.id) } }, select: { id: true, criadoEm: true } });
    for (const l of lojasComData) {
      if (hojeNoRio(l.criadoEm) > periodo.fim || comReceita.has(l.id)) continue;
      ressalvas.push({
        id: `sem-lancamento:${l.id}`,
        tipo: 'LOJA_SEM_LANCAMENTO',
        lojaId: l.id,
        lojaNome: nomes.get(l.id) ?? null,
        titulo: `${nomes.get(l.id)}: nenhum lançamento de faturamento no período`,
        detalhe: 'A loja existia e não tem faturamento algum aqui: ela fica com receita zero para sempre. Se a loja não vendia, está certo; se esqueceram de lançar, lance antes de fechar.',
      });
    }
  }
  return pronto();
}

const somaUmDia = (d: string) => new Date(dataDoBanco(d).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Lê o período pedido pela data de início: a regra tem de devolver o mesmo início (senão, não é um período). */
async function periodoPedido(tx: ClienteDoParceiro, inicio: unknown): Promise<Periodo | null> {
  if (!ehData(inicio) || inicio < PRIMEIRO_DIA_DO_ERP) return null;
  const p = await periodoDe(tx, inicio);
  return p.inicio === inicio ? p : null;
}

// ================================================================ a tela

export interface SituacaoDoFechamento {
  periodo: Periodo;
  hoje: string;
  registro: { id: string; status: 'ABERTO' | 'FECHADO'; fechadoEm: Date | null; fechadoPorNome: string | null } | null;
  /** Só enquanto está ABERTO. */
  condicoes: CondicoesParaFechar | null;
  fotografia: FotografiaLida | null;
  /** Todas as versões, da mais nova (só a rede inteira lê). */
  versoes: FotografiaLida[];
  podeReabrir: boolean;
}

/**
 * A tela de um período (fechar, ver a fotografia, as versões). Quem não pode fechar, período que
 * não existe como período, futuro ou anterior ao ERP: null (a página responde 404).
 */
export async function situacaoDoFechamento(cliente: ClienteDoParceiro, alcance: Alcance, inicio: string, hoje = hojeNoRio()): Promise<SituacaoDoFechamento | null> {
  if (recusaDoFechamento(alcance)) return null;
  return cliente.transacao(async (tx) => {
    const periodo = await periodoPedido(tx, inicio);
    if (!periodo || periodo.inicio > hoje) return null;
    const registro = await tx.periodoApuracao.findFirst({
      where: { inicio: dataDoBanco(periodo.inicio), fim: dataDoBanco(periodo.fim) },
      select: { id: true, status: true, fechadoEm: true, fechadoPorNome: true },
    });
    let condicoes: CondicoesParaFechar | null = null;
    if (!registro || registro.status === 'ABERTO') {
      const leitura = hoje > periodo.fim ? await entradaDoDre(tx, ALCANCE_FLOWFOODS, periodo, periodo.fim, { hoje }) : null;
      condicoes = await condicoesDe(tx, periodo, registro?.id ?? null, leitura, hoje);
    }
    const fotografia = registro?.status === 'FECHADO' ? await lerFotografiaVigente(tx, ALCANCE_FLOWFOODS, registro.id) : null;
    const versoes = registro ? await lerVersoesDoPeriodo(tx, registro.id) : [];
    return { periodo, hoje, registro, condicoes, fotografia, versoes, podeReabrir: alcance.nivel === 'FLOWFOODS' };
  });
}

// ================================================================ fechar

export type ResultadoDoFechamento =
  | { ok: true; versao: number; jaFechado: boolean; ressalvas: number }
  | { ok: false; erro: string; duras?: CondicaoDura[]; mudou?: boolean; erros?: Partial<Record<'justificativa' | 'ressalvas', string>> };

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoDoFechamento, { ok: false }>) {
    super('recusa');
  }
}

export interface EntradaDoFechamento {
  inicio: unknown;
  /** Os ids das ressalvas que a pessoa marcou. */
  ressalvas: unknown;
  justificativa: unknown;
  /** A impressão das condições que a pessoa viu. */
  impressao?: unknown;
}

/** A meta de cada linha na hora de fotografar: a da rede; a da loja pula os dois resultados. */
const metaDa = (metas: ReadonlyMap<string, number>, daLoja: boolean) => (l: LinhaDoDre) => (aceitaMeta(l.chave) && (!daLoja || metaApareceNaLoja(l.chave)) ? metas.get(l.chave) ?? null : null);

/**
 * Fecha o período que começa em `inicio`. Tudo numa transação que pega a trava exclusiva ANTES de ler.
 * Fechar um período já fechado é "já fechado" (idempotente). Condição dura recusa sem justificativa que a
 * valha; ressalva só passa marcada uma a uma, com UMA justificativa de 10 a 300 letras.
 */
export async function fecharPeriodo(cliente: ClienteDoParceiro, alcance: Alcance, entrada: EntradaDoFechamento, autorNome: string, hoje = hojeNoRio()): Promise<ResultadoDoFechamento> {
  const negado = recusaDoFechamento(alcance);
  if (negado) return { ok: false, erro: negado };
  if (!ehData(entrada.inicio) || entrada.inicio < PRIMEIRO_DIA_DO_ERP) return { ok: false, erro: MENSAGEM_PERIODO_NAO_ENCONTRADO };
  const inicio = entrada.inicio;
  const marcadas = Array.isArray(entrada.ressalvas) ? Array.from(new Set(entrada.ressalvas.filter((x): x is string => typeof x === 'string' && x.length <= 200))) : [];
  if (Array.isArray(entrada.ressalvas) && entrada.ressalvas.length > 500) return { ok: false, erro: MENSAGEM_DE_ALGO_MUDOU, mudou: true };
  try {
    return await cliente.transacao(
      async (tx): Promise<ResultadoDoFechamento> => {
        await travarParaFechar(tx);
        const periodo = await periodoPedido(tx, inicio);
        if (!periodo) throw new Recusa({ ok: false, erro: MENSAGEM_PERIODO_NAO_ENCONTRADO });
        if (hoje <= periodo.fim) {
          const c = await condicoesDe(tx, periodo, null, null, hoje);
          throw new Recusa({ ok: false, erro: fraseDaRecusaDeFechar(c.duras), duras: c.duras });
        }
        const registro = await registrarPeriodo(tx, periodo);
        if (!registro.ok) throw new Recusa({ ok: false, erro: registro.erro });
        if (registro.status === 'FECHADO') {
          const f = await lerFotografiaVigente(tx, ALCANCE_FLOWFOODS, registro.id);
          return { ok: true, versao: f?.versao ?? 0, jaFechado: true, ressalvas: f?.totalDeRessalvas ?? 0 };
        }
        await garantirPlano(tx);
        const leitura = await entradaDoDre(tx, ALCANCE_FLOWFOODS, periodo, periodo.fim, { hoje });
        const cond = await condicoesDe(tx, periodo, registro.id, leitura, hoje);
        if (cond.duras.length > 0) throw new Recusa({ ok: false, erro: fraseDaRecusaDeFechar(cond.duras), duras: cond.duras });

        const existentes = new Set(cond.ressalvas.map((r) => r.id));
        if (marcadas.some((id) => !existentes.has(id))) throw new Recusa({ ok: false, erro: MENSAGEM_DE_ALGO_MUDOU, mudou: true });
        if (typeof entrada.impressao === 'string' && entrada.impressao !== '' && entrada.impressao !== cond.impressao) throw new Recusa({ ok: false, erro: MENSAGEM_DE_ALGO_MUDOU, mudou: true });
        let justificativa: string | null = null;
        if (cond.ressalvas.length > 0) {
          const faltam = cond.ressalvas.filter((r) => !marcadas.includes(r.id));
          if (faltam.length > 0) {
            throw new Recusa({
              ok: false,
              erro: `Há ${dias(cond.ressalvas.length, 'ressalva', 'ressalvas')} neste fechamento. Marque cada uma para fechar mesmo assim${faltam.length < cond.ressalvas.length ? ` (faltam ${faltam.length})` : ''}.`,
              erros: { ressalvas: 'Marque cada ressalva para fechar mesmo assim.' },
            });
          }
          const j = lerJustificativa(entrada.justificativa);
          if (!j.ok) throw new Recusa({ ok: false, erro: j.erro, erros: { justificativa: j.erro } });
          justificativa = j.texto;
        }

        // Uma leitura de plano, taxa e metas; a conta é a MESMA do DRE ao vivo.
        const metas = await metasDoPeriodo(tx, leitura.plano, periodo.inicio);
        const base: Omit<EntradaDoDre, 'escopo'> = { plano: leitura.plano, receitas: leitura.receitas, taxaIfood: leitura.taxaIfood, despesas: leitura.despesas, cmv: leitura.cmv };
        const rede = montarDre({ ...base, escopo: { tipo: 'rede' } });
        const linhas: LinhaGravada[] = linhasParaGravar(rede, null, null, metaDa(metas, false));
        for (const loja of leitura.lojas) {
          const r = montarDre({ ...base, escopo: { tipo: 'loja', lojaId: loja.id, nome: loja.nome } });
          // Loja desativada sem nada no período fica de fora, como no DRE ao vivo.
          const fim = r.linhas.find((l) => l.codigo === CODIGO.resultado)!;
          if (!loja.ativa && r.receitaBrutaCentavos === 0 && (fim.valorCentavos ?? 0) === 0) continue;
          linhas.push(...linhasParaGravar(r, loja.id, loja.nome, metaDa(metas, true)));
        }

        const deAnoPassado = mesmaDataNoAnoPassado(periodo.inicio);
        const ateAnoPassado = mesmaDataNoAnoPassado(periodo.fim);
        const anoPassado = anoPassadoParaGravar(deAnoPassado, ateAnoPassado, await faturamentoDosGraos(tx, ALCANCE_FLOWFOODS, { de: deAnoPassado, ate: ateAnoPassado }), leitura.lojas);
        const versao = await proximaVersao(tx, registro.id);
        const agora = new Date();
        await gravarFotografia(
          tx,
          {
            periodoId: registro.id,
            inicio: periodo.inicio,
            fim: periodo.fim,
            nomeDoPeriodo: periodo.nome,
            fechadoPorNome: autorNome,
            taxa: leitura.taxaIfood,
            versaoDaConta: 4,
            entrada: {
              versaoDaConta: 4,
              periodo: { inicio: periodo.inicio, fim: periodo.fim, nome: periodo.nome },
              ate: leitura.ate,
              lojas: leitura.lojas.map((l) => ({ id: l.id, nome: l.nome, ativa: l.ativa })),
              plano: leitura.plano,
              receitas: leitura.receitas,
              despesas: leitura.despesas,
              taxaIfood: leitura.taxaIfood,
              cmv: cmvParaGravar(leitura.cmv),
              metas: Object.fromEntries(metas),
              // 2.4: o ano passado por loja e canal (o fechado lê a variação SÓ daqui) e a versão das faixas do farol com que foi lido.
              anoPassado,
              farol: { versao: VERSAO_DAS_FAIXAS },
              // I.2a: o CMV por categoria (compras pela categoria de HOJE, meta efetiva e uso por loja) e a fotografia v4. O fechado lê SÓ daqui.
              categorias: await categoriasParaFotografia(tx, leitura.lojas, periodo),
            } as unknown as Prisma.InputJsonValue,
            ressalvas: cond.ressalvas,
            justificativa,
            linhas,
          },
          versao,
        );
        const u = await tx.periodoApuracao.updateMany({ where: { id: registro.id, status: 'ABERTO' }, data: { status: 'FECHADO', fechadoEm: agora, fechadoPorNome: autorNome.slice(0, 120) } });
        if (u.count === 0) throw new Recusa({ ok: false, erro: 'O período acabou de ser fechado por outra pessoa. Recarregue a página.', mudou: true });

        const receita = rede.receitaBrutaCentavos;
        const final = rede.linhas.find((l) => l.codigo === CODIGO.resultado)!;
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'PeriodoApuracao',
            entidadeId: registro.id,
            acao: 'FECHOU',
            antes: { alvo: periodo.nome, situacao: 'Aberto', ...(versao > 1 ? { versaoDoFechamento: String(versao - 1) } : {}) },
            depois: {
              alvo: periodo.nome,
              situacao: 'Fechado',
              versaoDoFechamento: String(versao),
              receitaBruta: formatarDinheiro(receita),
              resultado: final.valorCentavos === null ? 'não apurado' : formatarDinheiro(final.valorCentavos),
              ressalvas: String(cond.ressalvas.length),
              cmv: textoDoCmvDaRede(leitura),
            },
            motivo: justificativa,
            autorNome,
          },
        });
        return { ok: true, versao, jaFechado: false, ressalvas: cond.ressalvas.length };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

// ================================================================ reabrir

export type ResultadoDaReabertura = { ok: true; versao: number } | { ok: false; erro: string; mudou?: boolean };

/**
 * Reabre um período fechado. SÓ o nível 1 (`alcance.nivel === 'FLOWFOODS'`), nunca por permissão
 * de catálogo. Leva o motivo (3 a 200 letras) e a fotografia que a pessoa viu: se outra já a
 * substituiu, é conflito.
 */
export async function reabrirPeriodo(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  entrada: { inicio: unknown; motivo: unknown; fotografia: unknown },
  autorNome: string,
): Promise<ResultadoDaReabertura> {
  if (alcance.nivel !== 'FLOWFOODS') return { ok: false, erro: MENSAGEM_SO_A_FLOWFOODS_REABRE };
  if (!ehData(entrada.inicio)) return { ok: false, erro: MENSAGEM_PERIODO_NAO_ENCONTRADO };
  const motivo = lerMotivoDaReabertura(entrada.motivo);
  if (!motivo.ok) return { ok: false, erro: motivo.erro };
  const inicio = entrada.inicio;
  try {
    return await cliente.transacao(
      async (tx): Promise<ResultadoDaReabertura> => {
        await travarParaFechar(tx);
        const reg = await tx.periodoApuracao.findFirst({ where: { inicio: dataDoBanco(inicio) }, select: { id: true, nome: true, status: true } });
        if (!reg) throw new Recusa({ ok: false, erro: MENSAGEM_PERIODO_NAO_ENCONTRADO });
        if (reg.status !== 'FECHADO') throw new Recusa({ ok: false, erro: 'Este período não está fechado.', mudou: true });
        const foto = await lerFotografiaVigente(tx, ALCANCE_FLOWFOODS, reg.id);
        if (foto && String(entrada.fotografia ?? '') !== foto.id) throw new Recusa({ ok: false, erro: 'O fechamento mudou desde que você abriu a página. Recarregue; nada foi reaberto.', mudou: true });
        let retrato: Record<string, string> = {};
        if (foto) {
          const rede = foto.linhas.filter((l) => l.lojaId === null);
          const valor = (chave: string) => rede.find((l) => l.chave === chave)?.valorCentavos ?? null;
          const resultado = valor(CODIGO.resultado);
          retrato = { receitaBruta: formatarDinheiro(valor(codigoDoSubtotal('RECEITA')) ?? 0), resultado: resultado === null ? 'não apurado' : formatarDinheiro(resultado), versaoDoFechamento: String(foto.versao) };
          const m = await tx.dreFotografia.updateMany({
            where: { id: foto.id, substituidaEm: null },
            data: { substituidaEm: new Date(), reabertaPorNome: autorNome.slice(0, 120), motivoReabertura: motivo.texto },
          });
          if (m.count === 0) throw new Recusa({ ok: false, erro: 'O fechamento mudou desde que você abriu a página. Recarregue; nada foi reaberto.', mudou: true });
        }
        const u = await tx.periodoApuracao.updateMany({ where: { id: reg.id, status: 'FECHADO' }, data: { status: 'ABERTO', fechadoEm: null, fechadoPorNome: null } });
        if (u.count === 0) throw new Recusa({ ok: false, erro: 'Este período não está fechado.', mudou: true });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'PeriodoApuracao',
            entidadeId: reg.id,
            acao: 'REABRIU',
            antes: { alvo: reg.nome, situacao: 'Fechado', ...retrato },
            depois: { alvo: reg.nome, situacao: 'Aberto' },
            motivo: motivo.texto,
            autorNome,
          },
        });
        return { ok: true, versao: foto?.versao ?? 0 };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Recusa) return e.resultado as ResultadoDaReabertura;
    throw e;
  }
}
