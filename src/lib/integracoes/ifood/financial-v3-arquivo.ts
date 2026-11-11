import { decimalFinancialEmCentavos } from './financial-dominio';
import {
  conferirEscopoConciliacaoV3, requestIdConciliacaoValido, type ProtocoloConciliacaoV3,
} from './financial-v3-conciliacao-resposta';
import type { acompanharConciliacaoFinancialV3 } from './financial-v3-consultas';
import { lerRegistrosCsvGzip } from './financial-v3-csv';

type Acompanhamento = Pick<Awaited<ReturnType<typeof acompanharConciliacaoFinancialV3>>, 'estado' | 'protocolo'>;

interface ArquivoInjetado {
  readonly protocolo: ProtocoloConciliacaoV3;
  readonly bytes: Uint8Array;
  /** Metadados externos do ensaio. Linhas conta os registros de dados, excluindo o cabeçalho. */
  readonly totaisInformados?: { readonly linhas?: number | null; readonly pedidos?: number | null };
}

interface ResumoArquivo {
  readonly integridade: 'VERIFICADA' | 'PARCIAL';
  readonly linhas: number;
  readonly pedidosDistintos: number;
  readonly valorComImpactoCentavos: bigint | null;
}

export class ErroArquivoConciliacaoV3 extends Error {
  constructor(readonly codigo: 'INDISPONIVEL' | 'PROTOCOLO' | 'ESCOPO' | 'CABECALHO' | 'REGISTRO' | 'TOTAIS' | 'TOTAIS_DIVERGENTES') {
    super('Arquivo de conciliação incompatível com a leitura solicitada.');
    this.name = 'ErroArquivoConciliacaoV3';
  }
}

function lerColunas(campos: readonly string[]) {
  if (new Set(campos).size !== campos.length || campos.some(campo => !campo || campo.trim() !== campo)) {
    throw new ErroArquivoConciliacaoV3('CABECALHO');
  }
  const colunas = {
    loja: campos.indexOf('loja_id'),
    competencia: campos.indexOf('competencia'),
    pedido: campos.indexOf('pedido_associado_ifood'),
    impacto: campos.indexOf('impacto_no_repasse'),
    valor: campos.indexOf('valor'),
  };
  if (Object.values(colunas).includes(-1)) throw new ErroArquivoConciliacaoV3('CABECALHO');
  return { ...colunas, largura: campos.length };
}

function lerContagem(valor: unknown): number | null {
  if (valor == null) return null;
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 0) throw new ErroArquivoConciliacaoV3('TOTAIS');
  return valor;
}

/** Lê um único arquivo sintético em memória. A integridade verifica somente as duas contagens deste arquivo. */
export async function lerArquivoConciliacaoV3(acompanhamento: Acompanhamento, arquivo: ArquivoInjetado): Promise<ResumoArquivo> {
  if (acompanhamento?.estado !== 'DISPONIVEL') throw new ErroArquivoConciliacaoV3('INDISPONIVEL');
  const esperado = conferirEscopoConciliacaoV3(acompanhamento.protocolo);
  const recebido = conferirEscopoConciliacaoV3(arquivo?.protocolo);
  if (!requestIdConciliacaoValido(acompanhamento.protocolo.requestId)
      || acompanhamento.protocolo.requestId !== arquivo.protocolo.requestId) throw new ErroArquivoConciliacaoV3('PROTOCOLO');
  if (esperado.merchantId !== recebido.merchantId || esperado.competencia !== recebido.competencia) {
    throw new ErroArquivoConciliacaoV3('ESCOPO');
  }
  const totais = arquivo.totaisInformados;
  if (totais !== undefined && (!totais || typeof totais !== 'object' || Array.isArray(totais)
      || Object.keys(totais).some(chave => chave !== 'linhas' && chave !== 'pedidos'))) throw new ErroArquivoConciliacaoV3('TOTAIS');
  const linhasInformadas = lerContagem(totais?.linhas);
  const pedidosInformados = lerContagem(totais?.pedidos);

  let colunas: ReturnType<typeof lerColunas> | undefined;
  let linhas = 0;
  const pedidos = new Set<string>();
  let soma: bigint | null = 0n;
  await lerRegistrosCsvGzip(arquivo.bytes, campos => {
    if (colunas === undefined) {
      colunas = lerColunas(campos);
      return;
    }
    if (campos.length !== colunas.largura) throw new ErroArquivoConciliacaoV3('REGISTRO');
    if (campos[colunas.loja].toLowerCase() !== esperado.merchantId || campos[colunas.competencia] !== esperado.competencia) {
      throw new ErroArquivoConciliacaoV3('ESCOPO');
    }
    const pedido = campos[colunas.pedido];
    if (pedido) {
      if (pedido.trim() !== pedido || /[\u0000-\u001f\u007f]/.test(pedido)) throw new ErroArquivoConciliacaoV3('REGISTRO');
      pedidos.add(pedido);
    }
    const valor = decimalFinancialEmCentavos(campos[colunas.valor]);
    const impacto = campos[colunas.impacto];
    if (impacto === '') soma = null;
    else if (impacto === 'SIM') {
      if (soma !== null) soma += valor;
    } else if (impacto !== 'NAO') throw new ErroArquivoConciliacaoV3('REGISTRO');
    linhas++;
  });
  if (!colunas) throw new ErroArquivoConciliacaoV3('CABECALHO');
  if ((linhasInformadas !== null && linhas !== linhasInformadas)
      || (pedidosInformados !== null && pedidos.size !== pedidosInformados)) throw new ErroArquivoConciliacaoV3('TOTAIS_DIVERGENTES');
  const verificada = linhasInformadas !== null && pedidosInformados !== null;
  return {
    integridade: verificada ? 'VERIFICADA' : 'PARCIAL', linhas, pedidosDistintos: pedidos.size,
    valorComImpactoCentavos: verificada && linhas > 0 ? soma : null,
  };
}
