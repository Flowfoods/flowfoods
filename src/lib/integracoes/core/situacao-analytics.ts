/** Leitura operacional por loja/dia. A Central conta páginas sem carregar seu conteúdo. */
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { filtroDeLojas, pode, recusa, type Alcance } from '@/lib/erp/permissoes';
import { moduloLiberado } from '@/lib/erp/liberacao';
import {
  diaValidoDaSituacao, mensagemDaPendenciaAnalytics, mensagemDaTentativaAnalytics, mensagemDoAcessoAnalytics, ontemDaSituacaoAnalytics,
  type AplicacaoDaSituacaoAnalytics, type ContextoServidorAnalytics, type EntradaSituacaoAnalytics, type EstadoDaTentativaAnalytics,
  type OrigemAnalyticsNoFaturamento, type ResultadoSituacaoAnalytics, type SituacaoAnalyticsDaLoja,
} from './situacao-analytics-campos';

class LeituraSemFotografia extends Error {
  constructor() { super('A leitura operacional exige uma transação repetível e somente leitura.'); this.name = 'LeituraSemFotografia'; }
}

/** As opções de uma transação interna são ignoradas pelo portão: verificar o banco antes de ler qualquer dado. */
async function confirmarFotografia(tx: ClienteDoParceiro): Promise<void> {
  const [r] = await tx.sql<{ repetivel: boolean; leitura: boolean }>`SELECT
    current_setting('transaction_isolation') IN ('repeatable read', 'serializable') AS repetivel,
    current_setting('transaction_read_only') = 'on' AS leitura`;
  if (!tx.somenteLeitura || r?.repetivel !== true || r?.leitura !== true) throw new LeituraSemFotografia();
}

const ESTADOS = new Set<string>(['PLANEJADA', 'EXECUTANDO', 'SUCESSO', 'FALHA', 'AGUARDANDO', 'PENDENTE_PERIODO']);
const iso = (data: Date | null) => data?.toISOString() ?? null;
function lojaDigitada(valor: unknown): string | null | false {
  if (valor === undefined || valor === '') return null;
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 128 ? valor.trim() : false;
}
const recusar = (motivo: Extract<ResultadoSituacaoAnalytics, { ok: false }>['motivo'], mensagem: string): ResultadoSituacaoAnalytics => ({ ok: false, motivo, mensagem });
const indisponivel = () => recusar('leitura-indisponivel', 'Não foi possível conferir esta situação agora. Tente novamente em instantes.');

type ReciboOperacional = {
  estado: string; motivo: string | null; revisaoSolicitada: bigint; revisaoConferida: bigint;
  aplicadoEm: Date | null; conferidaEm: Date | null;
};
function temPendencia(recibo: ReciboOperacional): boolean {
  return recibo.estado !== 'APLICADO' || recibo.revisaoSolicitada > recibo.revisaoConferida;
}
function aplicacaoDoDia(recibo: ReciboOperacional | null, teste: boolean): AplicacaoDaSituacaoAnalytics {
  if (teste) return { estado: 'teste', mensagem: { rotulo: 'Ambiente de teste', explicacao: 'Leituras de teste não são aplicadas ao faturamento.', tom: 'neutro' }, aplicadoEm: null, conferidaEm: null, mantemAplicacaoAnterior: false };
  if (!recibo) return { estado: 'sem-aplicacao', mensagem: { rotulo: 'Sem aplicação registrada', explicacao: 'Ainda não há aplicação registrada para este dia.', tom: 'neutro' }, aplicadoEm: null, conferidaEm: null, mantemAplicacaoAnterior: false };
  const pendente = temPendencia(recibo) || !recibo.aplicadoEm;
  return {
    estado: pendente ? 'pendente' : 'aplicado',
    mensagem: pendente ? mensagemDaPendenciaAnalytics(recibo.motivo) : { rotulo: 'Aplicado ao faturamento', explicacao: 'Há uma aplicação confirmada para este dia. Uma próxima leitura pode trazer revisão.', tom: 'ok' },
    aplicadoEm: iso(recibo.aplicadoEm), conferidaEm: iso(recibo.conferidaEm), mantemAplicacaoAnterior: pendente && recibo.aplicadoEm !== null,
  };
}

