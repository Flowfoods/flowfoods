/**
 * Relatórios de compras (L.2) — o miolo da versão para imprimir ou salvar em PDF: cabeçalho com o recorte, totais, resumo e as
 * linhas, tudo seguido, sem página, com o cabeçalho da tabela repetindo a cada folha. O que a tela diz, aqui sai igual.
 */

import type { LinhaDeCompra, LinhaDeGrupo, RelatorioDaTela } from '@/lib/erp/compras-relatorio';
import {
  BASES_DE_DATA,
  custoMedioEntregue,
  FRASE_DO_MOTIVO,
  fraseDoPeriodo,
  precoDaLinha,
  precoMedioPonderado,
  ROTULO_DO_AGRUPAMENTO,
  type FiltrosDoRelatorio,
} from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade, UNIDADES, type Unidade } from '@/lib/erp/unidades';

type Dados = {
  lojasUsadas: { id: string; nome: string }[];
  totais: NonNullable<RelatorioDaTela['totais']>;
  grupos: { grupos: LinhaDeGrupo[]; total: number; passouDoTeto: boolean };
  linhas: { linhas: LinhaDeCompra[]; total: number; passouDoTeto: boolean };
  canceladas: { notas: number; valorCentavos: number; freteCentavos: number } | null;
  semEmissao: number | null;
};

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12px] print:text-black';

const qtd = (u: Unidade | null, m: number) => (u ? formatarQuantidade(m, u) : 'sem unidade');

