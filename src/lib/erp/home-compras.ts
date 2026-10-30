/** Compras H2: recorte autorizado + totais canônicos; sem fachada, linhas ou nova conta. */
import type { Alcance } from './permissoes';
import { pode } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { resolverRecorte, totaisDoRecorte, distribuicaoDoRecorte, type TotaisDoRecorte } from './compras-relatorio';
import { lerFiltrosDoRelatorio, queryDoRelatorio, somarDias, type FiltrosDoRelatorio } from './compras-relatorio-campos';
import { lerData } from './compra-campos';
import { ErroDeRelatorio } from './vagas-de-relatorio';
import { baseDoWidgetHome, contextoHomePermitido, type ContextoHomeLoja, type LeituraHome, type WidgetComprasHome } from './home-analitico';
import { projetarCategoriasDasCompras, type LeituraDaComposicaoCompras } from './home-compras-categorias';

export type DadosComprasHome = { tipo: 'totais'; filtros: FiltrosDoRelatorio; totais: TotaisDoRecorte; composicaoPorCategoria?: LeituraDaComposicaoCompras }
  | { tipo: 'sem-loja' } | { tipo: 'incompativel' } | { tipo: 'limite'; motivo: 'tempo' | 'ocupado' };

export function filtrosDeComprasHome(lojaId: string, hoje: string): FiltrosDoRelatorio {
  return lerFiltrosDoRelatorio({ loja: lojaId, base: 'entrada', situacao: 'lancadas' }, hoje);
}

