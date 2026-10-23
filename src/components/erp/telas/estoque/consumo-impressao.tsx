/**
 * Consumo e conciliação de estoque (L.4) — a versão para imprimir ou salvar em PDF: cabeçalho com o recorte, a ponte de cada unidade,
 * os avisos e a tabela inteira (sem página), com o cabeçalho repetindo a cada folha. O que a tela diz, aqui sai igual.
 */

import Link from 'next/link';
import type { ConsumoDaTela } from '@/lib/erp/consumo-estoque';
import {
  COLUNAS_DA_TELA,
  NOTA_DA_DATA,
  NOTA_DA_TRANSFERENCIA,
  NOTA_DO_AJUSTE,
  NOTA_DO_BRUTO,
  NOTA_DO_USO,
  ROTULO_DA_COLUNA,
  avisosDoConsumo,
  dinheiroComSinal,
  dinheiroLimpo,
  fraseDoPeriodoDoConsumo,
  frasesDoBrutoELiquido,
  quantidadeComSinal,
  quantidadeLimpa,
  somaDaColuna,
  type FiltrosDoConsumo,
} from '@/lib/erp/consumo-estoque-campos';
import { UNIDADES } from '@/lib/erp/unidades';
import { classeDeBotao } from '../../ui/estilos';
import { BotaoImprimir } from '../compras/botao-imprimir';
import { hrefDoConsumo } from './consumo-filtros';

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12px] print:text-black';

