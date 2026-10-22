/**
 * Relatórios de compras (L.2) — as duas telas (histórico de um insumo e compras do período) e a versão para imprimir. A MESMA nas
 * duas árvores (`/erp` e `/rodolfo/erp/<slug>`): a página só resolve sessão, permissão e dados e passa tudo pronto.
 *
 * Ordem de leitura (primeira dobra com trabalho útil): título e o que está valendo, filtros, indicadores que abrem as linhas, as
 * notas para ler os números, o resumo e as linhas. Nada é lançado nem mudado aqui.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RelatorioDaTela } from '@/lib/erp/compras-relatorio';
import {
  BASES_DE_DATA,
  fraseDoPeriodo,
  recorteDeUmInsumo,
  ROTULO_DO_AGRUPAMENTO,
  TETO_DA_IMPRESSAO,
  type FiltrosDoRelatorio,
} from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { faixaDaPagina } from '@/lib/erp/paginacao';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { OPCOES_POR_PAGINA } from '@/lib/erp/insumo-campos';
import { BotaoImprimir } from './botao-imprimir';
import { ChipsDoRelatorio, FormularioDoRelatorio, hrefDoRelatorio, RECORTE_NOVO } from './relatorio-filtros';
import { BarraDeSaida, Indicadores, NotasDoRelatorio, TabelaDasCompras, TabelaDosGrupos } from './relatorio-partes';
import { TabelasDaImpressao } from './relatorio-impressao';

export type Modo = 'insumo' | 'periodo';

const TITULO: Record<Modo, string> = { insumo: 'Histórico de um insumo', periodo: 'Compras do período' };

function Aba({ href, ativa, children }: { href: string; ativa: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? 'page' : undefined}
      className="ff-transicao inline-flex min-h-11 items-center rounded-[7px] border border-linha-forte px-4 text-sm font-medium text-suave hover:border-texto/35 hover:text-texto aria-[current=page]:border-texto aria-[current=page]:bg-forte aria-[current=page]:font-semibold aria-[current=page]:text-texto"
    >
      {children}
    </Link>
  );
}

function VazioDoRelatorio({ r, f, caminho, modo }: { r: RelatorioDaTela; f: FiltrosDoRelatorio; caminho: string; modo: Modo }) {
  const limpar = (
    <Link href={caminho} className={classeDeBotao('secundario')}>
      Limpar e recomeçar
    </Link>
  );
  if (r.motivoVazio === 'periodo') {
    return (
      <Painel semRespiro>
        <Vazio titulo="O período não faz sentido." acao={limpar}>
          {f.periodoInvalido}
        </Vazio>
      </Painel>
    );
  }
  if (r.motivoVazio === 'sem-loja') {
    return (
      <Painel semRespiro>
        <Vazio titulo="Nenhuma dessas lojas está no seu acesso." acao={limpar}>
          O relatório só mostra as lojas que você pode ver. Escolha entre as que aparecem em “Lojas”, ou deixe sem marcar para ver todas as suas.
        </Vazio>
      </Painel>
    );
  }
  if (modo === 'insumo' && !f.insumoId) {
    const n = r.opcoes.listaDeInsumos.length;
    return (
      <Painel semRespiro>
        <Vazio titulo="Escolha um insumo para ver o histórico.">
          {f.q && n === 0
            ? `Nenhum insumo com compra tem “${f.q}” no nome ou na marca. Tente outro pedaço do nome.`
            : n === 0
              ? 'Ainda não há compra lançada nas suas lojas. Quando houver, os insumos comprados aparecem aqui.'
              : `Procure pelo nome (sem precisar de acento) ou escolha na lista: ${n >= 1000 ? 'há muitos' : n} ${n === 1 ? 'insumo comprado' : 'insumos comprados'} nas suas lojas.`}
        </Vazio>
      </Painel>
    );
  }
  return null;
}

export function TelaDoRelatorio({
  modo,
  caminho,
  comprasBase,
  contexto,
  f,
  r,
  hoje,
  insumosBase,
  visaoDaLoja,
}: {
  modo: Modo;
  /** O endereço desta tela (sem filtros). */
  caminho: string;
  /** A base de Compras (`/erp/compras`): os links das notas, dos documentos e da planilha saem dela. */
  comprasBase: string;
  contexto: string;
  f: FiltrosDoRelatorio;
  r: RelatorioDaTela;
  hoje: string;
  /** Só para quem vê o cadastro de insumos (o nome do insumo vira link para o detalhe). */
  insumosBase?: string;
  /** A loja escolhida no topo quando ela decidiu o recorte (a pessoa não marcou loja). */
  visaoDaLoja?: string | null;
}) {
  const vazio = VazioDoRelatorio({ r, f, caminho, modo });
  const t = r.totais;
  const insumoEscolhido = f.insumoId ? r.opcoes.listaDeInsumos.find((i) => i.id === f.insumoId)?.nome : undefined;
  const subtitulo = [contexto, modo === 'insumo' && insumoEscolhido ? insumoEscolhido : null, fraseDoPeriodo(f)].filter(Boolean).join(' · ');
  const verLinhas = modo === 'insumo' || f.ver === 'linhas';
  const paginaDe = (p: number) => hrefDoRelatorio(caminho, f, { pagina: p }) + (modo === 'insumo' ? '#compras' : '');
  const comPreco = r.umInsumo || (modo === 'periodo' && f.agrupar === 'insumo');
  const abertas = r.abertas;
  const rotuloDoGrupo = f.grupo
    ? (r.fornecedores?.grupos.find((g) => g.chave === f.grupo)?.rotulo ?? r.grupos?.grupos.find((g) => g.chave === f.grupo)?.rotulo ?? (f.agrupar === 'dia' ? formatarData(f.grupo) : r.linhas?.linhas[0] ? (f.agrupar === 'insumo' ? r.linhas.linhas[0].insumo : r.linhas.linhas[0].fornecedor) : undefined))
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="metricas"
        cor={COR.compras}
        titulo={TITULO[modo]}
        subtitulo={subtitulo}
      >
        <FormularioDoRelatorio modo={modo} caminho={caminho} f={f} opcoes={r.opcoes} hoje={hoje} />
        {visaoDaLoja && (
          <p className="text-[13px] text-suave">
            Mostrando só <strong className="font-semibold text-texto">{visaoDaLoja}</strong>, a loja escolhida no topo. Para ver outras, marque-as em “Lojas”.
          </p>
        )}
        <ChipsDoRelatorio caminho={caminho} f={f} opcoes={r.opcoes} modo={modo} rotuloDoGrupo={rotuloDoGrupo} />
      </PageHeader>

      {f.situacao === 'canceladas' && (
        <Aviso tom="alerta" titulo="Você está vendo notas CANCELADAS.">
          Elas não são compra e não entram em nenhum total de relatório. Esta tela serve para conferir o que foi cancelado.
        </Aviso>
      )}

      {vazio}

      {!vazio && t && (
        <>
          {t.linhas === 0 ? (
            <Painel semRespiro>
              <Vazio
                titulo={f.situacao === 'canceladas' ? 'Nenhuma nota cancelada neste recorte.' : 'Nenhuma compra neste recorte.'}
                acao={
                  <Link href={hrefDoRelatorio(caminho, { ...f, lojaIds: [], fornecedorId: '', insumoId: modo === 'insumo' ? f.insumoId : '', q: '', categoriaId: '', situacao: 'lancadas', grupo: '', unidade: '', so: '' })} className={classeDeBotao('secundario')}>
                    Tirar os filtros
                  </Link>
                }
              >
                Confira o período e a data usada ({BASES_DE_DATA[f.base].curto}). Os filtros continuam acima, como você deixou.
              </Vazio>
            </Painel>
          ) : (
            <div className="space-y-3">
            <Indicadores f={f} caminho={caminho} t={t} umInsumo={r.umInsumo} modo={modo} nFornecedores={modo === 'insumo' ? new Set(r.fornecedores?.grupos.map((g) => g.chave)).size : undefined} />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-[13px] text-suave">Levar o que está na tela, com o mesmo período, a mesma data usada e os mesmos totais:</p>
                <BarraDeSaida f={f} exportar={`${comprasBase}/relatorios/periodo/exportar`} imprimir={caminho} modo={modo} />
              </div>
            </div>
          )}

          <NotasDoRelatorio f={f} caminho={caminho} r={r} comprasBase={comprasBase} />

          {t.linhas > 0 && modo === 'insumo' && r.fornecedores && r.fornecedores.grupos.length > 0 && (
            <TabelaDosGrupos id="fornecedores" caminho={caminho} f={f} grupos={r.fornecedores.grupos} agrupar="fornecedor" comPreco titulo="De quem você comprou" ancora="#compras" />
          )}

          {t.linhas > 0 && modo === 'periodo' && (
            <nav aria-label="O que mostrar embaixo" className="flex flex-wrap gap-2">
              <Aba href={hrefDoRelatorio(caminho, f, { ver: 'resumo', ...RECORTE_NOVO })} ativa={!verLinhas}>
                Resumo por {ROTULO_DO_AGRUPAMENTO[f.agrupar].toLowerCase()}
              </Aba>
              <Aba href={hrefDoRelatorio(caminho, f, { ver: 'linhas', ...RECORTE_NOVO })} ativa={verLinhas}>
                Todas as compras, linha por linha
              </Aba>
            </nav>
          )}

          {t.linhas > 0 && verLinhas && abertas && r.linhas && (
            <div className="space-y-3">
              {(f.grupo || f.unidade || f.so) && (
                <p className="text-sm text-suave" aria-live="polite">
                  Mostrando <strong className="font-semibold text-texto">{abertas.linhas}</strong> {abertas.linhas === 1 ? 'linha' : 'linhas'} de {abertas.notas} {abertas.notas === 1 ? 'nota' : 'notas'}: {formatarDinheiro(abertas.valorCentavos)} em itens + {formatarDinheiro(abertas.freteCentavos)} de frete = {formatarDinheiro(abertas.valorCentavos + abertas.freteCentavos)}.
                </p>
              )}
              {abertas.linhas === 0 ? (
                <Painel semRespiro>
                  <Vazio titulo="Nenhuma linha com esse recorte.">Tire o filtro de cima para ver as outras.</Vazio>
                </Painel>
              ) : (
                <TabelaDasCompras
                  caminho={caminho}
                  f={f}
                  linhas={r.linhas.linhas}
                  comprasBase={comprasBase}
                  total={abertas.linhas}
                  insumosBase={insumosBase}
                  rodape={<Rodape r={r} f={f} total={abertas.linhas} nesta={r.linhas.linhas.length} singular="linha" plural="linhas" paginaDe={paginaDe} caminho={caminho} modo={modo} />}
                />
              )}
            </div>
          )}

          {t.linhas > 0 && !verLinhas && r.grupos && (
            <TabelaDosGrupos
              caminho={caminho}
              f={f}
              grupos={r.grupos.grupos}
              comPreco={comPreco}
              rodape={<Rodape r={r} f={f} total={r.grupos.total} nesta={r.grupos.grupos.length} singular="grupo" plural="grupos" paginaDe={paginaDe} caminho={caminho} modo={modo} />}
            />
          )}
        </>
      )}
    </div>
  );
}

