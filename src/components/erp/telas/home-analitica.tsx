/** H2 de uma loja: composição autorizada, sem contas de domínio ou consultas. */
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { AnaliticoDaHome, WidgetAnaliticoHome, WidgetComprasHome, WidgetEstoqueHome, WidgetFaturamentoHome, WidgetProducaoHome } from '@/lib/erp/home-analitico';
import type { EstadoDoWidgetHome, FamiliaDaHome } from '@/lib/erp/home-contratos';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { percentualComDuasCasas } from '@/lib/erp/cmv-categorias-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR, type ChaveIcone } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarPontosBase } from '@/lib/erp/unidades';
import { IconeDoModulo } from '../ui/cabecalho';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Painel, Selo, type Tom } from '../ui/superficies';
import { CmvDaHomeNaTela } from './cmv-da-home';
import { EvolucaoFaturamentoHome } from './evolucao-faturamento-home';
import { ComprasCategoriasHome } from './compras-categorias-home';
import { ValorMonetarioHome } from './valor-monetario-home';
import { AtualizacaoDoResumo, PendenciasDoResumo } from './painel-do-dia';

const FAMILIAS: FamiliaDaHome[] = ['faturamento', 'cmv', 'compras', 'despesas', 'estoque', 'producao'];
const IDENTIDADE: Record<FamiliaDaHome, { nome: string; icone: ChaveIcone; cor: string }> = {
  faturamento: { nome: 'Faturamento', icone: 'dre', cor: COR.dre },
  cmv: { nome: 'CMV', icone: 'dre', cor: COR.dre },
  compras: { nome: 'Compras', icone: 'compras', cor: COR.compras },
  despesas: { nome: 'Despesas', icone: 'compras', cor: COR.dre },
  estoque: { nome: 'Estoque', icone: 'estoque', cor: COR.estoque },
  producao: { nome: 'Produção', icone: 'producao', cor: COR.producao },
};
const ESTADO: Record<EstadoDoWidgetHome, { texto: string; tom: Tom }> = {
  ok: { texto: 'Disponível', tom: 'neutro' }, parcial: { texto: 'Parcial', tom: 'alerta' },
  sem_dados: { texto: 'Sem dados', tom: 'neutro' }, sem_base: { texto: 'Sem base', tom: 'alerta' },
  indisponivel: { texto: 'Indisponível', tom: 'neutro' }, erro: { texto: 'Erro na leitura', tom: 'alerta' },
};
const inteiro = (n: number) => n.toLocaleString('pt-BR');

function ValorDoIndicador({ widget }: { widget: WidgetAnaliticoHome }) {
  if (widget.familia === 'estoque' && !widget.verValores && widget.valor.unidade === 'centavos') return <span className="text-[16px]">Valor não disponível</span>;
  const valor = widget.valor.valor;
  if (valor === null) return <><span aria-hidden>—</span><span className="sr-only">Valor não disponível</span></>;
  if (widget.familia === 'cmv' && widget.percentual?.pontosBase != null) {
    const bp = widget.percentual.pontosBase;
    return <>{bp < 0 ? '−' : ''}{percentualComDuasCasas(bp)}</>;
  }
  return widget.valor.unidade === 'centavos' ? <ValorMonetarioHome centavos={valor} />
    : widget.valor.unidade === 'pontos_base' ? formatarPontosBase(valor) : inteiro(valor);
}

function AvisosDoIndicador({ widget }: { widget: WidgetAnaliticoHome }) {
  if (!widget.avisos.length) return null;
  return <ul className="space-y-1 break-words text-[12px] leading-relaxed text-suave">{widget.avisos.map((aviso, i) => <li key={`${aviso.codigo}-${i}`}>{aviso.texto}</li>)}</ul>;
}

