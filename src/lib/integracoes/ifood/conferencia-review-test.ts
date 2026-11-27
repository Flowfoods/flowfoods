import { ehAppIfoodDeTeste, type appPorId } from '../core/apps';
import { lerIdDaLojaIfood, segredoCombinaComAmbiente } from '../core/campos';
import { ErroDeCofre, exigirConfiguracao, integracaoIfoodAtiva, lerSegredo } from '../core/cofre';
import { ErroDeAutenticacao, ServicoDeToken, type AppParaToken, type ArmazemDeToken } from './auth';
import { criarClienteIfood, type ChamadaIfood } from './http';
import { CAMINHO_DAS_LOJAS } from './leitura-test';
import { Limitador } from './limitador';
import {
  chamadaDaListagemReview, chamadaDoDetalheReview, chamadaDoResumoReview,
  conferirDetalheReview, conferirPaginaReview, conferirResumoReview, ErroContratoReview,
} from './review-leitura';
import type { Transporte } from './transporte';

const OPCOES = ['--app-id', '--loja', '--de', '--ate'];
const ID_DO_APP = /^[A-Za-z0-9_-]{1,60}$/;
const ID_DE_CORRELACAO = /^[A-Za-z0-9_.:-]{1,120}$/;

function prepararConsulta(args: readonly string[]) {
  if (args.length !== OPCOES.length * 2) return null;
  const opcoes = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [opcao, valor] = [args[i], args[i + 1]];
    if (!OPCOES.includes(opcao) || opcoes.has(opcao) || !valor) return null;
    opcoes.set(opcao, valor);
  }
  const appId = opcoes.get('--app-id');
  const merchantId = lerIdDaLojaIfood(opcoes.get('--loja'));
  const de = opcoes.get('--de');
  const ate = opcoes.get('--ate');
  if (!appId || !ID_DO_APP.test(appId) || !merchantId || !de || !ate) return null;
  const parametros = { merchantId, de, ate, pagina: 1 };
  try {
    return { appId, parametros, chamada: chamadaDaListagemReview(parametros) };
  } catch (erro) {
    if (erro instanceof ErroContratoReview || erro instanceof RangeError) return null;
    throw erro;
  }
}

type Passo = 'lojas' | 'listagem' | 'detalhe' | 'resumo';

type RegistroHttp = {
  http: number | null;
  requestId: string | null;
  origem: 'endpoint' | 'autenticacao' | null;
};

type LeituraDoPasso = {
  estado: 'nao-consultado' | 'loja-confirmada' | 'loja-nao-confirmada'
    | 'observada' | 'vazia' | 'contagem-incompleta' | 'fora-das-paginas' | 'sem-avaliacao-na-pagina'
    | 'conferido' | 'acesso-negado' | 'autenticacao-inconclusiva' | 'indisponivel'
    | 'erro-http' | 'sem-resposta' | 'erro-contrato' | 'erro-identidade';
  codigoContrato?: ErroContratoReview['codigo'];
  lojasRecebidas?: number;
  paginaInformada?: number;
  tamanhoInformado?: number;
  avaliacoesRecebidas?: number;
  total?: number | null;
  paginas?: number | null;
  totalAvaliacoes?: number | null;
  avaliacoesValidas?: number | null;
  notaDisponivel?: boolean;
};

export type EvidenciaConferenciaReviewTest = {
  ambiente: 'TEST';
  appId: string;
  merchantId: string;
  quando: string;
  periodoDaListagem: { de: string; ate: string };
  paginaSolicitada: 1;
  resultado: 'amostra-conferida' | 'janela-vazia-confirmada' | 'inconclusiva';
  passos: Record<Passo, RegistroHttp & LeituraDoPasso>;
};

type MotivoDaRecusa = 'argumentos-invalidos' | 'fora-do-worker' | 'integracao-desligada' | 'app-nao-encontrado'
  | 'app-fora-do-teste' | 'review-nao-cadastrado' | 'segredo-fora-do-teste' | 'cofre-incompleto';

type ResultadoDaConferencia = { codigo: 2; motivo: MotivoDaRecusa } | {
  codigo: 0 | 1;
  evidencia: EvidenciaConferenciaReviewTest;
  auditoria: 'registrada' | 'nao-registrada' | 'falhou';
};

interface DependenciasDaConferencia {
  env: Readonly<Record<string, string | undefined>>;
  buscarApp: typeof appPorId;
  armazem: ArmazemDeToken;
  transporte: Transporte;
  agora?: () => number;
  registrar?: (evidencia: EvidenciaConferenciaReviewTest) => Promise<void>;
}