export function TabelasDaImpressao({
  modo,
  contexto,
  f,
  dados,
  geradoEm,
  umInsumo,
  teto,
}: {
  modo: 'insumo' | 'periodo';
  contexto: string;
  f: FiltrosDoRelatorio;
  dados: Dados;
  geradoEm: string;
  umInsumo: boolean;
  teto: number;
}) {
  const { totais: t, grupos, linhas, canceladas, semEmissao } = dados;
  const unidades = t.unidades;
  const comPreco = umInsumo || f.agrupar === 'insumo';
  const cabe = linhas.total <= teto && !linhas.passouDoTeto;
  return (
    <article className="space-y-5 rounded-[14px] border border-linha bg-painel p-5 print:border-0 print:bg-white print:p-0 print:text-black">
      <header className="space-y-1 border-b border-linha-forte pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black">{contexto} · FlowFoods ERP</p>
        <h1 className="font-display text-2xl font-bold">{modo === 'insumo' ? 'Histórico de compras de um insumo' : 'Compras do período'}</h1>
        <dl className="grid gap-x-6 gap-y-0.5 text-[12px] sm:grid-cols-[auto_1fr]">
          <dt className="text-suave print:text-black">Período e data usada</dt>
          <dd>{fraseDoPeriodo(f)}</dd>
          <dt className="text-suave print:text-black">Como a data é lida</dt>
          <dd>{BASES_DE_DATA[f.base].explica}</dd>
          <dt className="text-suave print:text-black">Lojas</dt>
          <dd>{dados.lojasUsadas.map((l) => l.nome).join(', ')}</dd>
          <dt className="text-suave print:text-black">Notas</dt>
          <dd>{f.situacao === 'canceladas' ? 'SÓ as canceladas (não são compra e não entram em nenhum total)' : 'Lançadas (as canceladas ficam de fora)'}</dd>
          <dt className="text-suave print:text-black">Gerado em</dt>
          <dd>{geradoEm}</dd>
        </dl>
      </header>

      <section aria-label="Totais" className="break-inside-avoid">
        <h2 className="mb-1 text-sm font-semibold">Totais</h2>
        <div className="overflow-x-auto" role="region" aria-label="Totais" tabIndex={0}>
        <table className="w-full max-w-xl">
          <tbody>
            <tr><th scope="row" className={TH}>Compras (notas) · linhas</th><td className={`${TD} text-right tabular-nums`}>{t.notas} · {t.linhas}</td></tr>
            <tr><th scope="row" className={TH}>Valor dos itens</th><td className={`${TD} text-right tabular-nums`}>{formatarDinheiro(t.valorCentavos)}</td></tr>
            <tr><th scope="row" className={TH}>Frete atribuído</th><td className={`${TD} text-right tabular-nums`}>{formatarDinheiro(t.freteCentavos)}</td></tr>
            <tr><th scope="row" className={TH}>Descontos</th><td className={`${TD} text-right tabular-nums`}>{formatarDinheiro(0)}</td></tr>
            <tr><th scope="row" className={TH}>Total das compras</th><td className={`${TD} text-right font-semibold tabular-nums`}>{formatarDinheiro(t.totalCentavos)}</td></tr>
            {unidades.map((u) => (
              <tr key={u.unidade ?? 'sem'}>
                <th scope="row" className={TH}>Quantidade em {u.unidade ? UNIDADES[u.unidade].sigla : 'sem unidade'}</th>
                <td className={`${TD} text-right tabular-nums`}>{u.unidade ? qtd(u.unidade, u.quantidadeMilesimos) : 'não se soma (a nota não gravou a unidade)'}</td>
              </tr>
            ))}
            {umInsumo &&
              unidades
                .filter((u) => u.unidade)
                .map((u) => (
                  <tr key={`p${u.unidade}`}>
                    <th scope="row" className={TH}>Preço médio ponderado ({UNIDADES[u.unidade as Unidade].sigla}) · com frete</th>
                    <td className={`${TD} text-right tabular-nums`}>
                      {precoMedioPonderado(u) ? formatarCusto(precoMedioPonderado(u), u.unidade as Unidade) : 'sem base'} · {custoMedioEntregue(u) ? formatarCusto(custoMedioEntregue(u), u.unidade as Unidade) : 'sem base'}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        </div>
        {Object.entries(t.semBase).filter(([, n]) => n).length > 0 && (
          <p className="mt-1 text-[12px]">
            Sem base para o preço médio (não calculado):{' '}
            {(Object.entries(t.semBase) as [keyof typeof FRASE_DO_MOTIVO, number][]).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? 'linha' : 'linhas'}: ${FRASE_DO_MOTIVO[k]}`).join('; ')}.
          </p>
        )}
        {canceladas && canceladas.notas > 0 && (
          <p className="mt-1 text-[12px]">
            Fora dos totais: {canceladas.notas} {canceladas.notas === 1 ? 'nota cancelada' : 'notas canceladas'} ({formatarDinheiro(canceladas.valorCentavos + canceladas.freteCentavos)}).
          </p>
        )}
        {semEmissao ? <p className="mt-1 text-[12px]">{semEmissao} {semEmissao === 1 ? 'nota digitada à mão não tem' : 'notas digitadas à mão não têm'} data de emissão e ficou de fora.</p> : null}
      </section>

      <section aria-label={`Resumo por ${ROTULO_DO_AGRUPAMENTO[f.agrupar].toLowerCase()}`}>
        <h2 className="mb-1 text-sm font-semibold">Resumo por {ROTULO_DO_AGRUPAMENTO[f.agrupar].toLowerCase()}</h2>
        {grupos.passouDoTeto ? (
          <p className="text-[12px]">Grupos demais para uma folha: reduza o período ou filtre.</p>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Tabela do resumo" tabIndex={0}>
          <table className="w-full">
            <thead>
              <tr>
                <th scope="col" className={TH}>{ROTULO_DO_AGRUPAMENTO[f.agrupar]}</th>
                <th scope="col" className={`${TH} text-right`}>Quantidade</th>
                <th scope="col" className={`${TH} text-right`}>Itens</th>
                <th scope="col" className={`${TH} text-right`}>Frete</th>
                <th scope="col" className={`${TH} text-right`}>Total</th>
                {comPreco && <th scope="col" className={`${TH} text-right`}>Preço médio</th>}
                <th scope="col" className={`${TH} text-right`}>Notas</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {grupos.grupos.map((g) => (
                <tr key={`${g.chave}|${g.total.unidade}`} className="break-inside-avoid">
                  <td className={TD}>{g.rotulo}</td>
                  <td className={`${TD} text-right`}>{qtd(g.total.unidade, g.total.quantidadeMilesimos)}</td>
                  <td className={`${TD} text-right`}>{formatarDinheiro(g.total.valorCentavos)}</td>
                  <td className={`${TD} text-right`}>{formatarDinheiro(g.total.freteCentavos)}</td>
                  <td className={`${TD} text-right font-semibold`}>{formatarDinheiro(g.total.valorCentavos + g.total.freteCentavos)}</td>
                  {comPreco && <td className={`${TD} text-right`}>{g.total.unidade ? (precoMedioPonderado(g.total) ? formatarCusto(precoMedioPonderado(g.total), g.total.unidade) : 'sem base') : '—'}</td>}
                  <td className={`${TD} text-right`}>{g.notas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section aria-label="As compras, linha por linha">
        <h2 className="mb-1 text-sm font-semibold">As compras, linha por linha ({linhas.total})</h2>
        {!cabe ? (
          <p className="text-[12px]">
            São mais de {teto.toLocaleString('pt-BR')} linhas: não cabem numa folha sem cortar. Os totais e o resumo acima estão completos; para as linhas, baixe a planilha das compras (ou reduza o período).
          </p>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Tabela das compras" tabIndex={0}>
          <table className="w-full">
            <thead>
              <tr>
                <th scope="col" className={TH}>Data</th>
                <th scope="col" className={TH}>Loja</th>
                <th scope="col" className={TH}>Fornecedor · nota</th>
                <th scope="col" className={TH}>Insumo · embalagem original</th>
                <th scope="col" className={`${TH} text-right`}>Quantidade</th>
                <th scope="col" className={`${TH} text-right`}>Preço unitário</th>
                <th scope="col" className={`${TH} text-right`}>Itens</th>
                <th scope="col" className={`${TH} text-right`}>Frete</th>
                <th scope="col" className={`${TH} text-right`}>Desc.</th>
                <th scope="col" className={`${TH} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.linhas.map((l) => {
                const { preco } = precoDaLinha(l);
                return (
                  <tr key={l.itemId} className="break-inside-avoid">
                    <td className={TD}>{formatarData(l.data)}</td>
                    <td className={TD}>{l.loja}</td>
                    <td className={TD}>{l.fornecedor} · nota {l.rotuloDaNota}{l.cancelada ? ' (CANCELADA)' : ''}</td>
                    <td className={TD}>{l.insumo} · {(l.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} × {l.embalagem}</td>
                    <td className={`${TD} text-right`}>{qtd(l.unidade, l.quantidadeMilesimos)}</td>
                    <td className={`${TD} text-right`}>{l.motivoSemBase ? `sem base` : formatarCusto(preco, l.unidade as Unidade)}</td>
                    <td className={`${TD} text-right`}>{formatarDinheiro(l.valorCentavos)}</td>
                    <td className={`${TD} text-right`}>{formatarDinheiro(l.freteCentavos)}</td>
                    <td className={`${TD} text-right`}>{formatarDinheiro(0)}</td>
                    <td className={`${TD} text-right font-semibold`}>{formatarDinheiro(l.totalCentavos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </article>
  );
}