function IndicadorAnalitico({ widget }: { widget: WidgetAnaliticoHome }) {
  const identidade = IDENTIDADE[widget.familia];
  const estado = ESTADO[widget.estado];
  const referencia = widget.referencia;
  const intervalo = referencia?.inicio && referencia.fim ? `${formatarData(referencia.inicio, true)} a ${formatarData(referencia.fim)}` : null;
  const quando = referencia?.base === 'posicao_atual' ? 'Posição atual'
    : referencia?.base === 'dia_operacional' ? `Hoje${referencia.inicio ? ` · ${formatarData(referencia.inicio)}` : ''}`
      : referencia?.base === 'periodo_apuracao' ? (referencia.apuradoAte ? `DRE até ${formatarData(referencia.apuradoAte)}` : 'DRE · nenhum dia apurado')
        : intervalo ? `${intervalo}${widget.familia === 'compras' ? ' · entrada da nota' : ' · mês civil'}` : 'Referência não disponível';
  return (
    <div role="group" aria-label={`Indicador de ${identidade.nome}`} className="min-w-0">
      <Link href={widget.detalhe.href} style={{ '--cor-modulo': identidade.cor } as CSSProperties} className="ff-identidade-modulo ff-cartao-modulo ff-transicao flex h-full min-w-0 flex-col gap-2 rounded-[14px] border p-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconeDoModulo icone={identidade.icone} cor={identidade.cor} tamanho={32} />
          <h2 className="min-w-0 break-words text-[13px] font-semibold text-texto">{identidade.nome}</h2>
        </div>
        <div className="space-y-1">
          <p className="break-words font-display text-[23px] font-bold leading-tight tabular-nums text-texto"><ValorDoIndicador widget={widget} /></p>
          {widget.familia === 'cmv' && widget.percentual?.pontosBase != null && widget.valor.valor !== null && <p className="text-[12px] font-medium tabular-nums text-suave">{formatarDinheiro(widget.valor.valor)} de custo no DRE</p>}
          {widget.familia === 'estoque' && <p className="text-[12px] text-suave">{widget.rotuloDoValor}</p>}
          {widget.familia === 'producao' && <p className="text-[12px] text-suave">Pré-preparos na lista de hoje</p>}
          {widget.familia === 'compras' && <p className="text-[12px] text-suave">Total entregue · itens e frete</p>}
        </div>
        <p className="break-words text-[12px] leading-relaxed text-suave">{quando}</p>
        <div><Selo tom={estado.tom}>{estado.texto}</Selo></div>
        {!['cmv', 'estoque', 'producao'].includes(widget.familia) && <AvisosDoIndicador widget={widget} />}
        <span className="mt-auto pt-1 text-[12px] font-medium text-texto underline decoration-linha-forte underline-offset-4">{widget.detalhe.rotulo}</span>
      </Link>
    </div>
  );
}

