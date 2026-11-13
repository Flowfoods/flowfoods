/** INT-1.8A: contratos operacionais. Não contêm métricas, payloads ou configuração de apps. */
export type TomDaSituacaoAnalytics = 'ok' | 'alerta' | 'erro' | 'neutro';
export interface MensagemDaSituacaoAnalytics { rotulo: string; explicacao: string; tom: TomDaSituacaoAnalytics }

/** Construído exclusivamente de ctx.parceiro no servidor, nunca de searchParams/FormData. */
export interface ContextoServidorAnalytics { parceiroId: string; homologacaoDeIntegracao: boolean }
export interface EntradaSituacaoAnalytics { lojaId?: unknown; dia?: unknown }
export interface LojaDaSituacaoAnalytics { id: string; nome: string; ativa: boolean }
export type EstadoDaTentativaAnalytics = 'PLANEJADA' | 'EXECUTANDO' | 'SUCESSO' | 'FALHA' | 'AGUARDANDO' | 'PENDENTE_PERIODO' | 'DESCONHECIDO';
export interface PedidoReleituraAnalytics {
  lojaId: string;
  conexaoId: string;
  dia: string;
  estado: EstadoDaTentativaAnalytics;
  geracao: number;
}
export function estadoParaReleitura(estado: unknown): boolean {
  return estado === 'SUCESSO' || estado === 'FALHA' || estado === 'PENDENTE_PERIODO' || estado === 'EXECUTANDO';
}
export interface TentativaDaSituacaoAnalytics {
  estado: EstadoDaTentativaAnalytics;
  mensagem: MensagemDaSituacaoAnalytics;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  /** Limite mínimo persistido, somente quando aguarda; não define o horário de execução. */
  naoAntesDe: string | null;
  /** Somente a Central de produção. As páginas são da geração indicada, inclusive após uma retomada. */
  nivel1?: { geracao: number; paginasConfirmadas: number; inicioDaGeracao: string | null; podeReagendar: boolean };
}
export interface FonteDaSituacaoAnalytics {
  chave: string;
  nome: string;
  marca: string | null;
  vinculada: boolean;
  aplicada: boolean;
  acesso: MensagemDaSituacaoAnalytics;
  tentativa: TentativaDaSituacaoAnalytics | null;
  versaoDisponivel: { publicadaEm: string } | null;
  revisaoPendente: boolean;
}
export interface AplicacaoDaSituacaoAnalytics {
  estado: 'sem-aplicacao' | 'aplicado' | 'pendente' | 'teste';
  mensagem: MensagemDaSituacaoAnalytics;
  aplicadoEm: string | null;
  conferidaEm: string | null;
  mantemAplicacaoAnterior: boolean;
}
export interface SituacaoAnalyticsDaLoja {
  loja: LojaDaSituacaoAnalytics;
  dia: string;
  fuso: 'America/Sao_Paulo';
  ambiente: 'TEST' | 'PRODUCAO';
  fontes: FonteDaSituacaoAnalytics[];
  cobertura: 'sem-fontes' | 'sem-leitura' | 'parcial' | 'disponivel' | 'vinculo-ambiguo';
  aplicacao: AplicacaoDaSituacaoAnalytics;
  podeVerFaturamento: boolean;
}
export type MotivoRecusaSituacaoAnalytics = 'sem-permissao' | 'sem-modulo' | 'entrada-invalida' | 'loja-indisponivel' | 'contexto-invalido' | 'ambiente-incompativel' | 'leitura-indisponivel';
export type ResultadoSituacaoAnalytics =
  | { ok: true; lojas: LojaDaSituacaoAnalytics[]; dia: string; ambiente: 'TEST' | 'PRODUCAO'; situacao: SituacaoAnalyticsDaLoja | null }
  | { ok: false; motivo: MotivoRecusaSituacaoAnalytics; mensagem: string };