export async function lerComprasDaHome(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, hoje: string): Promise<DadosComprasHome | null> {
  // Nem a transação começa sem permissão. A visão recebida só estreita o alcance.
  if (!/^[a-z0-9]{1,64}$/i.test(lojaId) || lerData(hoje) !== hoje || !pode(alcance, 'compras.ver', { lojaId })) return null;
  const filtros = filtrosDeComprasHome(lojaId, hoje);
  const restrito: Alcance = { ...alcance, lojas: [lojaId] };
  // Somente uma leitura de totais concluída, após os gates, pode sobreviver a
  // erro da composição/encerramento. A variável é local desta requisição.
  let baseLida: Extract<DadosComprasHome, { tipo: 'totais' }> | undefined;
  try {
    return await cliente.transacao<DadosComprasHome>(async (tx) => {
      const { recorte, motivo } = await resolverRecorte(tx, restrito, filtros);
      if (!recorte) return { tipo: motivo === 'sem-loja' ? 'sem-loja' : 'incompativel' };
      if (motivo !== null || recorte.parceiroId !== tx.parceiroId || recorte.lojas.length !== 1 || recorte.lojas[0] !== lojaId
        || recorte.base !== 'entrada' || recorte.status !== 'LANCADA' || recorte.de !== hoje.slice(0, 7) + '-01' || recorte.ate !== hoje
        || recorte.fim !== somarDias(hoje, 1) || recorte.agrupar !== 'insumo'
        || recorte.fornecedorId !== null || recorte.insumoIds !== null || recorte.categoriaId !== null
        || recorte.grupo !== null || recorte.unidade !== null || recorte.soSemBase) return { tipo: 'incompativel' };
      const totais = await totaisDoRecorte(tx, recorte);
      baseLida = { tipo: 'totais', filtros, totais };
      const composicaoPorCategoria: LeituraDaComposicaoCompras = totais.notas === 0
        ? { estado: 'sem_dados' }
        : { estado: 'lido', distribuicao: await distribuicaoDoRecorte(tx, recorte, 'categoria', 6) };
      return { ...baseLida, composicaoPorCategoria };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    // Um erro SQL pode abortar a transação: o fallback fica fora, depois de o
    // portão encerrá-la. Não usa SAVEPOINT, retry ou outra leitura de totais.
    if (baseLida) return { ...baseLida, composicaoPorCategoria: erro instanceof ErroDeRelatorio
      ? { estado: 'limite', motivo: erro.motivo } : { estado: 'erro' } };
    if (erro instanceof ErroDeRelatorio) return { tipo: 'limite', motivo: erro.motivo };
    throw erro;
  }
}

export function comprasAnaliticas(leitura: LeituraHome<DadosComprasHome>, c: ContextoHomeLoja): WidgetComprasHome | null {
  if (!contextoHomePermitido(c, 'compras.ver')) return null;
  const filtros = filtrosDeComprasHome(c.loja.id, c.hoje);
  const widget: WidgetComprasHome = {
    ...baseDoWidgetHome('compras', 'Compras', c, 'centavos', { href: c.raiz + '/compras/relatorios/periodo?' + queryDoRelatorio(filtros), rotulo: 'Ver as compras do mesmo recorte' }),
    baseDeData: 'entrada', notas: null, itensCentavos: null, freteCentavos: null, semBase: null, notasComDesconto: null,
  };
  widget.referencia = { base: 'mes_civil', rotulo: 'Entrada da nota · ' + filtros.de + ' a ' + filtros.ate, inicio: filtros.de, fim: filtros.ate, apuradoAte: filtros.ate };
  const terminar = (estado: WidgetComprasHome['estado'], codigo: string, texto: string) => { widget.estado = estado; widget.avisos = [{ codigo, texto }]; return widget; };
  if (leitura.estado === 'erro') return terminar('erro', 'compras-erro', 'Não foi possível carregar as compras deste recorte.');
  if (leitura.estado !== 'lido' || !leitura.dados) return terminar('indisponivel', 'compras-indisponivel', 'As compras não estão disponíveis neste resumo.');
  const d = leitura.dados;
  if (d.tipo === 'sem-loja') return terminar('sem_dados', 'compras-sem-loja', 'Nenhuma loja elegível para compras neste contexto.');
  if (d.tipo === 'incompativel') return terminar('indisponivel', 'compras-contexto', 'O recorte das compras não corresponde à loja deste resumo.');
  if (d.tipo === 'limite') return terminar('indisponivel', 'compras-limite', d.motivo === 'ocupado' ? 'Há outra consulta grande em andamento. Atualize o resumo em instantes.' : 'A consulta de compras atingiu o limite de tempo. Abra o relatório para conferir o recorte.');
  if (d.filtros.lojaIds.length !== 1 || d.filtros.lojaIds[0] !== c.loja.id || d.filtros.de !== filtros.de || d.filtros.ate !== filtros.ate || d.filtros.base !== 'entrada' || d.filtros.situacao !== 'lancadas') return terminar('indisponivel', 'compras-contexto', 'O recorte das compras não corresponde à loja deste resumo.');
  const t = d.totais;
  widget.notas = t.notas;
  widget.estado = t.notas ? 'ok' : 'sem_dados';
  widget.valor.valor = t.notas ? t.totalCentavos : null;
  widget.itensCentavos = t.notas ? t.valorCentavos : null; widget.freteCentavos = t.notas ? t.freteCentavos : null;
  widget.semBase = Object.fromEntries((['insumo', 'unidade', 'conversao', 'valor'] as const).filter((k) => t.semBase[k] !== undefined).map((k) => [k, t.semBase[k]]));
  widget.notasComDesconto = t.notasComDesconto;
  widget.origem = { fonte: 'compras', modo: 'vivo', fotografia: null };
  if (!t.notas) widget.avisos = [{ codigo: 'compras-sem-notas', texto: 'Nenhuma compra lançada neste recorte, pela entrada da nota.' }];
  else if (Object.values(widget.semBase).some((n) => (n ?? 0) > 0)) widget.avisos = [{ codigo: 'compras-preco-medio', texto: 'Há itens fora da base do preço médio. O valor entregue segue o total do relatório.' }];
  if (t.notasComDesconto > 0) widget.avisos = [...widget.avisos, { codigo: 'compras-desconto', texto: 'Há notas com desconto. Confira a composição no relatório.' }];
  // A projeção da composição também tem fronteira própria: getters/campos
  // incompatíveis não apagam o KPI canônico que já foi preenchido acima.
  if (Object.hasOwn(d, 'composicaoPorCategoria')) {
    const detalhe = { href: widget.detalhe.href, rotulo: 'Ver a composição no relatório de compras' };
    try {
      widget.composicaoPorCategoria = projetarCategoriasDasCompras(d.composicaoPorCategoria, { totalCentavos: t.totalCentavos, notas: t.notas }, detalhe);
    } catch {
      widget.composicaoPorCategoria = projetarCategoriasDasCompras({ estado: 'erro' }, { totalCentavos: t.totalCentavos, notas: t.notas }, detalhe);
    }
  }
  return widget;
}
