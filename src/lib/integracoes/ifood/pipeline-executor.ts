/** Uma tarefa já adquirida. Sem banco/ambiente implícito: efeitos entram pelo repositório e transporte injetados. */
import {
  conferirConsultaDiaria, conferirPaginasAnalytics, consultaDoDia, consultaMinima,
  ErroContratoAnalytics, lerPaginaAnalytics, type PaginaRecebidaAnalytics,
} from './analytics';
import { conferirIdentidadePagamentos, consultaPagamentos, normalizarPagamentosAnalytics } from './analytics-pagamentos';
import { conferirIdentidadeComplementares, consultaComplementares, normalizarComplementaresAnalytics } from './analytics-complementares';
import { criarClienteIfood, type OpcoesDoCliente } from './http';
import { caminhoDosKpis } from './leitura-test';
import {
  ErroPipelineAnalytics, LIMITE_BYTES_JANELA, LIMITE_GRUPOS_JANELA,
  type FalhaAnalytics, type PaginaDoTransporte, type TarefaAnalytics,
} from './pipeline-tipos';

export type PublicacaoAnalytics = 'publicada' | 'vazia' | 'sem-mudanca' | 'pendente-periodo';
export interface RepositorioDoExecutorAnalytics {
  /** Revalida posse, acesso e fence; uma recusa interrompe também a próxima chamada HTTP. */
  renovar(tarefa: TarefaAnalytics): Promise<void>;
  salvarPagina(tarefa: TarefaAnalytics, pagina: PaginaDoTransporte): Promise<void>;
  publicar(tarefa: TarefaAnalytics): Promise<PublicacaoAnalytics>;
  publicarPagamentos(tarefa: TarefaAnalytics): Promise<Exclude<PublicacaoAnalytics, 'vazia'>>;
  publicarComplementares(tarefa: TarefaAnalytics): Promise<Exclude<PublicacaoAnalytics, 'vazia'>>;
  verificarAcesso(tarefa: TarefaAnalytics): Promise<void>;
  falhar(tarefa: TarefaAnalytics, falha: FalhaAnalytics): Promise<void>;
}
export interface OpcoesDoExecutorAnalytics {
  repositorio: RepositorioDoExecutorAnalytics;
  http: OpcoesDoCliente & { env: Readonly<Record<string, string | undefined>> };
}
export interface ResultadoDaExecucaoAnalytics {
  estado: PublicacaoAnalytics | 'acesso-verificado' | 'falhou';
  /** Recibos cujo staging foi confirmado; evidência guardada não implica contrato diário válido. */
  paginas: number;
}

/**
 * A fila decide retomadas duráveis. Este executor não dorme para repetir 429/5xx/rede nem retoma pela idade do lease.
 * A renovação única de token após 401 continua no cliente canônico; cada emissão passa novamente pelo guard.
 * TEST conserva sua identidade isolada. A marginal de pagamentos nunca sinaliza faturamento/DRE.
 */
