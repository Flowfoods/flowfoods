import { hojeNoRio } from '@/lib/erp/compra-campos';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { filtroDeLojas, pode, type Alcance } from '@/lib/erp/permissoes';
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { diaDoPainelValido } from '../ifood/painel-campos';
import type { AmbienteDeIntegracao } from './campos';
import type { EstadoDoModulo } from './estados';
import { listarRecibosFontesFinancial } from './fontes-financial';

type Loja = { id: string; nome: string };
type Conexao = { id: string; nome: string; estado: 'ATIVA' | 'DESLIGADA'; estadoFinancial: EstadoDoModulo | null; merchantDoModelo?: string };
type Motivo = 'sem-permissao' | 'nao-liberado' | 'filtro-invalido' | 'contexto-invalido' | 'leitura-indisponivel';

export type ResultadoConferenciaFinancial =
  | { ok: false; motivo: Motivo; mensagem: string }
  | {
    ok: true;
    lojas: Loja[];
    loja: Loja | null;
    competencia: string;
    ambiente: AmbienteDeIntegracao;
    conexoes: Conexao[];
    fonteMensal: 'SEM_DADOS' | 'RECEBIDA_PARA_CONFERENCIA';
    recibos: Awaited<ReturnType<typeof listarRecibosFontesFinancial>>;
  };

export function podeVerConferenciaFinancial(alcance: Alcance, lojaId?: string): boolean {
  return pode(alcance, 'integracao.ver', { lojaId }) && pode(alcance, 'faturamento.ver', { lojaId });
}

const recusar = (motivo: Motivo, mensagem: string): ResultadoConferenciaFinancial => ({ ok: false, motivo, mensagem });
const lojaIndisponivel = () => recusar('sem-permissao', 'Esta loja não está disponível no seu acesso.');
const leituraIndisponivel = () => recusar('leitura-indisponivel', 'Não foi possível conferir os vínculos da loja agora. Tente novamente em instantes.');

/** A conexão informa o cadastro atual. Uma competência só terá valores quando existir uma fonte Financial conciliada no ERP. */
export async function lerConferenciaFinancial(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  contexto: { parceiroId: string; homologacaoDeIntegracao: boolean },
  entrada: { lojaId?: unknown; competencia?: unknown; paginaRecibos?: unknown } = {},
): Promise<ResultadoConferenciaFinancial> {
  if (!contexto || contexto.parceiroId !== cliente.parceiroId || typeof contexto.homologacaoDeIntegracao !== 'boolean') {
    return recusar('contexto-invalido', 'Não foi possível conferir o contexto deste parceiro.');
  }
  if (!podeVerConferenciaFinancial(alcance)) {
    return recusar('sem-permissao', 'Seu acesso precisa incluir Integração e Faturamento para consultar a conferência.');
  }
  const lojaId = entrada.lojaId;
  const competencia = entrada.competencia === undefined ? hojeNoRio().slice(0, 7) : entrada.competencia;
  if (typeof competencia !== 'string' || !diaDoPainelValido(competencia + '-01')) {
    return recusar('filtro-invalido', 'Escolha uma competência válida.');
  }
  if (lojaId !== undefined && (typeof lojaId !== 'string' || !lojaId || lojaId.length > 128 || lojaId !== lojaId.trim())) {
    return recusar('filtro-invalido', 'Escolha uma loja válida.');
  }
  if (lojaId !== undefined && !podeVerConferenciaFinancial(alcance, lojaId)) return lojaIndisponivel();
  const pagina = entrada.paginaRecibos === undefined ? '1' : entrada.paginaRecibos;
  if (typeof pagina !== 'string' || !/^[1-9]\d{0,5}$/.test(pagina))
    return recusar('filtro-invalido', 'Escolha uma página válida no histórico de recibos.');
  const ambiente = contexto.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';

  try {
    return await cliente.transacao(async (tx): Promise<ResultadoConferenciaFinancial> => {
      // Uma chamada em transação já aberta reaproveita seu isolamento.
      const [fotografia] = await tx.sql<{ repetivel: boolean; leitura: boolean }>`SELECT
        current_setting('transaction_isolation') IN ('repeatable read', 'serializable') AS repetivel,
        current_setting('transaction_read_only') = 'on' AS leitura`;
      if (!tx.somenteLeitura || !fotografia?.repetivel || !fotografia.leitura) return leituraIndisponivel();
      if (!await moduloLiberado(tx, 'integracao')) {
        return recusar('nao-liberado', 'O módulo Integração não está liberado para este parceiro.');
      }
      const lojas = await tx.loja.findMany({
        where: { parceiroId: tx.parceiroId, id: filtroDeLojas(alcance) },
        select: { id: true, nome: true },
        orderBy: [{ ativa: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
      });
      const loja = lojaId === undefined ? lojas[0] ?? null : lojas.find(l => l.id === lojaId) ?? null;
      if (lojaId !== undefined && !loja) return lojaIndisponivel();
      if (!loja) return { ok: true, lojas, loja: null, competencia, ambiente, conexoes: [], fonteMensal: 'SEM_DADOS',
        recibos: { total: 0, pagina: 1, paginas: 0, itens: [] } };
      if (!podeVerConferenciaFinancial(alcance, loja.id)) return lojaIndisponivel();

      const vinculos = await tx.integracaoConexao.findMany({
        where: { parceiroId: tx.parceiroId, lojaId: loja.id, provedor: 'IFOOD' },
        select: { id: true, nomeExterno: true, estado: true, ambiente: true, ...(alcance.nivel === 'FLOWFOODS' && { idExterno: true }),
          modulos: { where: { modulo: 'FINANCIAL' }, select: { estado: true } } },
        orderBy: [{ estado: 'asc' }, { nomeExterno: 'asc' }, { id: 'asc' }],
      });
      if (vinculos.some(v => v.estado === 'ATIVA' && v.ambiente !== ambiente)) {
        return recusar('contexto-invalido', 'O ambiente dos vínculos desta loja precisa ser conferido pela FlowFoods.');
      }
      // A troca de ambiente mantém no banco as conexões já desligadas do ambiente anterior.
      const conexoes = vinculos.filter(v => v.ambiente === ambiente).map(v => ({
        id: v.id, nome: v.nomeExterno, estado: v.estado, estadoFinancial: v.modulos[0]?.estado ?? null,
        ...(alcance.nivel === 'FLOWFOODS' && v.estado === 'ATIVA' && (v.modulos[0]?.estado === 'AUTORIZADO' || v.modulos[0]?.estado === 'ATIVO')
          && { merchantDoModelo: v.idExterno }),
      }));
      const recibos = await listarRecibosFontesFinancial(tx, alcance, { lojaId: loja.id, ambiente, competencia }, Number(pagina));
      return { ok: true, lojas, loja, competencia, ambiente, conexoes, recibos,
        fonteMensal: recibos.total ? 'RECEBIDA_PARA_CONFERENCIA' : 'SEM_DADOS' };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof ErroDeRelatorio) return leituraIndisponivel();
    throw erro;
  }
}