/** Contexto é o ctx.parceiro autenticado, sem campos vindos da URL. O leitor também verifica todas as conexões da seleção. */
export async function lerSituacaoAnalyticsDaLoja(
  cliente: ClienteDoParceiro, alcance: Alcance, contexto: ContextoServidorAnalytics, entrada: EntradaSituacaoAnalytics = {},
): Promise<ResultadoSituacaoAnalytics> {
  if (!contexto || contexto.parceiroId !== cliente.parceiroId || typeof contexto.homologacaoDeIntegracao !== 'boolean') return recusar('contexto-invalido', 'Não foi possível conferir o contexto deste parceiro.');
  if (recusa(alcance, 'integracao.ver')) return recusar('sem-permissao', 'Seu acesso não inclui a situação das integrações.');
  const escolhida = lojaDigitada(entrada.lojaId);
  const ontem = ontemDaSituacaoAnalytics();
  const dia = entrada.dia === undefined || entrada.dia === '' ? ontem : entrada.dia;
  if (escolhida === false || !diaValidoDaSituacao(dia) || dia > ontem) return recusar('entrada-invalida', 'Escolha uma loja válida e um dia até ontem.');
  if (escolhida && recusa(alcance, 'integracao.ver', { lojaId: escolhida })) return recusar('loja-indisponivel', 'Esta loja não está disponível no seu acesso.');
  const ambiente = contexto.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoSituacaoAnalytics> => {
      await confirmarFotografia(tx);
      if (!await moduloLiberado(tx, 'integracao')) return recusar('sem-modulo', 'O módulo Integração não está liberado para este parceiro.');
      const limite = filtroDeLojas(alcance);
      const lojas = await tx.loja.findMany({ where: limite ? { id: limite } : {}, select: { id: true, nome: true, ativa: true }, orderBy: [{ ativa: 'desc' }, { nome: 'asc' }, { id: 'asc' }] });
      const loja = escolhida ? lojas.find(l => l.id === escolhida) : lojas[0];
      if (!loja) return escolhida ? recusar('loja-indisponivel', 'Esta loja não está disponível no seu acesso.') : { ok: true, lojas, dia, ambiente, situacao: null };
      const conexoes = await tx.integracaoConexao.findMany({
        where: { lojaId: loja.id, provedor: 'IFOOD' },
        select: { id: true, idExterno: true, nomeExterno: true, ambiente: true, estado: true,
          marca: { select: { nome: true } }, modulos: { where: { modulo: 'ANALYTICS' }, select: { id: true, estado: true } } },
        orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      });
      if (conexoes.some(c => c.ambiente !== ambiente)) return recusar('ambiente-incompativel', 'O ambiente dos vínculos desta loja precisa ser conferido pela FlowFoods.');
      const merchants = conexoes.map(c => c.idExterno);
      // Integridade comercial: só um booleano, nunca ids, nomes ou contagens de outra loja ao navegador.
      const conflito = merchants.length ? await tx.sql<{ ambigua: boolean }>`SELECT EXISTS (
        SELECT 1 FROM "IntegracaoConexao" c WHERE c."parceiroId" = ${tx.parceiroId}
          AND c.provedor = 'IFOOD' AND c.ambiente::text = ${ambiente} AND c."lojaId" <> ${loja.id}
          AND c."idExterno" = ANY(${merchants}::text[])
      ) AS ambigua` : [{ ambigua: false }];
      if (conflito.length !== 1 || typeof conflito[0].ambigua !== 'boolean') return indisponivel();
      const modulos = conexoes.flatMap(c => c.modulos.map(m => m.id));
      const data = new Date(`${dia}T00:00:00.000Z`);
      const nivel1 = alcance.nivel === 'FLOWFOODS' && ambiente === 'PRODUCAO';
      const execucoes = modulos.length ? await tx.integracaoExecucao.findMany({
        where: { moduloId: { in: modulos }, dia: data, perfil: 'diario' },
        select: { id: true, moduloId: true, estado: true, fuso: true, iniciadaEm: true, concluidaEm: true, naoAntesDe: true, ultimoErro: true,
          ...(nivel1 ? { geracao: true } : {}) },
      }) : [];
      if (execucoes.some(e => e.fuso !== 'America/Sao_Paulo')) return indisponivel();
      const contagens = nivel1 && execucoes.length ? await tx.integracaoPayload.groupBy({
        by: ['execucaoId'], where: { OR: execucoes.map(e => ({ execucaoId: e.id, geracao: e.geracao })) }, _count: { _all: true },
      }) : [];
      const paginas = new Map(contagens.map(p => [p.execucaoId, p._count._all]));
      const elegiveis = nivel1 && !cliente.somenteLeitura && execucoes.length ? await tx.sql<{ id: string }>`SELECT e.id
        FROM "IntegracaoExecucao" e WHERE e."parceiroId" = ${tx.parceiroId} AND e.id = ANY(${execucoes.map(e => e.id)}::text[])
        AND erp_integracao_pode_reler_dia(${tx.parceiroId}, ${loja.id}, e.id, e.geracao)` : [];
      const paraReleitura = new Set(elegiveis.map(e => e.id));
      const snapshots = execucoes.length ? await tx.integracaoSnapshot.findMany({
        where: { execucaoId: { in: execucoes.map(e => e.id) }, situacao: { in: ['PUBLICADO', 'PENDENTE_PERIODO'] } },
        orderBy: { geracao: 'desc' }, distinct: ['execucaoId', 'situacao'],
        select: { execucaoId: true, situacao: true, geracao: true, criadoEm: true },
      }) : [];
      const recibo = ambiente === 'TEST' ? null : await tx.integracaoFaturamentoDia.findFirst({
        where: { lojaId: loja.id, dia: data, canal: 'IFOOD', fonte: 'ifood-analytics' },
        select: { estado: true, motivo: true, revisaoSolicitada: true, revisaoConferida: true, aplicadoEm: true, conferidaEm: true,
          fontes: { select: { conexaoId: true } } },
      });
      const aplicadas = new Set(recibo?.fontes.map(f => f.conexaoId) ?? []);
      // Todas as conexões, inclusive desligadas: a referência aplicada não desaparece da tela ao religar.
      const fontes = conexoes.map(c => {
        const modulo = c.modulos[0] ?? null;
        const e = execucoes.find(x => x.moduloId === modulo?.id);
        const publicada = snapshots.find(s => s.execucaoId === e?.id && s.situacao === 'PUBLICADO');
        const pendente = snapshots.find(s => s.execucaoId === e?.id && s.situacao === 'PENDENTE_PERIODO');
        const estado: EstadoDaTentativaAnalytics = e && ESTADOS.has(e.estado) ? e.estado as EstadoDaTentativaAnalytics : 'DESCONHECIDO';
        const detalhe = nivel1 && e ? { nivel1: {
          geracao: e.geracao, paginasConfirmadas: paginas.get(e.id) ?? 0, inicioDaGeracao: iso(e.iniciadaEm),
          podeReagendar: paraReleitura.has(e.id),
        } } : {};
        return {
          chave: c.id, nome: c.nomeExterno, marca: c.marca?.nome ?? null, vinculada: c.estado === 'ATIVA', aplicada: aplicadas.has(c.id),
          acesso: mensagemDoAcessoAnalytics(modulo?.estado ?? null, c.estado === 'ATIVA'),
          // O planejador conserva o início antigo ao reagendar. Ele não é o início da nova tentativa prevista.
          tentativa: e ? { estado, mensagem: mensagemDaTentativaAnalytics(estado, e.ultimoErro), iniciadaEm: estado === 'PLANEJADA' ? null : iso(e.iniciadaEm), concluidaEm: estado === 'PLANEJADA' ? null : iso(e.concluidaEm), naoAntesDe: estado === 'AGUARDANDO' ? iso(e.naoAntesDe) : null, ...detalhe } : null,
          versaoDisponivel: publicada ? { publicadaEm: publicada.criadoEm.toISOString() } : null,
          revisaoPendente: !!pendente && (!publicada || pendente.geracao > publicada.geracao),
        };
      });
      const disponiveis = fontes.filter(f => f.versaoDisponivel !== null).length;
      const cobertura: SituacaoAnalyticsDaLoja['cobertura'] = conflito[0].ambigua || new Set(merchants).size !== merchants.length ? 'vinculo-ambiguo'
        : fontes.length === 0 ? 'sem-fontes' : disponiveis === 0 ? 'sem-leitura' : disponiveis === fontes.length ? 'disponivel' : 'parcial';
      return { ok: true, lojas, dia, ambiente, situacao: { loja, dia, fuso: 'America/Sao_Paulo', ambiente, fontes, cobertura,
        aplicacao: aplicacaoDoDia(recibo, ambiente === 'TEST'), podeVerFaturamento: pode(alcance, 'faturamento.ver', { lojaId: loja.id }) } };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof LeituraSemFotografia || erro instanceof ErroDeRelatorio) return indisponivel();
    throw erro;
  }
}

