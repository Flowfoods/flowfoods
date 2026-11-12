import { lerArquivoConciliacaoV3 } from './financial-v3-arquivo';
import type { ProtocoloConciliacaoV3 } from './financial-v3-conciliacao-resposta';
import { mesmaLoja, mesmoIntervalo, somarEventosMensaisV3, type EventosConsultados, type MotivoEventosMensaisV3 } from './financial-v3-eventos-mensais';

type Consulta = EventosConsultados['consulta'];
type ParametrosArquivo = Parameters<typeof lerArquivoConciliacaoV3>;

/** Declarações do cenário sintético sobre uma fonte específica e o produto comparado. */
interface Evidencia {
  readonly produto?: string | null;
  readonly moeda?: string | null;
  readonly coberturaCompleta?: boolean | null;
  readonly apuracaoEncerrada?: boolean | null;
}

export interface EntradaComparacaoV3 {
  readonly origem: 'SIMULACAO';
  readonly acompanhamento: ParametrosArquivo[0] | null;
  readonly arquivo: ParametrosArquivo[1] | null;
  readonly eventos: EventosConsultados | null;
  readonly evidenciaArquivo?: (Evidencia & { readonly protocolo: ProtocoloConciliacaoV3 }) | null;
  readonly evidenciaEventos?: (Evidencia & { readonly consulta: Consulta }) | null;
}

type Motivo = MotivoEventosMensaisV3 | 'ARQUIVO_INDISPONIVEL' | 'ARQUIVO_PARCIAL' | 'IMPACTO_ARQUIVO_DESCONHECIDO'
  | 'MOEDA_ARQUIVO_SEM_BRL' | 'MOEDA_EVENTOS_SEM_BRL' | 'VINCULO_EVIDENCIA_ARQUIVO' | 'VINCULO_EVIDENCIA_EVENTOS'
  | 'COBERTURA_ARQUIVO_NAO_COMPROVADA' | 'COBERTURA_EVENTOS_NAO_COMPROVADA'
  | 'APURACAO_ARQUIVO_NAO_ENCERRADA' | 'APURACAO_EVENTOS_NAO_ENCERRADA';

type ResultadoComparacaoV3 = { origem: 'SIMULACAO' } & (
  | { estado: 'PENDENTE'; motivos: Motivo[]; arquivoComImpactoCentavos: null; eventosComImpactoCentavos: null; diferencaCentavos: null }
  | { estado: 'COINCIDENTE' | 'DIVERGENTE'; motivos: []; arquivoComImpactoCentavos: bigint; eventosComImpactoCentavos: bigint; diferencaCentavos: bigint }
);

function conferirEvidencias(entrada: EntradaComparacaoV3, motivos: Set<Motivo>) {
  const { evidenciaArquivo: arquivo, evidenciaEventos: eventos } = entrada;
  const protocolo = entrada.acompanhamento?.protocolo;
  const consulta = entrada.eventos?.consulta;
  if (!protocolo || !arquivo?.protocolo || !mesmaLoja(protocolo.merchantId, arquivo.protocolo.merchantId)
      || protocolo.requestId !== arquivo.protocolo.requestId || protocolo.competencia !== arquivo.protocolo.competencia) {
    motivos.add('VINCULO_EVIDENCIA_ARQUIVO');
  }
  if (!mesmoIntervalo(consulta, eventos?.consulta)) {
    motivos.add('VINCULO_EVIDENCIA_EVENTOS');
  }
  if (arquivo?.coberturaCompleta !== true) motivos.add('COBERTURA_ARQUIVO_NAO_COMPROVADA');
  if (eventos?.coberturaCompleta !== true) motivos.add('COBERTURA_EVENTOS_NAO_COMPROVADA');
  if (arquivo?.apuracaoEncerrada !== true) motivos.add('APURACAO_ARQUIVO_NAO_ENCERRADA');
  if (eventos?.apuracaoEncerrada !== true) motivos.add('APURACAO_EVENTOS_NAO_ENCERRADA');
  if (arquivo?.moeda !== 'BRL') motivos.add('MOEDA_ARQUIVO_SEM_BRL');
  if (eventos?.moeda !== 'BRL') motivos.add('MOEDA_EVENTOS_SEM_BRL');
  const produto = arquivo?.produto;
  if (typeof produto !== 'string' || produto.trim() === '' || produto.trim() !== produto || produto !== eventos?.produto) {
    motivos.add('PRODUTO_INCOMPATIVEL');
  }
}

/** Compara somas mensais com impacto, em centavos exatos. As duas fontes são sintéticas. */
export async function compararConciliacaoEventosV3(entrada: EntradaComparacaoV3): Promise<ResultadoComparacaoV3> {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com a comparação simulada Financial v3.');
  const origem = entrada.origem;
  const estadoArquivo = entrada.acompanhamento?.estado;
  if (entrada.acompanhamento != null && estadoArquivo !== 'DISPONIVEL' && estadoArquivo !== 'SEM_LANCAMENTOS'
      && estadoArquivo !== 'PROCESSANDO' && estadoArquivo !== 'PROTOCOLO_INDISPONIVEL') {
    throw new Error('Estado de acompanhamento da conciliação Financial v3 inválido.');
  }
  const motivos = new Set<Motivo>();
  // Consome eventos e atestados antes do await. O leitor captura protocolo, contagens e bytes antes de descompactar.
  conferirEvidencias(entrada, motivos);
  const eventosComImpactoCentavos = somarEventosMensaisV3(
    entrada.eventos, entrada.acompanhamento?.protocolo, entrada.evidenciaEventos?.produto, motivos,
  );
  let arquivoComImpactoCentavos: bigint | null = null;
  if (entrada.arquivo == null || !entrada.acompanhamento || estadoArquivo !== 'DISPONIVEL') {
    motivos.add('ARQUIVO_INDISPONIVEL');
  } else {
    const resumo = await lerArquivoConciliacaoV3(entrada.acompanhamento, entrada.arquivo);
    if (resumo.integridade === 'PARCIAL') motivos.add('ARQUIVO_PARCIAL');
    else if (resumo.linhas === 0) arquivoComImpactoCentavos = 0n; // Ambas as contagens conferidas explicitamente em zero.
    else if (resumo.valorComImpactoCentavos === null) motivos.add('IMPACTO_ARQUIVO_DESCONHECIDO');
    else arquivoComImpactoCentavos = resumo.valorComImpactoCentavos;
  }
  if (motivos.size || arquivoComImpactoCentavos === null) {
    return {
      origem, estado: 'PENDENTE', motivos: [...motivos], arquivoComImpactoCentavos: null,
      eventosComImpactoCentavos: null, diferencaCentavos: null,
    };
  }
  const diferencaCentavos = eventosComImpactoCentavos - arquivoComImpactoCentavos;
  return {
    origem, estado: diferencaCentavos === 0n ? 'COINCIDENTE' : 'DIVERGENTE', motivos: [],
    arquivoComImpactoCentavos, eventosComImpactoCentavos, diferencaCentavos,
  };
}