export function ImpressaoDoConsumo({
  caminho,
  contexto,
  f,
  r,
  geradoEm,
  hoje,
  teto,
}: {
  caminho: string;
  contexto: string;
  f: FiltrosDoConsumo;
  r: ConsumoDaTela;
  geradoEm: string;
  hoje: string;
  teto: number;
}) {
  const voltar = hrefDoConsumo(caminho, f, { col: '' }, { semPagina: true });
  const resumo = r.resumo!;
  const linhas = r.pagina!.linhas;
  const vv = r.verValores;
  const avisos = avisosDoConsumo({
    de: f.de,
    ate: f.ate,
    hoje,
    verValores: vv,
    lojasSemEstoque: r.lojasSemEstoque,
    aguardando: r.aguardando,
    contagensEmAndamento: r.contagensEmAndamento,
    linhas: resumo.linhas,
    comLacunaDura: resumo.comLacunaDura,
    semContagem: resumo.semContagem,
    semValor: resumo.semValor,
    movimentosSemOrigem: resumo.movimentosSemOrigem,
  });
  const filtros = [f.q ? `Insumo com “${f.q}” no nome` : '', f.so === 'atencao' ? 'Só o que pede atenção' : '', f.so === 'semcontagem' ? 'Só sem contagem no período' : ''].filter(Boolean);
  return (
    <div className="ff-relatorio-impressao mx-auto max-w-[1100px] space-y-5">
      <style>{'@media print{@page{size:A4 landscape;margin:12mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <BotaoImprimir />
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para o consumo
        </Link>
        <p className="w-full text-[13px] text-suave">Na janela de impressão, escolha “Salvar como PDF”. O arquivo sai sem menu e sem botões, com o mesmo período e os mesmos números da tela.</p>
      </div>
      <article className="space-y-5 rounded-[14px] border border-linha bg-painel p-5 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="space-y-1 border-b border-linha-forte pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black">{contexto} · FlowFoods ERP</p>
          <h1 className="font-display text-2xl font-bold">Consumo e conciliação de estoque</h1>
          <dl className="grid gap-x-6 gap-y-0.5 text-[12px] sm:grid-cols-[auto_1fr]">
            <dt className="text-suave print:text-black">Período</dt>
            <dd>{fraseDoPeriodoDoConsumo(f)}</dd>
            <dt className="text-suave print:text-black">Como a data é lida</dt>
            <dd>{NOTA_DA_DATA}</dd>
            <dt className="text-suave print:text-black">Lojas</dt>
            <dd>{r.lojasUsadas.map((l) => l.nome).join(', ')}</dd>
            {filtros.length > 0 && (
              <>
                <dt className="text-suave print:text-black">Filtros</dt>
                <dd>{filtros.join(' · ')}</dd>
              </>
            )}
            <dt className="text-suave print:text-black">O que é o uso</dt>
            <dd>{NOTA_DO_USO}</dd>
            <dt className="text-suave print:text-black">Bruto e líquido</dt>
            <dd>{NOTA_DO_BRUTO}</dd>
            <dt className="text-suave print:text-black">Ajuste de contagem</dt>
            <dd>{NOTA_DO_AJUSTE}</dd>
            <dt className="text-suave print:text-black">Transferência</dt>
            <dd>{NOTA_DA_TRANSFERENCIA}</dd>
            <dt className="text-suave print:text-black">Valores</dt>
            <dd>{vv ? 'Quantidade na unidade base, com sinal (+ entra, − sai); R$ como o livro gravou na época.' : 'Quantidade na unidade base, com sinal (+ entra, − sai). Sem valores em reais para o seu acesso.'}</dd>
            <dt className="text-suave print:text-black">Gerado em</dt>
            <dd>{geradoEm}</dd>
          </dl>
        </header>

        {avisos.length > 0 && (
          <section aria-label="Avisos do relatório" className="break-inside-avoid">
            <h2 className="mb-1 text-sm font-semibold">Antes de ler</h2>
            <ul className="list-disc space-y-0.5 pl-5 text-[12px]">
              {avisos.map((a) => (
                <li key={a.chave}>{a.texto}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Totais por unidade" className="break-inside-avoid">
          <h2 className="mb-1 break-after-avoid text-sm font-semibold">Totais por unidade (kg, L e un nunca se somam)</h2>
          <div className="overflow-x-auto" role="region" aria-label="Tabela dos totais por unidade" tabIndex={0}>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Unidade</th>
                  <th scope="col" className={`${TH} text-right`}>Saldo inicial</th>
                  {COLUNAS_DA_TELA.map((c) => (
                    <th key={c} scope="col" className={`${TH} text-right`}>{ROTULO_DA_COLUNA[c]}</th>
                  ))}
                  <th scope="col" className={`${TH} text-right`}>Saldo final</th>
                  <th scope="col" className={TH}>Confere</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {resumo.unidades.map((u) => (
                  <tr key={u.unidade} className="break-inside-avoid">
                    <th scope="row" className={TD}>{UNIDADES[u.unidade].sigla} · {u.linhas} {u.linhas === 1 ? 'insumo × loja' : 'insumos × lojas'}</th>
                    <td className={`${TD} text-right`}>{quantidadeLimpa(u.inicial.q, u.unidade)}{vv ? <span className="block">{dinheiroLimpo(u.inicial.v)}</span> : null}</td>
                    {COLUNAS_DA_TELA.map((c) => {
                      const s = somaDaColuna(u.somas, c);
                      return (
                        <td key={c} className={`${TD} text-right`}>
                          {quantidadeComSinal(s.q, u.unidade)}
                          {vv ? <span className="block">{dinheiroComSinal(s.v)}</span> : null}
                        </td>
                      );
                    })}
                    <td className={`${TD} text-right font-semibold`}>{quantidadeLimpa(u.final.q, u.unidade)}{vv ? <span className="block">{dinheiroLimpo(u.final.v)}</span> : null}</td>
                    <td className={TD}>{u.diferencaMilesimos === 0 ? 'Sim' : `Não: diferença de ${quantidadeComSinal(u.diferencaMilesimos, u.unidade)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-2 space-y-1 text-[12px]">
            {resumo.unidades.map((u) => {
              const fr = frasesDoBrutoELiquido(u.somas, u.unidade);
              return (
                <li key={u.unidade}>
                  <strong className="font-semibold">Em {UNIDADES[u.unidade].sigla}. Compras:</strong> {fr.compras.lancadas} lançadas, {fr.compras.cancelamentos} em cancelamentos e correções de nota = <strong className="font-semibold">{fr.compras.liquidas} líquidas</strong>.{' '}
                  <strong className="font-semibold">Uso:</strong> {fr.uso.requisitados} requisitados, {fr.uso.devolvidos} devolvidos = <strong className="font-semibold">{fr.uso.liquidos} líquidos</strong>.
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Insumos e lojas">
          <h2 className="mb-1 break-after-avoid text-sm font-semibold">Por insumo e loja</h2>
          {r.pagina!.total > teto ? (
            <p className="text-[12px]">Este recorte tem {r.pagina!.total.toLocaleString('pt-BR')} insumos × lojas, mais do que cabe numa impressão ({teto.toLocaleString('pt-BR')}). A impressão não corta calada: reduza o período ou filtre por loja ou insumo, ou baixe a planilha.</p>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="Tabela por insumo e loja" tabIndex={0}>
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Insumo · loja</th>
                    <th scope="col" className={`${TH} text-right`}>Saldo inicial</th>
                    {COLUNAS_DA_TELA.map((c) => (
                      <th key={c} scope="col" className={`${TH} text-right`}>{ROTULO_DA_COLUNA[c]}</th>
                    ))}
                    <th scope="col" className={`${TH} text-right`}>Saldo final</th>
                    <th scope="col" className={TH}>Lacunas</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {linhas.map((l) => (
                    <tr key={`${l.lojaId}|${l.insumoId}`} className="break-inside-avoid">
                      <td className={TD}>
                        {l.insumo} <span className="text-suave print:text-black">({UNIDADES[l.unidade].sigla})</span>
                        {r.lojasUsadas.length > 1 ? <span className="block">{l.loja}</span> : null}
                      </td>
                      <td className={`${TD} text-right`}>{quantidadeLimpa(l.inicial.q, l.unidade)}{vv ? <span className="block">{dinheiroLimpo(l.inicial.v)}</span> : null}</td>
                      {COLUNAS_DA_TELA.map((c) => {
                        const s = somaDaColuna(l.somas, c);
                        return (
                          <td key={c} className={`${TD} text-right`}>
                            {s.n === 0 && s.q === 0 ? '—' : quantidadeComSinal(s.q, l.unidade)}
                            {vv && (s.n > 0 || s.q !== 0) ? <span className="block">{dinheiroComSinal(s.v)}</span> : null}
                          </td>
                        );
                      })}
                      <td className={`${TD} text-right font-semibold`}>{quantidadeLimpa(l.final.q, l.unidade)}{vv ? <span className="block font-normal">{dinheiroLimpo(l.final.v)}</span> : null}</td>
                      <td className={TD}>{[!l.confere ? 'A conta não fecha' : '', ...l.lacunas.map((x) => x.rotulo)].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>
    </div>
  );
}
