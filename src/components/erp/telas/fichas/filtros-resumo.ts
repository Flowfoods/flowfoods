import { CANAIS } from '@/lib/erp/canal-campos';
import { STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { valorDoFiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha, TIPOS_DE_FICHA, valorDoFiltroDoCmv, type FiltrosDeFicha } from '@/lib/erp/ficha-campos';
import type { PaginaDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { APRESENTACAO_DA_FAIXA } from './farol';

export const SITUACOES_DAS_FICHAS = { ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' } as const;
type ClassificacaoDoResumo = { secoesIniciais: PaginaDeClassificacao; subsecoesIniciais: PaginaDeClassificacao | null };
export type FiltroResumido = { chave: string; rotulo: string; removerHref: string };

/** A paginação não é uma edição de filtro. A normalização é a mesma da URL. */
export function assinaturaDaSelecao(filtros: FiltrosDeFicha): string {
  return queryDosFiltrosDeFicha(lerFiltrosDeFicha(new URLSearchParams(queryDosFiltrosDeFicha({ ...filtros, pagina: 1 }))));
}

/** Somente os valores aplicados geram links. Remover seção também remove o filho. */
export function resumirFiltrosAplicados(base: string, f: FiltrosDeFicha, classificacao?: ClassificacaoDoResumo): FiltroResumido[] {
  const resumo: FiltroResumido[] = [];
  const adicionar = (chave: string, rotulo: string, mudar: Partial<FiltrosDeFicha>) => {
    const query = queryDosFiltrosDeFicha({ ...f, ...mudar, pagina: 1 });
    resumo.push({ chave, rotulo, removerHref: query ? `${base}?${query}` : base });
  };
  const nome = (nivel: 'secao' | 'subsecao', id: string) => {
    const pagina = nivel === 'secao' ? classificacao?.secoesIniciais : classificacao?.subsecoesIniciais;
    const item = [...(pagina?.selecionados ?? []), ...(pagina?.itens ?? [])].find(r => r.nivel === nivel && r.registro.id === id);
    if (!item) return 'Indisponível';
    const arquivada = !item.registro.ativa || (item.nivel === 'subsecao' && !item.registro.secaoAtiva);
    return `${item.registro.nome}${arquivada ? ' (arquivada)' : ''}`;
  };
  if (f.q) adicionar('q', `Busca: “${f.q}”`, { q: '' });
  if (f.secao) adicionar('secao', f.secao === 'sem' ? 'Sem seção' : `Seção: ${nome('secao', f.secao)}`, { secao: null, subsecao: null });
  if (f.subsecao) adicionar('subsecao', f.subsecao === 'sem' ? 'Sem subseção' : `Subseção: ${nome('subsecao', f.subsecao)}`, { subsecao: null });
  if (f.tipo) adicionar('tipo', `Tipo: ${TIPOS_DE_FICHA[f.tipo]}`, { tipo: null });
  if (f.situacao !== 'ativas') adicionar('situacao', `Situação: ${SITUACOES_DAS_FICHAS[f.situacao]}`, { situacao: 'ativas' });
  if (f.incompleto) adicionar('custo', 'Só custo incompleto', { incompleto: false });
  for (const par of f.cmv) {
    const valor = valorDoFiltroDoCmv(par);
    adicionar(`cmv-${valor}`, `Meta: ${CANAIS[par.canal].curto} · ${STATUS_DO_CMV[par.status].rotulo}`, { cmv: f.cmv.filter(p => valorDoFiltroDoCmv(p) !== valor) });
  }
  for (const par of f.faixasCmv) {
    const valor = valorDoFiltroDaFaixaDoCmv(par);
    adicionar(`faixa-${valor}`, `Faixa: ${CANAIS[par.canal].curto} · ${APRESENTACAO_DA_FAIXA[par.faixa].rotulo}`, { faixasCmv: f.faixasCmv.filter(p => valorDoFiltroDaFaixaDoCmv(p) !== valor) });
  }
  return resumo;
}
