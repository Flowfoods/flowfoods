import { recorteDaConsultoria } from '@/lib/erp/liberacao';
import { pode, type Alcance } from '@/lib/erp/permissoes';
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { ontemDoPainelAnalytics, type IndicadoresAnalytics } from '../ifood/painel-campos';
import { lerPainelAnalytics } from './painel-analytics';
import { lerSituacaoAnalyticsDaLoja } from './situacao-analytics';
import type { ContextoServidorAnalytics, FonteDaSituacaoAnalytics } from './situacao-analytics-campos';

type FonteDaConsultoria = Pick<FonteDaSituacaoAnalytics, 'chave' | 'nome' | 'marca'>;
type LojaDaConsultoria = { id: string; nome: string };

export interface VisaoGeralConsultoria {
  estado: 'disponivel' | 'demonstracao' | 'parcial' | 'sem-dados' | 'atraso' | 'falha' | 'pausado';
  mensagem: string;
  publicadaEm: string | null;
  revisaoPendente: boolean;
  ultimaLeituraAnterior: FonteDaSituacaoAnalytics['ultimaLeituraAnterior'];
  cobertura: { fontesCobertas: number; fontesEsperadas: number } | null;
  indicadores: IndicadoresAnalytics | null;
}

export type ResultadoConsultoriaDelivery =
  | { ok: false; motivo: 'bloqueada' | 'consulta'; mensagem: string }
  | {
      ok: true;
      dia: string;
      ambiente: 'TEST' | 'PRODUCAO';
      loja: LojaDaConsultoria;
      fonte: FonteDaConsultoria;
      visaoGeral: VisaoGeralConsultoria;
    };

const consultaRecusada = (mensagem: string): ResultadoConsultoriaDelivery => ({ ok: false, motivo: 'consulta', mensagem });
const resumirFonte = ({ chave, nome, marca }: FonteDaSituacaoAnalytics): FonteDaConsultoria => ({ chave, nome, marca });

