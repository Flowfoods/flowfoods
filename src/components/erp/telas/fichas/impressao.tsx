/**
 * N.5 — Ficha técnica para IMPRIMIR ou salvar em PDF (A4 em pé), a mesma para o nível 1 e para a pessoa do parceiro.
 * Composição própria do papel (não é print da tela): identificação e foto, descrição comercial separada, ingredientes com
 * quantidade limpa e bruta, modo de preparo em etapas numeradas, onde fica e quanto dura.
 *
 * Visão automática pela permissão efetiva (decisão de Rodolfo): quem só opera recebe a ficha SEM nenhum valor de custo
 * (`fichaNaTela(…, false)`: o número nem sai do servidor) e a impressão operacional. Quem vê a precificação recebe também o
 * custo dos itens e a área gerencial compacta: custo físico, taxa, meta de CMV, preço, CMV e resultado após os custos
 * informados de cada canal (nunca "lucro"). Não há botão para trocar de visão.
 *
 * É sempre a versão GRAVADA (a página lê do banco): alteração não salva na edição não entra, e a barra diz isso.
 */

import Link from 'next/link';
import type { FichaNaTela } from '@/lib/erp/fichas';
import { CANAIS } from '@/lib/erp/canal-campos';
import { parcelasEmTexto, porcentagemDoCmv, ROTULO_DO_RESULTADO, STATUS_DO_CMV, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { custoIncompleto, formatarFator, formatarRendimento, porUnidadeDeRendimento, quantidadeBruta, TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import { formatarData, hojeNoRio } from '@/lib/erp/compra-campos';
import { formatarDinheiro, formatarFracao, formatarPontosBase, formatarQuantidade } from '@/lib/erp/unidades';
import { validadesEmTexto } from '@/lib/erp/validade';
import { classeDeBotao } from '../../ui/estilos';
import { BotaoImprimir } from '../compras/botao-imprimir';
import { urlDaFoto } from './miniatura';

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12.5px] print:text-black';
const SECAO = 'break-inside-avoid-page space-y-2';
const TITULO = 'text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black';

export function TelaImpressaoFicha({
  ficha: f,
  canais,
  contexto,
  base,
  voltar,
  geradoEm,
}: {
  ficha: FichaNaTela;
  /** Só na visão gerencial (quem vê a precificação) e só para prato. */
  canais: CmvDoCanal[] | null;
  contexto: string;
  base: string;
  voltar: string;
  geradoEm: Date;
}) {
  const rende = formatarRendimento(f.rendimentoMilesimos, f.unidadeRendimento, f.tipo);
  const validade = validadesEmTexto(f.validades);
  const gerencial = f.verCustos;
  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <style>{'@media print{@page{size:A4 portrait;margin:14mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <BotaoImprimir />
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para a ficha
        </Link>
        <p className="w-full text-[13px] text-suave">
          {gerencial ? 'Versão gerencial: com custos e preços.' : 'Versão da cozinha: sem custos nem preços.'} É a ficha como está salva; o que estiver sendo
          editado e não foi salvo não entra. Na janela de impressão, escolha “Salvar como PDF” para gerar o arquivo.
        </p>
      </div>

      <article className="space-y-6 rounded-[14px] border border-linha bg-painel p-6 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="space-y-1 border-b-2 border-linha-forte pb-3">
          <p className={TITULO}>{contexto} · Ficha técnica · FlowFoods</p>
          <h1 className="font-display text-[28px] font-bold leading-tight">{f.nome}</h1>
          <p className="text-[13px] text-suave print:text-black">
            {TIPOS_DE_FICHA[f.tipo]} · rende {rende}
            {!f.ativa ? ' · desativada' : ''} · ficha de {formatarData(hojeNoRio(new Date(f.versao)))} · impressa em {formatarData(hojeNoRio(geradoEm))}
          </p>
        </header>

        <section className={`grid gap-5 ${f.foto ? 'sm:grid-cols-[minmax(0,1fr)_15rem] print:grid-cols-[minmax(0,1fr)_15rem]' : ''}`}>
          <div className="space-y-4">
            {f.descricao && (
              <div className="space-y-1">
                <h2 className={TITULO}>Descrição comercial</h2>
                <p className="text-[14px] leading-relaxed">{f.descricao}</p>
              </div>
            )}
            <div className="space-y-1">
              <h2 className={TITULO}>Onde fica e quanto dura</h2>
              <p className="text-[14px] leading-relaxed">{f.consumoImediato ? 'Consumo imediato: sai da cozinha para o cliente, sem ser guardado.' : (validade ?? 'Validade não informada.')}</p>
            </div>
            {f.custo && (
              <div className="space-y-1">
                <h2 className={TITULO}>Custo {porUnidadeDeRendimento(f.unidadeRendimento, f.tipo)}</h2>
                <p className="text-[14px] tabular-nums">
                  <strong className="font-semibold">{formatarFracao(f.custo.porRendimento)}</strong>
                  {custoIncompleto(f.custo) ? ` (incompleto: falta o custo de ${f.custo.faltaPreco.join(', ')})` : ''} · receita {formatarFracao(f.custo.total)}
                </p>
              </div>
            )}
          </div>
          {f.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro.
            <img src={urlDaFoto(base, f.id, f.foto)} alt={`Foto de ${f.nome}`} className="aspect-[4/3] w-full rounded-[10px] border border-linha object-cover" />
          )}
        </section>

        <section className={SECAO}>
          <h2 className={TITULO}>Ingredientes e pré-preparos</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Quantidade limpa</th>
                <th className={`${TH} text-right`}>Bruto (fator)</th>
                {gerencial && <th className={`${TH} text-right`}>Custo</th>}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {f.itens.map((i) => (
                <tr key={i.id} className="break-inside-avoid">
                  <td className={TD}>
                    {i.nome}
                    {i.preparo ? ' · pré-preparo' : ''}
                  </td>
                  <td className={`${TD} text-right`}>{formatarQuantidade(i.quantidadeMilesimos, i.unidade)}</td>
                  <td className={`${TD} text-right`}>
                    {i.fatorCorrecaoMilesimos === 1000
                      ? '—'
                      : `${formatarQuantidade(quantidadeBruta(i.quantidadeMilesimos, i.fatorCorrecaoMilesimos), i.unidade)} (${formatarFator(i.fatorCorrecaoMilesimos)})`}
                  </td>
                  {gerencial && <td className={`${TD} text-right`}>{i.custo ? formatarFracao(i.custo) : 'não informado'}</td>}
                </tr>
              ))}
            </tbody>
            {f.custo && (
              <tfoot>
                <tr>
                  <th className={`${TD} text-left font-semibold`} colSpan={3}>
                    Custo da receita (rende {rende})
                  </th>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {formatarFracao(f.custo.total)}
                    {custoIncompleto(f.custo) ? ' + ?' : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>

        <section className="space-y-2">
          <h2 className={TITULO}>Modo de preparo</h2>
          {f.passosPreparo.length > 0 ? (
            <ol className="space-y-2">
              {f.passosPreparo.map((p, n) => (
                <li key={n} className="grid break-inside-avoid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                  <span className="font-display text-[17px] font-bold leading-snug">{n + 1}</span>
                  <p className="whitespace-pre-line text-[14px] leading-relaxed">{p}</p>
                </li>
              ))}
            </ol>
          ) : !f.modoPreparo ? (
            <p className="text-[14px] text-suave print:text-black">Sem modo de preparo registrado.</p>
          ) : null}
          {f.modoPreparo && (
            <div className={f.passosPreparo.length > 0 ? 'border-t border-linha pt-2' : ''}>
              {f.passosPreparo.length > 0 && <p className="text-[11px] font-semibold text-suave print:text-black">Texto anterior</p>}
              <p className="whitespace-pre-line text-[14px] leading-relaxed">{f.modoPreparo}</p>
            </div>
          )}
        </section>

        {gerencial && canais && (
          <section className={SECAO}>
            <h2 className={TITULO}>Preço e CMV por canal (uma porção)</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Canal</th>
                  <th className={`${TH} text-right`}>Custo físico</th>
                  <th className={`${TH} text-right`}>Meta</th>
                  <th className={`${TH} text-right`}>Preço</th>
                  <th className={`${TH} text-right`}>CMV</th>
                  <th className={`${TH} text-right`}>{ROTULO_DO_RESULTADO}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {canais.map((x) => (
                  <tr key={x.canal} className="break-inside-avoid">
                    <td className={TD}>{CANAIS[x.canal].rotulo}</td>
                    {x.status === 'naoOfertado' ? (
                      <td className={`${TD} text-right`} colSpan={5}>
                        não ofertado
                      </td>
                    ) : (
                      <>
                        <td className={`${TD} text-right`}>
                          {formatarFracao(x.fisico.valor)}
                          {x.fisico.completo ? '' : ' + ?'}
                        </td>
                        <td className={`${TD} text-right`}>{x.metaBp === null ? 'sem meta' : formatarPontosBase(x.metaBp)}</td>
                        <td className={`${TD} text-right`}>{x.precoCentavos === null ? 'não definido' : formatarDinheiro(x.precoCentavos)}</td>
                        <td className={`${TD} text-right`}>
                          {x.cmvBp ? `${porcentagemDoCmv(x.cmvBp)} · ` : ''}
                          {STATUS_DO_CMV[x.status].rotulo}
                        </td>
                        <td className={`${TD} text-right`}>
                          {x.resultado.tipo === 'ok' ? (
                            <>
                              {x.resultado.negativo ? `−${formatarFracao({ num: -x.resultado.valor.num, den: x.resultado.valor.den })}` : formatarFracao(x.resultado.valor)} (
                              {porcentagemDoCmv(x.resultado.bp)})
                              <span className="block text-[11px] text-suave print:text-black">menos {parcelasEmTexto(x.canal, x.resultado.parcelas)}</span>
                            </>
                          ) : (
                            x.resultado.motivo
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-suave print:text-black">
              CMV teórico do prato ao preço definido, não o CMV real do estoque. O resultado desconta só o que está listado: aluguel, equipe, impostos e
              outras despesas não entram. A taxa do iFood fica fora do CMV.
            </p>
          </section>
        )}
      </article>
    </div>
  );
}
