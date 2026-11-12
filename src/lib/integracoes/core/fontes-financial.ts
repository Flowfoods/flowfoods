import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { pode, type Alcance } from '@/lib/erp/permissoes';
import { ErroDeTenant, type ClienteDoParceiro } from '@/lib/erp/tenant';
import {
  ErroPacoteFontesFinancial, prepararPacoteFontesFinancial,
  type EscopoFontesFinancial, type ReciboPacoteFontesFinancial,
} from '../ifood/financial-v3-pacote-fontes';
import { diaDoPainelValido } from '../ifood/painel-campos';

type EntradaFontesFinancial = {
  lojaId: string;
  conexaoId: string;
  competencia: string;
  arquivoGzip: Uint8Array;
  manifestoJson: Uint8Array;
};

type ResultadoRecebimento =
  | { ok: true; reciboId: string; reenvio: boolean }
  | { ok: false; motivo: 'sem-permissao' | 'indisponivel' | 'pacote-invalido'; mensagem: string };

const indisponivel = (): ResultadoRecebimento => ({
  ok: false, motivo: 'indisponivel', mensagem: 'O recebimento está indisponível para esta loja e conexão.',
});

function idValido(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id;
}

/** A requisição escolhe o vínculo. Merchant, parceiro e ambiente vêm do servidor. */
export async function registrarFontesFinancial(ctx: ContextoDoParceiro, entrada: EntradaFontesFinancial): Promise<ResultadoRecebimento> {
  if (ctx.alcance.nivel !== 'FLOWFOODS' || !ctx.podeEscrever || ctx.bloqueio !== null || ctx.cliente.somenteLeitura
      || ctx.parceiro.status !== 'ATIVO' || ctx.parceiro.id !== ctx.cliente.parceiroId || !idValido(ctx.sessao.userId)) {
    return { ok: false, motivo: 'sem-permissao', mensagem: 'O recebimento exige acesso de escrita de nível 1 ao parceiro ativo.' };
  }
  const { lojaId, conexaoId, competencia } = entrada;
  if (!idValido(lojaId) || !idValido(conexaoId) || !diaDoPainelValido(competencia + '-01')
      || !pode(ctx.alcance, 'integracao.ver', { lojaId }) || !pode(ctx.alcance, 'faturamento.ver', { lojaId })) return indisponivel();
  const parceiroId = ctx.parceiro.id;
  const ambiente = ctx.parceiro.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  const modulo = await ctx.cliente.transacao(async tx => {
    if (!await moduloLiberado(tx, 'integracao')) return null;
    return tx.integracaoConexaoModulo.findFirst({
      where: { parceiroId, conexaoId, modulo: 'FINANCIAL', estado: { in: ['AUTORIZADO', 'ATIVO'] },
        conexao: { parceiroId, lojaId, ambiente, provedor: 'IFOOD', estado: 'ATIVA' } },
      select: { id: true, conexao: { select: { idExterno: true } } },
    });
  });
  if (!modulo) return indisponivel();

  const escopo: EscopoFontesFinancial = { parceiroId, lojaId, conexaoId, competencia, ambiente, merchantId: modulo.conexao.idExterno };
  try {
    // A descompressão não prolonga travas de acesso. O gatilho de INSERT relê
    // parceiro, ambiente, conexão, módulo e liberação com FOR SHARE até o commit.
    const recibo = await prepararPacoteFontesFinancial(escopo, entrada.arquivoGzip, entrada.manifestoJson);
    return await ctx.cliente.transacao(async tx => {
      const salvo = await tx.integracaoReciboFinancial.createMany({
        data: {
          ...escopo, versao: recibo.versao, produto: recibo.produto, moduloId: modulo.id, recebidoPorId: ctx.sessao.userId,
          requestIdSha256: recibo.requestIdSha256, arquivoSha256: recibo.arquivoSha256,
          manifestoSha256: recibo.manifestoSha256, eventosSha256: recibo.eventosSha256,
          vigenciasSha256: recibo.vigenciasSha256, pacoteSha256: recibo.pacoteSha256,
          linhasArquivo: recibo.linhasArquivo, pedidosDistintos: recibo.pedidosDistintos,
          paginasEventos: recibo.paginasEventos, quantidadeEventos: recibo.quantidadeEventos,
          vigencias: recibo.vigencias.map(v => ({ ...v })),
        },
        skipDuplicates: true,
      });
      const existente = await tx.integracaoReciboFinancial.findUniqueOrThrow({
        where: { parceiroId_conexaoId_competencia_pacoteSha256: { parceiroId, conexaoId, competencia, pacoteSha256: recibo.pacoteSha256 } },
        select: { id: true },
      });
      return { ok: true, reciboId: existente.id, reenvio: salvo.count === 0 };
    });
  } catch (erro) {
    if (erro instanceof ErroPacoteFontesFinancial) return { ok: false, motivo: 'pacote-invalido', mensagem: erro.message };
    if ((erro instanceof ErroDeTenant && erro.message.includes('parceiro não está ATIVO'))
        || (erro instanceof Error && erro.message.includes('erp_financial_fontes_indisponiveis'))) return indisponivel();
    throw erro;
  }
}