function Rodape({
  r,
  f,
  total,
  nesta,
  singular,
  plural,
  paginaDe,
  caminho,
  modo,
}: {
  r: RelatorioDaTela;
  f: FiltrosDoRelatorio;
  total: number;
  nesta: number;
  singular: string;
  plural: string;
  paginaDe: (p: number) => string;
  caminho: string;
  modo: Modo;
}) {
  const { de, ate } = faixaDaPagina(r.pagina, f.porPagina, nesta);
  return (
    <PaginacaoNumerada
      de={de}
      ate={ate}
      total={total}
      pagina={r.pagina}
      paginas={r.paginas}
      singular={singular}
      plural={plural}
      href={paginaDe}
      tamanhos={{ opcoes: OPCOES_POR_PAGINA, atual: f.porPagina, href: (n) => hrefDoRelatorio(caminho, f, { porPagina: n, pagina: 1 }) + (modo === 'insumo' ? '#compras' : '') }}
    />
  );
}

// ---------------------------------------------------------------- impressão

/**
 * A versão para imprimir ou salvar em PDF: o navegador faz o arquivo. Tudo o que a tela diz (período, data usada, lojas, filtros,
 * unidades, totais) sai igual, SEM página: o resumo inteiro e as linhas inteiras até o teto; passou do teto, a página diz e manda
 * usar a planilha (nunca corta calada).
 */