/** Selo financeiro mínimo; não exige integracao.ver e não expõe o motivo técnico. */
export interface OrigemAnalyticsNoFaturamento {
  origem: 'ifood-analytics';
  aplicadoEm: string;
  atualizacaoPendente: boolean;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
export function diaValidoDaSituacao(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !DIA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === valor && valor >= '0001-01-01' && valor <= '9999-12-31';
}

export function ontemDaSituacaoAnalytics(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const parte = (tipo: string) => partes.find(p => p.type === tipo)!.value;
  const d = new Date(`${parte('year')}-${parte('month')}-${parte('day')}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function mensagemDoAcessoAnalytics(estado: string | null, vinculada: boolean): MensagemDaSituacaoAnalytics {
  if (!vinculada) return { rotulo: 'Vínculo desligado', explicacao: 'O vínculo está desligado. As leituras anteriores continuam identificadas.', tom: 'alerta' };
  switch (estado) {
    case 'ATIVO': return { rotulo: 'Acesso ativo', explicacao: 'O acesso está ativo. Isso não confirma que o dia já foi lido ou aplicado.', tom: 'ok' };
    case 'PAUSADO': return { rotulo: 'Coleta pausada', explicacao: 'A coleta está pausada nesta conexão; a versão anterior é preservada.', tom: 'alerta' };
    case 'ERRO_PERMISSAO': return { rotulo: 'Acesso recusado pelo iFood', explicacao: 'Confira a autorização no Portal do Parceiro do iFood e avise a FlowFoods.', tom: 'erro' };
    case 'AUTORIZADO': return { rotulo: 'Autorizado pela loja', explicacao: 'A autorização existe, mas a coleta ainda não está ativa nesta conexão.', tom: 'neutro' };
    case 'SOLICITADO': return { rotulo: 'Aguardando autorização', explicacao: 'Quem administra a loja precisa conferir o pedido no Portal do Parceiro do iFood.', tom: 'alerta' };
    case 'NAO_SOLICITADO': case null: return { rotulo: 'Em preparação', explicacao: 'O acesso aos números desta loja ainda está em preparação.', tom: 'neutro' };
    default: return { rotulo: 'Situação a conferir', explicacao: 'A FlowFoods precisa conferir a situação deste acesso.', tom: 'alerta' };
  }
}

export function mensagemDaTentativaAnalytics(estado: EstadoDaTentativaAnalytics, erro: string | null): MensagemDaSituacaoAnalytics {
  if (estado === 'PLANEJADA') return { rotulo: 'Leitura prevista', explicacao: 'Há uma leitura prevista para este dia, ainda sem horário definido.', tom: 'neutro' };
  if (estado === 'EXECUTANDO') return { rotulo: 'Leitura em andamento', explicacao: 'A tentativa está em andamento. Aguarde a confirmação da versão disponível.', tom: 'neutro' };
  if (estado === 'SUCESSO') return { rotulo: 'Tentativa concluída', explicacao: 'A tentativa foi concluída. A data da versão disponível pode ser anterior se o conteúdo não mudou.', tom: 'ok' };
  if (estado === 'PENDENTE_PERIODO') return { rotulo: 'Revisão pendente de período', explicacao: 'Há uma revisão pendente para um período fechado. A versão disponível anterior é preservada.', tom: 'alerta' };
  if (estado === 'AGUARDANDO') {
    if (erro === 'limite') return { rotulo: 'Aguardando o limite de chamadas', explicacao: 'O iFood pediu uma espera antes de outra tentativa. O limite persistido não garante execução naquele horário.', tom: 'alerta' };
    if (erro === 'indisponivel') return { rotulo: 'Aguardando nova tentativa', explicacao: 'Não foi possível atualizar por uma indisponibilidade temporária. A leitura aguarda nova tentativa; o prazo não garante execução naquele horário.', tom: 'alerta' };
    return { rotulo: 'Aguardando nova tentativa', explicacao: 'A leitura aguarda nova tentativa. O limite de espera não garante execução naquele horário.', tom: 'alerta' };
  }
  if (estado === 'DESCONHECIDO') return { rotulo: 'Situação a conferir', explicacao: 'Não foi possível interpretar a situação desta tentativa.', tom: 'alerta' };
  switch (erro) {
    case 'configuracao': return { rotulo: 'Configuração da coleta a conferir', explicacao: 'A FlowFoods precisa conferir a configuração do coletor antes de solicitar outra leitura.', tom: 'erro' };
    case 'sem-permissao': return { rotulo: 'Acesso recusado', explicacao: 'O iFood recusou o acesso nesta tentativa. Confira a autorização da loja com a FlowFoods.', tom: 'erro' };
    case 'nao-autenticado': return { rotulo: 'Autenticação recusada', explicacao: 'A FlowFoods precisa conferir a autenticação desta leitura.', tom: 'erro' };
    case 'requisicao-invalida': return { rotulo: 'Pedido de leitura recusado', explicacao: 'A FlowFoods precisa conferir o pedido de leitura enviado ao iFood.', tom: 'erro' };
    case 'limite': case 'prazo-invalido': return { rotulo: 'Retomada a conferir', explicacao: 'O limite de chamadas ou o prazo de retomada precisa ser conferido pela FlowFoods.', tom: 'alerta' };
    case 'contrato': case 'erro-no-corpo': case 'limite-local': return { rotulo: 'Leitura não aceita', explicacao: 'A leitura recebida precisa ser conferida. A versão disponível anterior é preservada.', tom: 'alerta' };
    case 'nao-encontrado': return { rotulo: 'Leitura não encontrada', explicacao: 'O iFood não encontrou a leitura solicitada. Isso não confirma ausência de movimento.', tom: 'alerta' };
    default: return { rotulo: 'Não foi possível atualizar', explicacao: 'A tentativa não confirmou uma atualização. A versão disponível anterior é preservada.', tom: 'alerta' };
  }
}

export function mensagemDaPendenciaAnalytics(motivo: string | null): MensagemDaSituacaoAnalytics {
  switch (motivo) {
    case 'PERIODO_FECHADO': return { rotulo: 'Período fechado', explicacao: 'A aplicação aguarda a conferência do período fechado.', tom: 'alerta' };
    case 'COBERTURA_INCOMPLETA': case 'SNAPSHOT_NAO_PUBLICADO': case 'SNAPSHOT_INCOMPLETO': return { rotulo: 'Leituras pendentes', explicacao: 'Ainda falta uma leitura utilizável de todas as fontes necessárias para este dia.', tom: 'alerta' };
    case 'ACESSO': return { rotulo: 'Acesso a conferir', explicacao: 'O acesso necessário à aplicação precisa ser conferido.', tom: 'alerta' };
    case 'VINCULO_AMBIGUO': case 'MARCA_DIVERGENTE': case 'IDENTIDADE': return { rotulo: 'Vínculo a conferir', explicacao: 'A identificação das fontes da loja precisa ser conferida antes da aplicação.', tom: 'alerta' };
    default: return { rotulo: 'Aplicação pendente', explicacao: 'A FlowFoods precisa conferir esta atualização antes de aplicá-la.', tom: 'alerta' };
  }
}