export type ResumoReciboFontesFinancial = Pick<ReciboPacoteFontesFinancial,
  'produto' | 'requestIdSha256' | 'arquivoSha256' | 'manifestoSha256' | 'eventosSha256' | 'vigenciasSha256' | 'pacoteSha256'
  | 'linhasArquivo' | 'pedidosDistintos' | 'paginasEventos' | 'quantidadeEventos' | 'vigencias'> & {
  id: string;
  conexaoId: string;
  ambiente: EscopoFontesFinancial['ambiente'];
  competencia: string;
  recebidoEm: Date;
  origem: 'MANUAL_DECLARADA';
  situacao: 'RECEBIDO_PARA_CONFERENCIA';
};

const resumo = {
  id: true, conexaoId: true, ambiente: true, competencia: true, produto: true, origem: true, situacao: true, recebidoEm: true,
  requestIdSha256: true, arquivoSha256: true, manifestoSha256: true, eventosSha256: true, vigenciasSha256: true, pacoteSha256: true,
  linhasArquivo: true, pedidosDistintos: true, paginasEventos: true, quantidadeEventos: true, vigencias: true,
} satisfies Prisma.IntegracaoReciboFinancialSelect;

const metadadosDoRecibo = z.object({
  origem: z.literal('MANUAL_DECLARADA'),
  situacao: z.literal('RECEBIDO_PARA_CONFERENCIA'),
  vigencias: z.array(z.strictObject({
    inicio: z.string(), fim: z.string(), comissaoBp: z.int().nonnegative(), pagamentoBp: z.int().nonnegative(),
  })),
});

/** Recebe o cliente da transação de leitura repetível da conferência. */
export async function listarRecibosFontesFinancial(
  tx: ClienteDoParceiro, alcance: Alcance,
  filtro: Pick<EscopoFontesFinancial, 'lojaId' | 'ambiente' | 'competencia'> & { reciboId?: string }, paginaPedida = 1,
): Promise<{ itens: ResumoReciboFontesFinancial[]; total: number; pagina: number; paginas: number }> {
  const { lojaId, ambiente, competencia } = filtro;
  if (!idValido(lojaId) || !diaDoPainelValido(competencia + '-01') || !['PRODUCAO', 'TEST'].includes(ambiente)
      || !pode(alcance, 'integracao.ver', { lojaId }) || !pode(alcance, 'faturamento.ver', { lojaId })
      || !await moduloLiberado(tx, 'integracao')) return { itens: [], total: 0, pagina: 1, paginas: 0 };
  const where = { parceiroId: tx.parceiroId, lojaId, ambiente, competencia };
  const total = await tx.integracaoReciboFinancial.count({ where });
  const porPagina = 12;
  const paginas = Math.ceil(total / porPagina);
  let pagina = Math.max(1, Math.min(Number.isSafeInteger(paginaPedida) ? paginaPedida : 1, paginas));
  if (!total) return { itens: [], total, pagina, paginas };
  if (paginas > 1 && idValido(filtro.reciboId)) {
    const alvo = await tx.integracaoReciboFinancial.findFirst({ where: { ...where, id: filtro.reciboId }, select: { id: true, recebidoEm: true } });
    if (alvo) {
      const maisRecentes = await tx.integracaoReciboFinancial.count({ where: { ...where, OR: [
        { recebidoEm: { gt: alvo.recebidoEm } }, { recebidoEm: alvo.recebidoEm, id: { gt: alvo.id } },
      ] } });
      pagina = Math.floor(maisRecentes / porPagina) + 1;
    }
  }
  const linhas = await tx.integracaoReciboFinancial.findMany({
    where, select: resumo, orderBy: [{ recebidoEm: 'desc' }, { id: 'desc' }], take: porPagina, skip: (pagina - 1) * porPagina,
  });
  const itens = linhas.map(linha => ({ ...linha, ...metadadosDoRecibo.parse(linha) }));
  return { itens, total, pagina, paginas };
}
