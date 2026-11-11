import { lerIdDaLojaIfood } from '../core/campos';
import { lerArquivoConciliacaoV3 } from './financial-v3-arquivo';
import { conferirEscopoConciliacaoV3, type ProtocoloConciliacaoV3 } from './financial-v3-conciliacao-resposta';
import type { consultarEventosFinancialV3 } from './financial-v3-consultas';
import { diaDoPainelValido } from './painel-campos';

type EventosConsultados = Awaited<ReturnType<typeof consultarEventosFinancialV3>>;
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

type Motivo = 'ARQUIVO_INDISPONIVEL' | 'ARQUIVO_PARCIAL' | 'IMPACTO_ARQUIVO_DESCONHECIDO'
  | 'EVENTOS_AUSENTES' | 'LOJA_DIVERGENTE' | 'JANELA_EVENTOS_DIVERGENTE' | 'RECEBEDOR_FORA_DA_LOJA'
  | 'COMPETENCIA_EVENTO_INCOMPATIVEL' | 'PRODUTO_INCOMPATIVEL' | 'MOEDA_ARQUIVO_SEM_BRL' | 'MOEDA_EVENTOS_SEM_BRL'
  | 'VINCULO_EVIDENCIA_ARQUIVO' | 'VINCULO_EVIDENCIA_EVENTOS' | 'COBERTURA_ARQUIVO_NAO_COMPROVADA'
  | 'COBERTURA_EVENTOS_NAO_COMPROVADA' | 'APURACAO_ARQUIVO_NAO_ENCERRADA' | 'APURACAO_EVENTOS_NAO_ENCERRADA'
  | 'IMPACTO_EVENTO_DESCONHECIDO' | 'VALOR_EVENTO_DESCONHECIDO';

type ResultadoComparacaoV3 = { origem: 'SIMULACAO' } & (
  | { estado: 'PENDENTE'; motivos: Motivo[]; arquivoComImpactoCentavos: null; eventosComImpactoCentavos: null; diferencaCentavos: null }
  | { estado: 'COINCIDENTE' | 'DIVERGENTE'; motivos: []; arquivoComImpactoCentavos: bigint; eventosComImpactoCentavos: bigint; diferencaCentavos: bigint }
);

function janelaDaCompetencia(consulta: Consulta, competencia: string): boolean {
  const inicio = competencia + '-01';
  const ultimoDia = new Date(inicio + 'T00:00:00Z');
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
  return consulta.inicio === inicio && consulta.fim === ultimoDia.toISOString().slice(0, 10);
}

function mesmaLoja(a: string | undefined, b: string | undefined): boolean {
  const id = lerIdDaLojaIfood(a);
  return id !== null && id === lerIdDaLojaIfood(b);
}

function conferirEvidencias(entrada: EntradaComparacaoV3, motivos: Set<Motivo>) {
  const { evidenciaArquivo: arquivo, evidenciaEventos: eventos } = entrada;
  const protocolo = entrada.acompanhamento?.protocolo;
  const consulta = entrada.eventos?.consulta;
  if (!protocolo || !arquivo?.protocolo || !mesmaLoja(protocolo.merchantId, arquivo.protocolo.merchantId)
      || protocolo.requestId !== arquivo.protocolo.requestId || protocolo.competencia !== arquivo.protocolo.competencia) {
    motivos.add('VINCULO_EVIDENCIA_ARQUIVO');
  }
  if (!consulta || !eventos?.consulta || !mesmaLoja(consulta.merchantId, eventos.consulta.merchantId)
      || consulta.inicio !== eventos.consulta.inicio || consulta.fim !== eventos.consulta.fim) {
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

function somarEventos(entrada: EntradaComparacaoV3, motivos: Set<Motivo>): bigint {
  const fonte = entrada.eventos;
  if (!fonte) {
    motivos.add('EVENTOS_AUSENTES');
    return 0n;
  }
  const { consulta, eventos, paginasLidas } = fonte;
  if (!Number.isSafeInteger(paginasLidas) || paginasLidas < 1 || !Array.isArray(eventos) || !lerIdDaLojaIfood(consulta?.merchantId)
      || !diaDoPainelValido(consulta.inicio) || !diaDoPainelValido(consulta.fim) || consulta.fim < consulta.inicio) {
    throw new Error('Resultado de consulta de eventos Financial v3 inválido.');
  }
  const protocolo = entrada.acompanhamento?.protocolo;
  if (protocolo) {
    const escopo = conferirEscopoConciliacaoV3(protocolo);
    if (!mesmaLoja(consulta.merchantId, escopo.merchantId)) motivos.add('LOJA_DIVERGENTE');
    if (!janelaDaCompetencia(consulta, escopo.competencia)) motivos.add('JANELA_EVENTOS_DIVERGENTE');
  }
  let soma = 0n;
  for (const evento of eventos) {
    if (!evento || (evento.impactoNoRepasse !== null && typeof evento.impactoNoRepasse !== 'boolean')
        || (evento.valorCentavos !== null && typeof evento.valorCentavos !== 'bigint')
        || (evento.produto !== null && typeof evento.produto !== 'string')
        || (evento.competencia !== null && !diaDoPainelValido(evento.competencia + '-01'))) {
      throw new Error('Ocorrência de eventos Financial v3 inválida.');
    }
    if (evento.recebedorForaDaLoja) motivos.add('RECEBEDOR_FORA_DA_LOJA');
    if (evento.competencia === null || evento.competencia !== protocolo?.competencia) motivos.add('COMPETENCIA_EVENTO_INCOMPATIVEL');
    if (!evento.produto || evento.produto !== entrada.evidenciaEventos?.produto) motivos.add('PRODUTO_INCOMPATIVEL');
    if (evento.impactoNoRepasse === null) motivos.add('IMPACTO_EVENTO_DESCONHECIDO');
    if (evento.impactoNoRepasse === true) {
      if (evento.valorCentavos === null) motivos.add('VALOR_EVENTO_DESCONHECIDO');
      else soma += evento.valorCentavos;
    }
  }
  return soma;
}

/** Compara somas mensais com impacto, em centavos exatos. As duas fontes são sintéticas. */
export async function compararConciliacaoEventosV3(entrada: EntradaComparacaoV3): Promise<ResultadoComparacaoV3> {
  if (entrada?.origem !== 'SIMULACAO') throw new Error('Origem incompatível com a comparação simulada Financial v3.');
  const origem = entrada.origem;
  const motivos = new Set<Motivo>();
  // Consome eventos e atestados antes do await. O leitor captura protocolo, contagens e bytes antes de descompactar.
  conferirEvidencias(entrada, motivos);
  const eventosComImpactoCentavos = somarEventos(entrada, motivos);
  let arquivoComImpactoCentavos: bigint | null = null;
  if (!entrada.arquivo || entrada.acompanhamento?.estado !== 'DISPONIVEL') {
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