export function TelaDeImpressao({
  modo,
  caminho,
  contexto,
  f,
  dados,
  geradoEm,
}: {
  modo: Modo;
  caminho: string;
  contexto: string;
  f: FiltrosDoRelatorio;
  dados: {
    lojasUsadas: { id: string; nome: string }[];
    totais: NonNullable<RelatorioDaTela['totais']>;
    grupos: { grupos: import('@/lib/erp/compras-relatorio').LinhaDeGrupo[]; total: number; passouDoTeto: boolean };
    linhas: { linhas: import('@/lib/erp/compras-relatorio').LinhaDeCompra[]; total: number; passouDoTeto: boolean };
    canceladas: { notas: number; valorCentavos: number; freteCentavos: number } | null;
    semEmissao: number | null;
  };
  geradoEm: string;
}) {
  const voltar = hrefDoRelatorio(caminho, f);
  const umInsumo = recorteDeUmInsumo(f);
  return (
    <div className="ff-relatorio-impressao mx-auto max-w-[1100px] space-y-5">
      <style>{'@media print{@page{size:A4 landscape;margin:12mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <BotaoImprimir />
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para o relatório
        </Link>
        <p className="w-full text-[13px] text-suave">
          Na janela de impressão, escolha “Salvar como PDF”. O arquivo sai sem menu e sem botões, com o mesmo período, a mesma data usada e os mesmos totais da tela.
        </p>
      </div>
      <TabelasDaImpressao modo={modo} contexto={contexto} f={f} dados={dados} geradoEm={geradoEm} umInsumo={umInsumo} teto={TETO_DA_IMPRESSAO} />
    </div>
  );
}