const recusar = (motivo: MotivoDaRecusa) => ({ codigo: 2 as const, motivo });
const semConsulta = () => ({ estado: 'nao-consultado', http: null, requestId: null, origem: null }) as const;

class TransporteInterrompido extends ErroDeAutenticacao {
  constructor() {
    super('A conferência precisa ser reiniciada a partir da lista de lojas.');
  }
}

export async function executarConferenciaReviewTest(
  args: readonly string[], d: DependenciasDaConferencia,
): Promise<ResultadoDaConferencia> {
  const consulta = prepararConsulta(args);
  if (!consulta) return recusar('argumentos-invalidos');
  const { appId, parametros, chamada } = consulta;
  const { merchantId, de, ate } = parametros;
  if (d.env.SERVICO_DA_INTEGRACAO !== '1') return recusar('fora-do-worker');
  if (!integracaoIfoodAtiva(d.env)) return recusar('integracao-desligada');

  const app = await d.buscarApp(appId);
  if (!app || app.id !== appId) return recusar('app-nao-encontrado');
  if (!ehAppIfoodDeTeste(app)) return recusar('app-fora-do-teste');
  if (!app.modulos.includes('REVIEW')) return recusar('review-nao-cadastrado');
  if (!segredoCombinaComAmbiente('TEST', app.nomeDoSegredo)) return recusar('segredo-fora-do-teste');
  try {
    if (!exigirConfiguracao([app.nomeDoSegredo], d.env)) return recusar('integracao-desligada');
  } catch (erro) {
    if (erro instanceof ErroDeCofre) return recusar('cofre-incompleto');
    throw erro;
  }

  const agora = d.agora ?? Date.now;
  const evidencia: EvidenciaConferenciaReviewTest = {
    ambiente: 'TEST', appId, merchantId, quando: new Date(agora()).toISOString(),
    periodoDaListagem: { de, ate }, paginaSolicitada: 1, resultado: 'inconclusiva',
    passos: { lojas: semConsulta(), listagem: semConsulta(), detalhe: semConsulta(), resumo: semConsulta() },
  };

  const segredo = lerSegredo(app.nomeDoSegredo, d.env);
  let credencialDaLista: string | undefined;
  let falhaHttp: RegistroHttp | null = null;
  let houveRespostaDeConsulta = false;
  const idSeguro = (id: string | null) => (
    id && ID_DE_CORRELACAO.test(id)
    && ![segredo, d.env.INTEGRACAO_CHAVE_CIFRAGEM, credencialDaLista?.slice('Bearer '.length)].some(valor => valor && id.includes(valor))
      ? id : null
  );
  const transporte: Transporte = async pedido => {
    // A prova da loja vale para o mesmo token. Uma renovação automática exige nova execução, desde /merchants.
    if (falhaHttp || (credencialDaLista && pedido.cabecalhos.Authorization !== credencialDaLista)) {
      throw new TransporteInterrompido();
    }
    const consulta = pedido.metodo === 'GET';
    if (consulta) credencialDaLista ??= pedido.cabecalhos.Authorization;
    const resposta = await d.transporte(pedido);
    if (consulta) houveRespostaDeConsulta = true;
    if (resposta.status < 200 || resposta.status >= 300) {
      falhaHttp = {
        http: resposta.status, origem: consulta ? 'endpoint' : 'autenticacao',
        requestId: idSeguro(resposta.cabecalhos['x-request-id'] ?? resposta.cabecalhos['x-trace-id'] ?? null),
      };
    }
    return resposta;
  };
  const appDoToken: AppParaToken = {
    id: appId, ambiente: 'TEST', clientId: app.clientId,
    nomeDoSegredo: app.nomeDoSegredo, homologacao: app.estadoHomologacao,
  };
  const limitador = new Limitador(agora);
  const tokens = new ServicoDeToken({
    armazem: d.armazem, transporte, limitador, env: d.env, relogio: agora,
    dormir: async () => { throw new ErroDeAutenticacao('A autenticação do app de teste não completou nesta conferência.'); },
  });
  const cliente = criarClienteIfood({
    app: appDoToken, tokens, limitador, transporte, env: d.env, relogio: agora, maxTentativas: 1,
  });

  async function consultar<T>(nome: Passo, chamada: ChamadaIfood, ler: (dados: unknown) => LeituraDoPasso & { valor: T }) {
    const resposta = await cliente.chamar(chamada).catch((erro: unknown) => {
      if (erro instanceof TransporteInterrompido) return null;
      throw erro;
    });
    if (falhaHttp) {
      const { http, origem } = falhaHttp;
      const estado = http === 401 || http === 403 ? 'acesso-negado'
        : nome === 'resumo' && origem === 'endpoint' && http === 404 ? 'indisponivel' : 'erro-http';
      evidencia.passos[nome] = { ...falhaHttp, estado };
      return null;
    }
    if (!resposta) {
      evidencia.passos[nome] = { ...semConsulta(), estado: 'autenticacao-inconclusiva' };
      return null;
    }
    const registro: RegistroHttp = {
      http: resposta.status, requestId: idSeguro(resposta.requestId), origem: resposta.status === null ? null : 'endpoint',
    };
    if (!resposta.ok || resposta.status !== 200) {
      const estado = resposta.status !== null ? 'erro-contrato'
        : !resposta.ok && resposta.classificacao.tipo === 'nao-autenticado' ? 'autenticacao-inconclusiva' : 'sem-resposta';
      evidencia.passos[nome] = { ...registro, estado };
      return null;
    }
    try {
      const { valor, ...campos } = ler(resposta.dados);
      evidencia.passos[nome] = { ...registro, ...campos };
      return valor;
    } catch (erro) {
      if (!(erro instanceof ErroContratoReview)) throw erro;
      evidencia.passos[nome] = {
        ...registro, estado: erro.codigo === 'IDENTIDADE' ? 'erro-identidade' : 'erro-contrato',
        codigoContrato: erro.codigo,
      };
      return null;
    }
  }

  async function conferirPassos() {
    const achouLoja = await consultar('lojas', { metodo: 'GET', caminho: CAMINHO_DAS_LOJAS, familia: 'merchant' }, dados => {
      if (!Array.isArray(dados)) throw new ErroContratoReview('ESQUEMA', 'Lista de lojas em formato inesperado.');
      const ids = dados.map((loja: unknown) => lerIdDaLojaIfood((loja as { id?: unknown } | null)?.id));
      if (ids.includes(null)) throw new ErroContratoReview('ESQUEMA', 'Lista de lojas sem identificadores válidos.');
      const valor = ids.includes(merchantId);
      return { estado: valor ? 'loja-confirmada' : 'loja-nao-confirmada', lojasRecebidas: ids.length, valor };
    });
    if (!achouLoja) return;

    const pagina = await consultar('listagem', chamada, dados => {
      const recebida = conferirPaginaReview(parametros, dados);
      return {
        estado: recebida.estado, paginaInformada: recebida.paginaInformada, tamanhoInformado: recebida.tamanhoInformado,
        avaliacoesRecebidas: recebida.avaliacoes.length, total: recebida.total, paginas: recebida.paginas,
        valor: { estado: recebida.estado, reviewId: recebida.avaliacoes[0]?.id },
      };
    });
    if (!pagina) return;

    if (pagina.reviewId) {
      const detalhe = { merchantId, reviewId: pagina.reviewId };
      const conferiu = await consultar('detalhe', chamadaDoDetalheReview(detalhe), dados => {
        const resultado = conferirDetalheReview(detalhe, dados);
        return { estado: resultado.estado, valor: resultado.estado === 'conferido' };
      });
      if (!conferiu) return;
    } else {
      evidencia.passos.detalhe.estado = 'sem-avaliacao-na-pagina';
    }

    const resumiu = await consultar('resumo', chamadaDoResumoReview({ merchantId }), dados => {
      const resumo = conferirResumoReview({ merchantId }, dados);
      return {
        estado: 'conferido', totalAvaliacoes: resumo.totalAvaliacoes, avaliacoesValidas: resumo.avaliacoesValidas,
        notaDisponivel: resumo.nota !== null, valor: true,
      };
    });
    if (!resumiu) return;
    if (pagina.estado === 'observada') evidencia.resultado = 'amostra-conferida';
    if (pagina.estado === 'vazia') evidencia.resultado = 'janela-vazia-confirmada';
  }

  await conferirPassos();
  let auditoria: 'registrada' | 'nao-registrada' | 'falhou' = 'nao-registrada';
  if (houveRespostaDeConsulta && d.registrar) {
    try {
      await d.registrar(evidencia);
      auditoria = 'registrada';
    } catch {
      auditoria = 'falhou';
    }
  }
  return { codigo: evidencia.resultado === 'inconclusiva' || auditoria === 'falhou' ? 1 : 0, evidencia, auditoria };
}
