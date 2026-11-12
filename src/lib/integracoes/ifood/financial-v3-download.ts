import { identidadeFinancialSimuladaValida, type IdentidadeFinancialSimulada } from './financial-dominio';
import { ErroArquivoConciliacaoV3, lerArquivoConciliacaoV3 } from './financial-v3-arquivo';
import { conferirEscopoConciliacaoV3, requestIdConciliacaoValido, type ProtocoloConciliacaoV3 } from './financial-v3-conciliacao-resposta';
import { copiarGzipConciliacaoV3 } from './financial-v3-csv';
import { mesmaIdentidadeMensalV3, mesmaLoja } from './financial-v3-eventos-mensais';

type LeituraArquivo = Parameters<typeof lerArquivoConciliacaoV3>;

export interface EntradaDownloadConciliacaoV3 {
  readonly origem: 'SIMULACAO';
  readonly pedido: { readonly identidade: IdentidadeFinancialSimulada; readonly protocolo: ProtocoloConciliacaoV3 };
  readonly acompanhamento: LeituraArquivo[0];
  readonly arquivo: LeituraArquivo[1] & { readonly identidade: IdentidadeFinancialSimulada };
}

/** Disponibiliza os bytes originais após conferir a identidade, o protocolo e as contagens do arquivo simulado. */
export async function prepararDownloadConciliacaoV3(entrada: EntradaDownloadConciliacaoV3) {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com o download simulado Financial v3.');
  const { pedido, acompanhamento, arquivo } = entrada;
  if (acompanhamento?.estado !== 'DISPONIVEL' || !arquivo) throw new ErroArquivoConciliacaoV3('INDISPONIVEL');
  if (!identidadeFinancialSimuladaValida(pedido?.identidade) || !identidadeFinancialSimuladaValida(arquivo.identidade)
      || !mesmaIdentidadeMensalV3(pedido.identidade, arquivo.identidade)) throw new ErroArquivoConciliacaoV3('ESCOPO');

  const { merchantId, competencia } = conferirEscopoConciliacaoV3({ merchantId: pedido.identidade.merchant, competencia: pedido.identidade.competencia });
  const requestId = pedido.protocolo?.requestId;
  if (!requestIdConciliacaoValido(requestId)) throw new ErroArquivoConciliacaoV3('PROTOCOLO');
  for (const protocolo of [pedido.protocolo, acompanhamento.protocolo, arquivo.protocolo]) {
    if (protocolo?.requestId !== requestId) throw new ErroArquivoConciliacaoV3('PROTOCOLO');
    if (!mesmaLoja(merchantId, protocolo.merchantId) || competencia !== protocolo.competencia) throw new ErroArquivoConciliacaoV3('ESCOPO');
  }

  const bytes = copiarGzipConciliacaoV3(arquivo.bytes);
  const resumo = await lerArquivoConciliacaoV3(acompanhamento, { protocolo: arquivo.protocolo, totaisInformados: arquivo.totaisInformados, bytes });
  if (resumo.integridade !== 'VERIFICADA') throw new ErroArquivoConciliacaoV3('TOTAIS');
  return {
    nomeArquivo: `conciliacao-simulada-${merchantId}-${competencia}.csv.gz`, tipoConteudo: 'application/gzip', bytes,
    resumo: { ...resumo, integridade: resumo.integridade },
  } as const;
}
