/** Rotina independente da prospecção. Nenhuma conexão é criada, autorizada ou ativada por este processo. */
import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { integracaoIfoodAtiva } from './cofre';
import { appPorId } from './apps';
import { armazemDoBanco } from './armazem-token';
import { comPosseAnalytics } from './posse-analytics';
import { controleAnalytics, registrarDonoAnalytics, reservarChamadaAnalytics } from './controle-analytics';
import { planejarAnalytics } from '../ifood/pipeline-planejador';
import { agendarJanela, criarRepositorioAnalytics } from '../ifood/pipeline-repositorio';
import { executarTarefaAnalytics } from '../ifood/pipeline-executor';
import { ErroPipelineAnalytics } from '../ifood/pipeline-tipos';
import { ServicoDeToken } from '../ifood/auth';
import { Limitador } from '../ifood/limitador';
import { transporteFetch } from '../ifood/transporte';

type Log = (estado: string, detalhe?: Record<string, string | number>) => void;
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function criarRotinaAnalytics(log: Log, signal?: AbortSignal) {
  let ultimoParceiro = '';
  const ultimoModulo = new Map<string, string>();
  const limitador = new Limitador();
  return async function rodada(): Promise<void> {
    if (!integracaoIfoodAtiva()) return;
    const controle = await controleAnalytics();
    if (controle.pausada || (controle.bloqueadaAte && controle.bloqueadaAte.getTime() > Date.now())) return;
    const url = process.env.DATABASE_URL;
    if (!url) return;
    await comPosseAnalytics(url, async posse => {
      await registrarDonoAnalytics(posse);
      // Rodízio limitado: não carrega toda a base nem toda a história em memória.
      let parceiro = await prisma.parceiroFlow.findFirst({ where: { status: 'ATIVO', homologacaoDeIntegracao: false, id: { gt: ultimoParceiro } }, orderBy: { id: 'asc' }, select: { id: true } });
      if (!parceiro) {
        ultimoParceiro = '';
        parceiro = await prisma.parceiroFlow.findFirst({ where: { status: 'ATIVO', homologacaoDeIntegracao: false }, orderBy: { id: 'asc' }, select: { id: true } });
      }
      if (!parceiro) return;
      ultimoParceiro = parceiro.id;
      const cliente = doParceiro(parceiro.id);
      const liberado = await cliente.liberacaoDeModulo.findFirst({ where: { modulo: 'integracao', liberado: true } });
      if (!liberado) return;
      const filtro = { modulo: 'ANALYTICS' as const, estado: { in: ['ATIVO' as const, 'AUTORIZADO' as const] }, conexao: { estado: 'ATIVA' as const, ambiente: 'PRODUCAO' as const } };
      let modulo = await cliente.integracaoConexaoModulo.findFirst({ where: { ...filtro, id: { gt: ultimoModulo.get(parceiro.id) ?? '' } }, orderBy: { id: 'asc' } });
      if (!modulo) modulo = await cliente.integracaoConexaoModulo.findFirst({ where: filtro, orderBy: { id: 'asc' } });
      if (!modulo) return;
      if (ultimoModulo.size >= 1000 && !ultimoModulo.has(parceiro.id)) ultimoModulo.delete(ultimoModulo.keys().next().value!);
      ultimoModulo.set(parceiro.id, modulo.id);
      const app = await appPorId(modulo.appId);
      if (!app || app.ambiente !== 'PRODUCAO' || app.estadoHomologacao !== 'HOMOLOGADO') return;
      const [primeiro, pendentes] = await Promise.all([
        cliente.integracaoExecucao.findFirst({ where: { moduloId: modulo.id, perfil: 'diario' }, orderBy: { dia: 'asc' }, select: { dia: true, fuso: true, unidade: true } }),
        cliente.integracaoExecucao.count({ where: { moduloId: modulo.id, tipo: 'HISTORICO', estado: { in: ['PLANEJADA', 'EXECUTANDO', 'AGUARDANDO'] } } }),
      ]);
      const janelas = planejarAnalytics(Date.now(), {
        moduloId: modulo.id, ativo: modulo.estado === 'ATIVO',
        // O cadastro atual só atende o fuso da operação no Rio. A identidade da janela o torna explícito e imutável.
        fuso: primeiro?.fuso ?? 'America/Sao_Paulo', unidade: primeiro?.unidade === 'CENTAVO' ? 'CENTAVO' : 'REAL',
        primeiroDiaPlanejado: primeiro?.dia.toISOString().slice(0, 10), historicosPendentes: pendentes,
      });
      for (const janela of janelas) {
        if (!await posse.confirmar() || !integracaoIfoodAtiva()) return;
        await agendarJanela(cliente, janela);
      }
      const repo = criarRepositorioAnalytics(cliente, posse, () => !signal?.aborted && integracaoIfoodAtiva());
      const tarefa = await repo.adquirir();
      if (!tarefa) return;
      // A fila pode escolher outro módulo deste parceiro, conforme prioridade. Reobtém o app correspondente.
      const appDaTarefa = tarefa.appId === app.id ? app : await appPorId(tarefa.appId);
      if (!appDaTarefa || appDaTarefa.ambiente !== 'PRODUCAO') throw new ErroPipelineAnalytics('ACESSO', 'Coleta automática restrita ao ambiente de produção autorizado.');
      const transporte: typeof transporteFetch = async pedido => {
        const ms = await reservarChamadaAnalytics(posse);
        if (ms > 60_000) throw new ErroPipelineAnalytics('LIMITE', 'A cota local exige nova rodada.');
        await esperar(ms);
        await repo.renovar(tarefa);
        return transporteFetch(pedido);
      };
      // OAuth já mantém sua transação coordenada. Seu transporte não abre outra TX do mesmo pool
      // (inclusive connection_limit=1); a autorização da loja é reconferida na emissão Analytics seguinte.
      const tokens = new ServicoDeToken({ armazem: armazemDoBanco, transporte: transporteFetch, limitador });
      const resultado = await executarTarefaAnalytics(tarefa, {
        repositorio: repo,
        http: { app: { id: appDaTarefa.id, ambiente: appDaTarefa.ambiente, clientId: appDaTarefa.clientId, nomeDoSegredo: appDaTarefa.nomeDoSegredo, homologacao: appDaTarefa.estadoHomologacao }, tokens, limitador, transporte, env: process.env },
      });
      log(resultado.estado, { paginas: resultado.paginas });
    });
  };
}

/** O cancelamento acorda a espera; uma resposta em voo confere a chave antes de gravar. */
export async function executarRotinaAnalytics(signal: AbortSignal, log: Log): Promise<void> {
  const rodada = criarRotinaAnalytics(log, signal);
  while (!signal.aborted) {
    try { await rodada(); }
    catch { log('falha', { motivo: 'Coleta interrompida; retomada pela fila persistente.' }); }
    if (signal.aborted) break;
    await new Promise<void>(resolve => {
      const acabar = () => { clearTimeout(timer); signal.removeEventListener('abort', acabar); resolve(); };
      const timer = setTimeout(acabar, 5000);
      signal.addEventListener('abort', acabar, { once: true });
    });
  }
}
