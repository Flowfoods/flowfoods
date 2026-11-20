import { conferirCoberturaReviewSimulada, type EntradaCoberturaReviewSimulada, type RegistroReviewSimulado } from './review-cobertura-simulada';

/** Instantes e validade pertencem somente à fixture; não definem frequência ou retenção reais. */
export function cenarioCoberturaReviewSimulado(): EntradaCoberturaReviewSimulada {
  const contexto = { consultaId: 'consulta-ficticia', execucaoId: 'execucao-ficticia-1',
    identidade: { parceiro: 'parceiro-ficticio', loja: 'loja-ficticia' }, intervalo: { inicio: 1000, fim: 2000 } };
  const base = { ...contexto, tipo: 'OK' as const, snapshotId: 'snapshot-ficticio', observadaEm: 3100, validaAte: 4000 };
  const registro: RegistroReviewSimulado = { id: 'avaliacao-1', versao: 'v1', criadoEm: 1000,
    conteudoSintetico: 'Avaliação inventada A', elegibilidade: 'ELEGIVEL' };
  return { origem: 'LOCAL_SIMULATION', ...contexto, snapshotId: 'snapshot-ficticio', iniciadaEm: 3000, agora: 3500, primeiraPagina: 'pagina-A',
    paginas: [
      { ...base, id: 'pagina-A', proxima: { tipo: 'PAGINA', id: 'pagina-B' }, registros: [registro] },
      { ...base, id: 'pagina-B', observadaEm: 3200, proxima: { tipo: 'FIM' }, registros: [registro, {
        id: 'avaliacao-2', versao: 'v1', criadoEm: 1999, conteudoSintetico: 'Avaliação inventada B', elegibilidade: 'DESCONHECIDA',
      }] },
    ],
  };
}

export function simularCoberturaReview() {
  const c = cenarioCoberturaReviewSimulado();
  const completa = conferirCoberturaReviewSimulada(c);
  const parcial = conferirCoberturaReviewSimulada({ ...c, paginas: c.paginas.slice(0, 1) });
  const atrasada = conferirCoberturaReviewSimulada({ ...c, agora: 4000 });
  return { origem: 'LOCAL_SIMULATION', efeitoExterno: 'NENHUM',
    completa: { cobertura: completa.cobertura, observado: completa.observado, totais: completa.totais },
    parcial: { cobertura: parcial.cobertura, problemas: parcial.problemas, totais: parcial.totais },
    atrasada: { cobertura: atrasada.cobertura, problemas: atrasada.problemas, totais: atrasada.totais },
    limite: 'Fixtures abstratas não provam paginação, consistência de snapshot, acesso ou cobertura oficiais.',
  };
}
