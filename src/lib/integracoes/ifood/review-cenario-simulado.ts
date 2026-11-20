/** Dados inventados; tempos e limites são parâmetros do cenário, sem padrão operacional. */
import {
  aprovarReviewSimulada, criarReviewSimulada, iniciarTentativaReviewSimulada,
  reconciliarReviewSimulada, registrarResultadoReviewSimulada,
  type IdentidadeReviewSimulada, type ObservacaoReviewSimulada, type PreflightReviewSimulado,
} from './review-aprovacao-simulada';

export function cenarioReviewSimulado() {
  const identidade: IdentidadeReviewSimulada = { parceiro: 'parceiro-ficticio', loja: 'loja-ficticia', avaliacao: 'avaliacao-ficticia' };
  const origem = 'LOCAL_SIMULATION' as const;
  const modelo = criarReviewSimulada({ origem, identidade, redacao: {
    fatos: { versao: 'fonte-1', comentario: 'O pedido fictício chegou frio.' },
    politica: { id: 'politica-ficticia', versao: 'politica-1', orientacao: 'Acolher sem prometer compensação.' },
    texto: 'Obrigado por relatar sua experiência.', visibilidade: 'PUBLICA', editor: 'editor-ficticio',
  } });
  const observacao: ObservacaoReviewSimulada = {
    identidade, observadoEm: 2000, validoAte: 4000, cobertura: 'COMPLETA',
    status: 'NOT_REPLIED', versaoDaAvaliacao: 'fonte-1', respostas: [],
  };
  const preflight: PreflightReviewSimulado = {
    ...observacao, elegivel: true, prazoResponderAte: 5000, visibilidadePermitida: 'PUBLICA',
    politicaAtual: { id: 'politica-ficticia', versao: 'politica-1' }, limitesConfirmados: { minimo: 10, maximo: 300 },
  };
  return { origem, identidade, modelo, observacao, preflight };
}

export function simularAprovacaoReview() {
  const c = cenarioReviewSimulado();
  const aprovada = aprovarReviewSimulada(c.modelo, c.identidade, {
    papel: 'HUMANO_SIMULADO', responsavel: 'revisor-ficticio', revisao: 1, agora: 1000,
  });
  const emEnvio = iniciarTentativaReviewSimulada(aprovada, c.identidade, {
    id: 'intencao-ficticia-1', correlacao: 'correlacao-ficticia-1', agora: 2100, preflight: c.preflight,
  });
  const incerta = registrarResultadoReviewSimulada(emEnvio, c.identidade, {
    tipo: 'INCERTA', motivo: 'TIMEOUT', correlacao: 'correlacao-ficticia-1',
  });
  const leituraVazia = reconciliarReviewSimulada(incerta, c.identidade, {
    correlacao: 'correlacao-ficticia-1', agora: 3000,
    observacao: { ...c.observacao, observadoEm: 2900 }, prova: { tipo: 'SEM_PROVA_CONCLUSIVA' },
  });
  const respostaExistente = reconciliarReviewSimulada(leituraVazia, c.identidade, {
    correlacao: 'correlacao-ficticia-1', agora: 3100,
    observacao: { ...c.observacao, observadoEm: 3000, respostas: [{ id: 'resposta-ficticia', from: 'MERCHANT', texto: aprovada.redacao.texto }] },
    prova: { tipo: 'SEM_PROVA_CONCLUSIVA' },
  });
  return {
    origem: c.origem, efeitoExterno: 'NENHUM',
    estados: [c.modelo.estado, aprovada.estado, emEnvio.estado, incerta.estado, leituraVazia.estado, respostaExistente.estado],
    intencoes: respostaExistente.tentativas.length,
    autoriaDoEnvio: 'NAO_ATRIBUIDA',
    limite: 'Ensaio puro: não prova persistência, concorrência, acesso, TEST oficial ou resposta real.',
  };
}