/** Origem já aplicada: exige só faturamento.ver; bloqueio de Integração não esconde o faturamento existente. */
export async function lerOrigemAnalyticsNoFaturamento(
  cliente: ClienteDoParceiro, alcance: Alcance, entrada: { lojaId: string; dia: string },
): Promise<OrigemAnalyticsNoFaturamento | null> {
  if (!entrada || lojaDigitada(entrada.lojaId) !== entrada.lojaId || !diaValidoDaSituacao(entrada.dia)
    || recusa(alcance, 'faturamento.ver', { lojaId: entrada.lojaId })) return null;
  try {
    return await cliente.transacao(async tx => {
      await confirmarFotografia(tx);
      const loja = await tx.loja.findFirst({ where: { id: entrada.lojaId }, select: { id: true } });
      if (!loja) return null;
      const recibo = await tx.integracaoFaturamentoDia.findFirst({
        where: { lojaId: entrada.lojaId, dia: new Date(`${entrada.dia}T00:00:00.000Z`), canal: 'IFOOD', fonte: 'ifood-analytics', aplicadoEm: { not: null } },
        select: { estado: true, revisaoSolicitada: true, revisaoConferida: true, aplicadoEm: true },
      });
      return recibo?.aplicadoEm ? { origem: 'ifood-analytics', aplicadoEm: recibo.aplicadoEm.toISOString(), atualizacaoPendente: recibo.estado !== 'APLICADO' || recibo.revisaoSolicitada > recibo.revisaoConferida } : null;
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof LeituraSemFotografia || erro instanceof ErroDeRelatorio) return null;
    throw erro;
  }
}