function EstoqueNaOperacao({ widget }: { widget: WidgetEstoqueHome }) {
  const situacao = widget.situacao === 'ABERTO' ? 'Estoque aberto' : widget.situacao === 'EM_CONTAGEM' ? 'Contagem de abertura em andamento' : widget.situacao === 'NAO_ABERTO' ? 'Estoque ainda não aberto' : 'Situação não disponível';
  return (
    <Painel titulo="Estoque agora" subtitulo="Posição atual desta loja">
      <div className="space-y-2 break-words text-[13px] leading-relaxed text-suave">
        <p className="font-semibold text-texto">{situacao}</p>
        {widget.itensComSaldo !== null && <p>{inteiro(widget.itensComSaldo)} itens com saldo.</p>}
        {widget.contagem && <p>{inteiro(widget.contagem.contados)} de {inteiro(widget.contagem.total)} itens contados.</p>}
        {widget.situacao === 'ABERTO' && widget.verValores && widget.itensSemCusto !== undefined && <p>{inteiro(widget.itensSemCusto)} itens sem custo informado.</p>}
        <AvisosDoIndicador widget={widget} />
        <Link href={widget.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>{widget.detalhe.rotulo}</Link>
      </div>
    </Painel>
  );
}

function ProducaoNaOperacao({ widget }: { widget: WidgetProducaoHome }) {
  return (
    <Painel titulo="Produção hoje" subtitulo="Lista do dia desta loja">
      <div className="space-y-2 break-words text-[13px] leading-relaxed text-suave">
        {widget.naLista !== null && <p><strong className="font-semibold text-texto">{inteiro(widget.naLista)}</strong> pré-preparos na lista.</p>}
        {widget.semLote !== null && <p>{inteiro(widget.semLote)} ainda sem lote ativo.</p>}
        <p className="text-[12px]">A lista inclui os que já viraram lote. Essa contagem informa o que foi listado para hoje.</p>
        <AvisosDoIndicador widget={widget} />
        <Link href={widget.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>{widget.detalhe.rotulo}</Link>
      </div>
    </Painel>
  );
}

function CardapioDaRede({ painel }: { painel: PainelDoDia }) {
  const indicador = painel.indicadores.find((i) => i.chave === 'cardapio');
  const estado = painel.estados?.find((e) => e.chave === 'cardapio');
  if (!indicador && !estado) return null;
  const href = indicador?.href ?? estado!.href;
  return (
    <section aria-label="Cardápio da rede" className="min-w-0">
      <Painel titulo="Cardápio" subtitulo="Da rede · situação do cadastro">
        <div className="space-y-2 break-words text-[13px] leading-relaxed text-suave">
          {indicador?.valor.tipo === 'fracao' && <p><strong className="font-semibold tabular-nums text-texto">{indicador.valor.de} de {indicador.valor.total}</strong> pratos prontos para o preço.</p>}
          {estado && estado.estado !== 'ok' && <Selo tom={ESTADO[estado.estado].tom}>{ESTADO[estado.estado].texto}</Selo>}
          {estado?.mensagem && <p>{estado.mensagem}</p>}
          {indicador?.contexto && <p>{indicador.contexto}</p>}
          <Link href={href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>Ver as fichas técnicas</Link>
        </div>
      </Painel>
    </section>
  );
}

export function HomeAnalitica({ analitico, painel }: { analitico: Extract<AnaliticoDaHome, { tipo: 'loja' }>; painel: PainelDoDia }) {
  const widgets = [...analitico.widgets].sort((a, b) => FAMILIAS.indexOf(a.familia) - FAMILIAS.indexOf(b.familia));
  const estoque = widgets.find((w): w is WidgetEstoqueHome => w.familia === 'estoque');
  const producao = widgets.find((w): w is WidgetProducaoHome => w.familia === 'producao');
  const compras = widgets.find((w): w is WidgetComprasHome => w.familia === 'compras');
  const faturamento = widgets.find((w): w is WidgetFaturamentoHome => w.familia === 'faturamento');
  const temCardapio = painel.indicadores.some((i) => i.chave === 'cardapio') || painel.estados?.some((e) => e.chave === 'cardapio');
  const temOperacao = Boolean(estoque || producao || temCardapio);
  return (
    <section aria-label="Resumo da operação" className="space-y-5">
      <p className="text-[13px] leading-relaxed text-suave">{analitico.loja.nome} · cada indicador informa seu período e sua base.</p>
      {widgets.length ? (
        <section aria-label="Indicadores da loja" className="grid gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {widgets.map((widget) => <IndicadorAnalitico key={widget.familia} widget={widget} />)}
        </section>
      ) : <p className="rounded-[14px] border border-linha bg-painel p-5 text-sm text-suave">Não há indicadores disponíveis no seu acesso a esta loja. As áreas permitidas continuam na navegação.</p>}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-3">
        {analitico.faturamentoDiario && <div className={'min-w-0 ' + (painel.cmv ? 'xl:col-span-2' : 'xl:col-span-3')}><EvolucaoFaturamentoHome leitura={analitico.faturamentoDiario} loja={analitico.loja.nome} widgetFaturamento={faturamento} /></div>}
        {painel.cmv && <div className={'min-w-0 ' + (analitico.faturamentoDiario ? 'xl:row-span-2' : 'xl:col-span-3')}><CmvDaHomeNaTela cmv={painel.cmv} compacto={Boolean(analitico.faturamentoDiario)} /></div>}
        {temOperacao && (
          <section aria-label="Operação de hoje" className={'min-w-0 space-y-3 ' + (painel.cmv && analitico.faturamentoDiario ? 'xl:col-span-2' : 'xl:col-span-3')}>
            <h2 className="text-[15px] font-semibold text-texto">Na operação</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {estoque && <EstoqueNaOperacao widget={estoque} />}
              {producao && <ProducaoNaOperacao widget={producao} />}
              {temCardapio && <CardapioDaRede painel={painel} />}
            </div>
          </section>
        )}
      </div>
      {compras?.composicaoPorCategoria && <ComprasCategoriasHome widget={compras} />}
      {painel.pendencias.length > 0 && <section aria-label="Pontos de atenção"><PendenciasDoResumo pendencias={painel.pendencias} /></section>}
      {(widgets.length > 0 || temCardapio || painel.pendencias.length > 0) && <AtualizacaoDoResumo consultadoEm={painel.consultadoEm} />}
    </section>
  );
}