export async function executarTarefaAnalytics(tarefa: TarefaAnalytics, o: OpcoesDoExecutorAnalytics): Promise<ResultadoDaExecucaoAnalytics> {
  const repo = o.repositorio;
  let paginas = 0;
  let metadados: Pick<FalhaAnalytics, 'http' | 'requestId'> = {};
  const falhar = async (falha: FalhaAnalytics): Promise<ResultadoDaExecucaoAnalytics> => {
    await repo.falhar(tarefa, falha);
    return { estado: 'falhou', paginas };
  };
  try {
    // Não permite que opções de outro app/ambiente transportem a identidade adquirida.
    if (o.http.app.id !== tarefa.appId || o.http.app.ambiente !== tarefa.identidade.ambiente
      || (tarefa.perfil === 'diario' ? tarefa.identidade.perfil !== 'diario' : tarefa.perfil === 'acesso'
        ? tarefa.identidade.perfil !== 'homologacao' : tarefa.identidade.perfil !== tarefa.perfil)) {
      throw new ErroContratoAnalytics('IDENTIDADE', 'O cliente não corresponde à tarefa adquirida.');
    }
    if (tarefa.perfil === 'pagamentos') {
      conferirIdentidadePagamentos(tarefa.identidade);
      if (tarefa.identidade.fuso !== tarefa.fuso) throw new ErroContratoAnalytics('IDENTIDADE', 'O fuso não corresponde à tarefa adquirida.');
    } else if (tarefa.perfil === 'complementares') {
      conferirIdentidadeComplementares(tarefa.identidade);
      if (tarefa.identidade.fuso !== tarefa.fuso) throw new ErroContratoAnalytics('IDENTIDADE', 'O fuso não corresponde à tarefa adquirida.');
    } else conferirPaginasAnalytics(tarefa.identidade, []); // antes de token ou rede
    const cliente = criarClienteIfood({
      ...o.http, maxTentativas: 1, esperaMaximaMs: 0,
      transporte: async pedido => {
        // Também cobre a emissão após espera do limitador/renovação de token e a segunda emissão em 401.
        await repo.renovar(tarefa);
        return o.http.transporte(pedido);
      },
    });
    const recebidas: PaginaRecebidaAnalytics[] = [];
    let bytes = 0;
    for (let pagina = 1; pagina <= 1_000; pagina++) {
      await repo.renovar(tarefa);
      const consulta = tarefa.perfil === 'diario' ? consultaDoDia(tarefa.identidade.dia, pagina) : tarefa.perfil === 'pagamentos'
        ? consultaPagamentos(tarefa.identidade.dia) : tarefa.perfil === 'complementares'
          ? consultaComplementares(tarefa.identidade.dia) : consultaMinima(tarefa.identidade.dia, pagina);
      const resultado = await cliente.chamar({
        metodo: 'POST', caminho: caminhoDosKpis(tarefa.identidade.merchantId), familia: 'analytics',
        corpo: consulta, idempotente: true, preservarCorpo: true,
      });
      if (!resultado.ok) {
        return falhar({
          codigo: resultado.classificacao.tipo, http: resultado.status, requestId: resultado.requestId,
          ...(resultado.classificacao.tipo === 'limite' && resultado.classificacao.prazo
            ? { naoAntesDe: resultado.classificacao.prazo.naoAntesDe } : {}),
        });
      }
      metadados = { http: resultado.status, requestId: resultado.requestId };
      if (typeof resultado.corpoOriginal !== 'string') throw new ErroContratoAnalytics('ESQUEMA', 'Falta o corpo original da página.');
      const tamanho = Buffer.byteLength(resultado.corpoOriginal, 'utf8');
      bytes += tamanho;
      if (tamanho > 2 * 1024 * 1024 || bytes > LIMITE_BYTES_JANELA) return falhar({ codigo: 'limite-local', ...metadados });
      // A validação usa os mesmos bytes que serão recebidos/hashados pelo repositório, nunca uma projeção paralela.
      let resposta: unknown;
      try { resposta = JSON.parse(resultado.corpoOriginal); } catch { throw new ErroContratoAnalytics('ESQUEMA', 'Corpo do Analytics inválido.'); }
      if (resultado.status !== 200 || resposta === null) throw new ErroContratoAnalytics('ESQUEMA', 'A coleta exige JSON HTTP 200 não nulo.');
      // Conserva a evidência limitada, inclusive quando o contrato diário vier incompatível. Publicar revalida tudo.
      await repo.salvarPagina(tarefa, { pagina, corpoOriginal: resultado.corpoOriginal, http: resultado.status, requestId: resultado.requestId,
        ...(['pagamentos', 'complementares'].includes(tarefa.perfil) ? { versaoContrato: 1 as const } : {}) });
      paginas++;
      if (tarefa.perfil === 'pagamentos') {
        normalizarPagamentosAnalytics(tarefa.identidade, [{ identidade: tarefa.identidade, paginaSolicitada: pagina, versaoContrato: 1, corpoOriginal: resultado.corpoOriginal }]);
        return { estado: await repo.publicarPagamentos(tarefa), paginas };
      }
      if (tarefa.perfil === 'complementares') {
        normalizarComplementaresAnalytics(tarefa.identidade, [{ identidade: tarefa.identidade, paginaSolicitada: pagina, versaoContrato: 1, corpoOriginal: resultado.corpoOriginal }]);
        return { estado: await repo.publicarComplementares(tarefa), paginas };
      }
      if (tarefa.perfil === 'acesso') {
        // Consulta mínima usa terms, não groupBy. Isto prova acesso, nunca cobertura ou receita do dia.
        if (resultado.status !== 200 || !resposta || typeof resposta !== 'object' || Array.isArray(resposta)) {
          throw new ErroContratoAnalytics('ESQUEMA', 'A verificação de acesso exige um objeto JSON HTTP 200.');
        }
        await repo.verificarAcesso(tarefa);
        return { estado: 'acesso-verificado', paginas };
      }
      const lida = lerPaginaAnalytics(resposta, pagina);
      if (lida.totalItems > LIMITE_GRUPOS_JANELA) return falhar({ codigo: 'limite-local', http: resultado.status, requestId: resultado.requestId });
      if (lida.size > consulta.size) throw new ErroContratoAnalytics('PAGINACAO', 'Página maior que a consulta solicitada.');
      recebidas.push({ identidade: tarefa.identidade, paginaSolicitada: pagina, resposta });
      const conjunto = conferirPaginasAnalytics(tarefa.identidade, recebidas);
      if (!conferirConsultaDiaria(lida).compativel) {
        throw new ErroContratoAnalytics('CONSULTA_INCOMPATIVEL', 'Resposta incompatível com a consulta diária.');
      }
      if (conjunto.estado !== 'incompleto') {
        return { estado: await repo.publicar(tarefa), paginas };
      }
    }
    return falhar({ codigo: 'limite-local' });
  } catch (erro) {
    if (erro instanceof ErroContratoAnalytics) return falhar({ codigo: 'contrato', ...metadados });
    if (erro instanceof ErroPipelineAnalytics && (erro.codigo === 'CORPO' || erro.codigo === 'LIMITE')) {
      return falhar({ codigo: erro.codigo === 'LIMITE' ? 'limite-local' : 'contrato', ...metadados });
    }
    // Posse/acesso recusados e falhas de persistência não viram um sucesso nem uma falha supostamente gravada.
    throw erro;
  }
}
