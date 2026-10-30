/** Distribuição canônica de Compras; classificação atual, sem cálculo financeiro. */
import Link from 'next/link';
import type { WidgetComprasHome } from '@/lib/erp/home-analitico';
import type { ComposicaoComprasHome } from '@/lib/erp/home-compras-categorias';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { BarrasHorizontais, type BarraDoGrafico } from '../ui/barras-horizontais';
import { IconeDoModulo } from '../ui/cabecalho';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Painel, Selo } from '../ui/superficies';

// Guarda estrutural da apresentação: uma composição incompatível não derruba
// os demais widgets. A reconciliação financeira pertence ao adaptador canônico.
function valoresLegiveis(c: ComposicaoComprasHome): boolean {
  return c.classificacao === 'categoria_atual_do_insumo'
    && Number.isSafeInteger(c.totalCentavos)
    && Array.isArray(c.fatias) && c.fatias.every((f) => f && typeof f.chave === 'string' && typeof f.rotulo === 'string' && Number.isSafeInteger(f.centavos))
    && (c.outros === null || (c.outros && Number.isSafeInteger(c.outros.centavos) && Number.isSafeInteger(c.outros.quantos)));
}

export function ComprasCategoriasHome({ widget }: { widget: WidgetComprasHome }) {
  const c = widget.composicaoPorCategoria;
  if (!c) return null;
  const detalhe = c.detalhe && typeof c.detalhe.href === 'string' && typeof c.detalhe.rotulo === 'string' ? c.detalhe : widget.detalhe;
  const referencia = widget.referencia;
  const intervalo = referencia?.inicio && referencia.fim ? `${formatarData(referencia.inicio, true)} a ${formatarData(referencia.fim)}` : 'Período não disponível';
  const disponivel = c.estado === 'ok' && (widget.estado === 'ok' || widget.estado === 'parcial') && valoresLegiveis(c);
  const estado = disponivel ? 'ok' : c.estado === 'sem_dados' ? 'sem_dados' : c.estado === 'erro' ? 'erro' : 'indisponivel';
  const linhas: BarraDoGrafico[] = disponivel ? [
    ...c.fatias.map((f) => ({ chave: `categoria:${f.chave}`, rotulo: f.rotulo, valor: f.centavos, valorTexto: formatarDinheiro(f.centavos), neutra: f.chave === '-' })),
    ...(c.outros ? [{ chave: 'outros', rotulo: 'Outros', valor: c.outros.centavos, valorTexto: formatarDinheiro(c.outros.centavos), detalhe: `${c.outros.quantos.toLocaleString('pt-BR')} categorias reunidas`, neutra: true }] : []),
  ] : [];
  const temNegativos = linhas.some((l) => l.valor < 0);
  const mensagem = estado === 'sem_dados' ? 'Nenhuma compra lançada neste recorte.'
    : estado === 'erro' ? 'Não foi possível carregar a composição das compras.' : 'A composição das compras está indisponível neste recorte.';
  return (
    <section aria-label="Compras por categoria atual" className="min-w-0">
      <Painel titulo="Compras por categoria atual" subtitulo={widget.escopo.nome} acessorio={<IconeDoModulo icone="compras" cor={COR.compras} tamanho={32} />}>
        <div className="min-w-0 space-y-4">
          <div className="space-y-1 break-words text-[13px] leading-relaxed text-suave">
            <p>{intervalo} · entrada da nota · somente lançadas.</p>
            <p><strong className="font-semibold text-texto">Categoria atual do insumo.</strong> Mudanças no cadastro podem redistribuir as compras deste recorte. Esta composição não é uma fotografia histórica nem o CMV.</p>
            <p>Total entregue: itens e frete, conforme o relatório de compras.</p>
          </div>
          {disponivel ? (
            <>
              <p className="break-words text-[13px] text-suave">Total do mesmo recorte: <strong className="font-display text-[24px] font-bold tabular-nums text-texto [overflow-wrap:anywhere]">{formatarDinheiro(c.totalCentavos!)}</strong></p>
              {widget.estado === 'parcial' && <Selo tom="alerta">Indicador de Compras parcial</Selo>}
              {typeof c.quantos === 'number' && <p className="text-[12px] text-suave">{c.quantos.toLocaleString('pt-BR')} {c.quantos === 1 ? 'categoria neste recorte' : 'categorias neste recorte'}.</p>}
              {temNegativos && <p className="text-[13px] leading-relaxed text-suave">Há valores negativos nesta composição. Confira os valores com seus sinais na tabela.</p>}
              {linhas.length ? (
                <div className={'grid min-w-0 items-start gap-5 ' + (!temNegativos ? 'lg:grid-cols-2' : '')}>
                  {!temNegativos && <BarrasHorizontais titulo="Compras por categoria atual, em reais" barras={linhas} />}
                  <table className="w-full table-fixed border-collapse text-[13px]">
                    <caption className="mb-2 text-left font-semibold text-texto">Valores por categoria atual</caption>
                    <thead><tr className="border-b border-linha text-suave"><th scope="col" className="w-3/5 px-2 py-2 text-left font-medium">Categoria</th><th scope="col" className="px-2 py-2 text-right font-medium">Valor entregue</th></tr></thead>
                    <tbody>{linhas.map((l) => <tr key={l.chave} className="border-b border-linha"><th scope="row" className="break-words px-2 py-3 text-left align-top font-medium text-texto [overflow-wrap:anywhere]">{l.rotulo}{l.detalhe && <span className="mt-1 block text-[12px] font-normal text-suave">{l.detalhe}</span>}</th><td className="px-2 py-3 text-right align-top font-semibold tabular-nums text-texto [overflow-wrap:anywhere]">{l.valorTexto}</td></tr>)}</tbody>
                    <tfoot><tr><th scope="row" className="px-2 py-3 text-left font-semibold text-texto">Total entregue</th><td className="px-2 py-3 text-right font-semibold tabular-nums text-texto [overflow-wrap:anywhere]">{formatarDinheiro(c.totalCentavos!)}</td></tr></tfoot>
                  </table>
                </div>
              ) : <p className="text-[13px] text-suave">Nenhum valor distribuído por categoria nesta leitura.</p>}
            </>
          ) : (
            <div className="space-y-2 rounded-[10px] border border-linha bg-texto/[0.02] px-4 py-5">
              <Selo tom={estado === 'erro' ? 'alerta' : 'neutro'}>{estado === 'sem_dados' ? 'Sem dados' : estado === 'erro' ? 'Erro na composição' : 'Indisponível'}</Selo>
              <p className="text-[14px] font-semibold text-texto">{mensagem}</p>
              {estado !== 'sem_dados' && <p className="text-[13px] leading-relaxed text-suave">Atualize o resumo ou abra o relatório para conferir o recorte. O indicador de Compras mantém sua leitura própria.</p>}
            </div>
          )}
          {typeof c.aviso === 'string' && c.aviso && <p className="break-words text-[13px] leading-relaxed text-suave">{c.aviso}</p>}
          <Link href={detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>{detalhe.rotulo}</Link>
        </div>
      </Painel>
    </section>
  );
}