export async function lerConsultoriaDelivery(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  contexto: ContextoServidorAnalytics,
  filtros: { lojaId?: unknown; fonteId?: unknown },
): Promise<ResultadoConsultoriaDelivery> {
  if (cliente.parceiroId !== contexto.parceiroId || typeof contexto.homologacaoDeIntegracao !== 'boolean' ||
      !pode(alcance, 'consultoria.ver')) return consultaRecusada('Esta consulta não está incluída no seu acesso.');
  const dia = ontemDoPainelAnalytics();
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoConsultoriaDelivery> => {
      const recorte = await recorteDaConsultoria(tx);
      if (!recorte?.liberado || !recorte.consultoriaLojaId || !recorte.consultoriaConexaoId) {
        return { ok: false, motivo: 'bloqueada', mensagem: 'A prévia da Consultoria está bloqueada neste parceiro.' };
      }
      const { consultoriaLojaId: lojaId, consultoriaConexaoId: fonteId } = recorte;
      if ((filtros.lojaId !== undefined && filtros.lojaId !== lojaId) ||
          (filtros.fonteId !== undefined && filtros.fonteId !== fonteId) ||
          !pode(alcance, 'consultoria.ver', { lojaId })) {
        return consultaRecusada('Esta loja ou marca não está incluída no recorte liberado para o seu acesso.');
      }
      if (!pode(alcance, 'integracao.ver', { lojaId }) || !pode(alcance, 'faturamento.ver', { lojaId })) {
        return consultaRecusada('A Visão geral usa as permissões de leitura de Integração e Faturamento.');
      }
      const leitura = await lerSituacaoAnalyticsDaLoja(tx, alcance, contexto, { lojaId, dia });
      if (!leitura.ok) return consultaRecusada(leitura.mensagem);
      const { situacao, ambiente } = leitura;
      const fonte = situacao?.fontes.find(f => f.chave === fonteId);
      if (!situacao || situacao.loja.id !== lojaId || !fonte) {
        return consultaRecusada('A origem liberada está indisponível. Confira o vínculo desta loja.');
      }
      const { loja } = situacao;
      const base = {
        ok: true, dia, ambiente, loja: { id: loja.id, nome: loja.nome }, fonte: resumirFonte(fonte),
      } as const;

      const estadoSemValores: VisaoGeralConsultoria = {
        estado: 'pausado', mensagem: fonte.acesso.explicacao, publicadaEm: fonte.versaoDisponivel?.publicadaEm ?? null,
        revisaoPendente: fonte.revisaoPendente,
        ultimaLeituraAnterior: fonte.ultimaLeituraAnterior, cobertura: null, indicadores: null,
      };
      if (!loja.ativa) return { ...base, visaoGeral: { ...estadoSemValores, mensagem: 'A loja deste recorte está inativa.' } };
      if (!fonte.vinculada) return { ...base, visaoGeral: estadoSemValores };

      // A situação usa o ID da conexão e o painel usa o ID do merchant. Resolva a mesma fonte no escopo autorizado.
      const conexao = await tx.integracaoConexao.findFirst({
        where: { id: fonte.chave, lojaId: loja.id, provedor: 'IFOOD', ambiente },
        select: { idExterno: true, modulos: { where: { modulo: 'ANALYTICS' }, select: { estado: true } } },
      });
      if (!conexao || conexao.modulos.length > 1) {
        return { ...base, visaoGeral: { ...estadoSemValores, estado: 'parcial', mensagem: 'A identificação desta fonte precisa ser conferida.' } };
      }
      const estadoDoModulo = conexao.modulos[0]?.estado;
      if (estadoDoModulo !== 'ATIVO') {
        const estado = estadoDoModulo === 'PAUSADO' || estadoDoModulo === 'ERRO_PERMISSAO' ? 'pausado' : 'sem-dados';
        return { ...base, visaoGeral: { ...estadoSemValores, estado } };
      }
      const resultado = await lerPainelAnalytics(tx, alcance, contexto, {
        lojaId: loja.id, inicio: dia, fim: dia, merchants: conexao.idExterno,
      });
      if (!resultado.ok || !resultado.painel) {
        return { ...base, visaoGeral: {
          ...estadoSemValores, estado: 'falha',
          mensagem: resultado.ok ? 'Não foi possível conferir a cobertura desta fonte.' : resultado.mensagem,
        } };
      }
      const { cobertura, resumo } = resultado.painel;
      const fonteDoDia = cobertura.dias[0]?.fontes[0];
      const baseDaLeitura = {
        ...estadoSemValores,
        publicadaEm: fonteDoDia?.publicadaEm ?? null,
        revisaoPendente: fonte.revisaoPendente || fonteDoDia?.revisaoPendente === true,
        cobertura: { fontesCobertas: cobertura.paresCobertos, fontesEsperadas: cobertura.paresEsperados },
        indicadores: cobertura.completa ? resumo.indicadores : null,
      };

      let visaoGeral: VisaoGeralConsultoria;
      if (fonte.tentativa?.estado === 'FALHA') {
        visaoGeral = { ...baseDaLeitura, estado: 'falha', mensagem: fonte.tentativa.mensagem.explicacao };
      } else if (baseDaLeitura.revisaoPendente) {
        visaoGeral = { ...baseDaLeitura, estado: 'parcial', mensagem: 'A revisão deste dia está pendente.' };
      } else if (cobertura.completa) {
        visaoGeral = {
          ...baseDaLeitura,
          estado: ambiente === 'TEST' ? 'demonstracao' : 'disponivel',
          mensagem: fonteDoDia?.estado === 'vazio-oficial'
            ? 'A fonte confirmou que não houve movimento no dia.'
            : 'Leitura disponível para a marca e o dia consultados.',
        };
      } else if (fonteDoDia?.estado !== 'ausente') {
        visaoGeral = { ...baseDaLeitura, estado: 'parcial', mensagem: 'A fonte ainda não tem cobertura confirmada para o dia.' };
      } else if (fonte.tentativa?.estado === 'AGUARDANDO' || fonte.ultimaLeituraAnterior) {
        visaoGeral = { ...baseDaLeitura, estado: 'atraso', mensagem: 'A leitura deste dia continua pendente.' };
      } else {
        visaoGeral = { ...baseDaLeitura, estado: 'sem-dados', mensagem: 'Nenhuma leitura foi publicada para a marca nesse dia.' };
      }
      return { ...base, visaoGeral };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof ErroDeRelatorio) return consultaRecusada('A consulta está indisponível no momento. Tente novamente mais tarde.');
    throw erro;
  }
}
