// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção", "bruto 354 g · fator 1,18" e "40 g · pré-preparo" seguem o subtítulo do contrato ("Rede Completa · N fichas") e a linha de apoio da tabela densa. (O ignore do scanner não aceita id com minúscula.)
/**
 * Detalhe da ficha técnica (1.2), o MESMO para o nível 1 e para a pessoa do
 * parceiro. No topo, o que ajuda a operar: a foto e a descrição. Depois o
 * custo (por porção e da receita, com a conta por extenso; incompleto quando
 * algum insumo está "Sem preço", inclusive dentro de um pré-preparo), os itens
 * com quantidade limpa, peso bruto (fator de correção) e custo — o pré-preparo
 * abre "de onde vem" o custo dele (1.3) —, e o modo de preparo. Pré-preparo
 * diz em que insumo vira e quais fichas o usam (para onde o custo vai). Quem não edita só lê: nenhum botão aparece. Parceiro
 * bloqueado: botões desabilitados, com o motivo.
 */

import Link from 'next/link';
import type { FichaDetalhada } from '@/lib/erp/fichas';
import { contaDaFicha, custoIncompleto, formatarFator, formatarRendimento, porUnidadeDeRendimento, quantidadeBruta, TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarFracao, formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import { ListaHistorico } from '../historico/lista-historico';
import { fraseDoFeitoDaFicha } from './estado';
import { urlDaFoto } from './miniatura';
import { ValidadesDoItem } from '../cadastro/validade';
import type { CustoPorCanal } from '@/lib/erp/canais';
import { CustoPorCanalDaFicha } from './custo-por-canal';

export function TelaDetalheFicha({
  ficha: f,
  base,
  voltar,
  feito,
  contexto,
  podeEditar,
  bloqueio,
  acaoSituacao,
  linkDoInsumo,
  canais,
  linkDasEmbalagens,
  linkDaTaxa,
  podeConfigurarTaxa = false,
}: {
  ficha: FichaDetalhada;
  base: string;
  /** A lista como a pessoa deixou. */
  voltar: string;
  feito?: string;
  /** Antes do tipo no subtítulo (o N1 põe o nome do parceiro). */
  contexto?: string;
  podeEditar: boolean;
  bloqueio: string | null;
  acaoSituacao: AcaoDeCadastro;
  /** Base dos insumos (link de cada item), só para quem vê insumos. */
  linkDoInsumo?: string;
  /** 1.9: custo por canal (prato, só para quem vê a precificação). */
  canais?: CustoPorCanal | null;
  linkDasEmbalagens?: string;
  linkDaTaxa?: string;
  podeConfigurarTaxa?: boolean;
}) {
  const quantidade = (q: number, fator: number, unidade: Parameters<typeof formatarQuantidade>[1]) =>
    fator === 1000 ? null : `bruto ${formatarQuantidade(quantidadeBruta(q, fator), unidade)} · fator ${formatarFator(fator)}`;
  const rende = formatarRendimento(f.rendimentoMilesimos, f.unidadeRendimento, f.tipo);
  const por = porUnidadeDeRendimento(f.unidadeRendimento, f.tipo);
  const incompleto = custoIncompleto(f.custo);
  const mensagem = fraseDoFeitoDaFicha(feito);

  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: f.nome }]} />
      <Voltar href={voltar}>Voltar para a lista</Voltar>
      <PageHeader
        icone="fichas"
        cor={COR.fichas}
        titulo={f.nome}
        subtitulo={[contexto, TIPOS_DE_FICHA[f.tipo], `rende ${rende}`, f.origem === 'IMPORTACAO' ? 'veio de planilha' : null]
          .filter(Boolean)
          .join(' · ')}
        acao={
          podeEditar && f.ativa ? (
            <BotaoOuMotivo href={`${base}/${f.id}/editar`} bloqueio={bloqueio} variante="primario">
              Editar ficha
            </BotaoOuMotivo>
          ) : undefined
        }
      />

      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {!f.ativa && feito !== 'desativada' && (
        <Aviso tom="alerta" titulo="Ficha desativada.">
          Fica fora da lista padrão e da busca, com o histórico guardado.
          {podeEditar ? ' Para editar, reative primeiro.' : ''}
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Celular: o modo de preparo vem logo depois da foto (quem opera lê isso primeiro); a partir de 640 px, depois dos insumos. */}
        <div className="flex min-w-0 flex-col gap-4">
          <Painel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* Sem foto, no celular, uma faixa baixa (não um quadro vazio do tamanho da foto). */}
              <div
                className={`w-full shrink-0 overflow-hidden rounded-[10px] border border-linha bg-forte sm:aspect-[4/3] sm:w-64 ${f.foto ? 'aspect-[4/3]' : 'min-h-11'}`}
              >
                {f.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro; o otimizador do Next não a alcança.
                  <img src={urlDaFoto(base, f.id, f.foto)} alt={`Foto de ${f.nome}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-11 items-center px-4 text-[13px] text-suave sm:justify-center sm:text-center">
                    Sem foto.{podeEditar && f.ativa && !bloqueio ? ' Em Editar ficha dá para pôr uma.' : ''}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <h2 className="text-[13px] font-semibold text-suave">O que é</h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-texto">{f.descricao ?? <span className="text-suave">Sem descrição.</span>}</p>
                </div>
                <div className="border-t border-linha pt-4">
                  <h2 className="text-[13px] font-semibold text-suave">Custo {por}</h2>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-display text-[32px] font-bold leading-none tabular-nums ${incompleto ? 'text-atencao' : ''}`}>
                      {formatarFracao(f.custo.porRendimento)}
                    </span>
                    {incompleto && <Selo tom="alerta">Custo incompleto</Selo>}
                  </div>
                  <p className="mt-2 text-[13px] tabular-nums text-suave">{contaDaFicha(f.custo, f.rendimentoMilesimos, f.unidadeRendimento, f.tipo)}</p>
                </div>
                <div className="border-t border-linha pt-4">
                  <h2 className="text-[13px] font-semibold text-suave">Onde fica e quanto dura</h2>
                  <div className="mt-1">
                    <ValidadesDoItem
                      validades={f.validades}
                      vazio={
                        <>
                          {f.tipo === 'PRE_PREPARO' ? <span className="text-atencao">Validade não informada.</span> : 'Validade não informada.'}
                          {podeEditar && f.ativa && !bloqueio ? (
                            <>
                              {' '}
                              <Link href={`${base}/${f.id}/editar`} className={LINK_DE_TEXTO}>
                                Dizer em Editar ficha
                              </Link>
                            </>
                          ) : null}
                        </>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </Painel>

          <Painel className="order-3 sm:order-2" titulo="Insumos e pré-preparos" semRespiro acessorio={<span className="text-[12px] tabular-nums text-suave">{f.itens.length}</span>}>
            <table className="w-full text-sm">
              <caption className="sr-only">Insumos e pré-preparos da receita: quantidade limpa, peso bruto e custo de cada um.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
                    Item
                  </th>
                  <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
                    Quantidade
                  </th>
                  <th scope="col" className="h-10 pl-3 pr-4 text-right font-semibold sm:pr-5">
                    Custo
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {f.itens.map((i) => {
                  const bruto = quantidade(i.quantidadeMilesimos, i.fatorCorrecaoMilesimos, i.unidade);
                  const p = i.preparo;
                  return (
                    <tr key={i.id} className="border-t border-linha align-top">
                      <td className="py-2.5 pl-4 pr-3 sm:pl-5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {p ? (
                            <Link href={`${base}/${p.id}`} className="font-medium text-texto underline-offset-4 hover:underline">
                              {i.nome}
                            </Link>
                          ) : linkDoInsumo && i.insumoId ? (
                            <Link href={`${linkDoInsumo}/${i.insumoId}`} className="font-medium text-texto underline-offset-4 hover:underline">
                              {i.nome}
                            </Link>
                          ) : (
                            <span className="font-medium text-texto">{i.nome}</span>
                          )}
                          {p && <Selo>Pré-preparo</Selo>}
                          {!i.ativo && <span className="text-[12px] text-suave">{p ? 'desativado' : 'insumo desativado'}</span>}
                        </div>
                        {/* Celular: a quantidade vem embaixo do nome (a coluna some). */}
                        <span className="block text-[12px] text-suave sm:hidden">
                          {formatarQuantidade(i.quantidadeMilesimos, i.unidade)}
                          {bruto ? ` · ${bruto}` : ''}
                        </span>
                        {p && (
                          <details className="group mt-1.5">
                            <summary className="cursor-pointer list-none text-[12px] text-suave underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                              De onde vem: {formatarFracao(p.custo.porRendimento)} por {UNIDADES[p.unidadeRendimento].sigla} ({formatarFracao(p.custo.total)} ÷{' '}
                              {formatarQuantidade(p.rendimentoMilesimos, p.unidadeRendimento)})
                              <span className="ml-1 group-open:hidden">· ver a receita</span>
                            </summary>
                            <ul className="mt-2 space-y-1 border-l-2 border-linha-forte pl-3 text-[12px] text-suave">
                              {p.itens.map((x, k) => (
                                <li key={k} className="flex flex-wrap justify-between gap-x-3">
                                  <span>
                                    {x.nome} {formatarQuantidade(x.quantidadeMilesimos, x.unidade)}
                                    {x.fatorCorrecaoMilesimos !== 1000 ? ` (fator ${formatarFator(x.fatorCorrecaoMilesimos)})` : ''}
                                    {x.preparo ? ' · pré-preparo' : ''}
                                  </span>
                                  <span className="tabular-nums">{x.custo ? formatarFracao(x.custo) : 'sem preço'}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-suave sm:table-cell">
                        {formatarQuantidade(i.quantidadeMilesimos, i.unidade)}
                        {bruto && <span className="block text-[12px]">{bruto}</span>}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right sm:pr-5">
                        {i.custo ? <span className="text-texto">{formatarFracao(i.custo)}</span> : <Selo tom="alerta">Sem preço</Selo>}
                        {p && custoIncompleto(p.custo) && (
                          <span className="mt-1 block">
                            <Selo tom="alerta">Incompleto</Selo>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-linha-forte">
                  <th scope="row" className="h-11 pl-4 pr-3 text-left font-semibold sm:pl-5">
                    Custo da receita (rende {rende})
                  </th>
                  <td className="hidden sm:table-cell" />
                  <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right font-semibold tabular-nums sm:pr-5">
                    {formatarFracao(f.custo.total)}
                    {incompleto && <span className="font-normal text-suave"> + sem preço</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t border-linha px-4 py-3 text-[12px] text-suave sm:px-5">
              Quantidade limpa; o custo conta o bruto (fator). Insumo pelo custo de referência; pré-preparo pelo custo da receita dele ÷ o que rende. Soma
              sem arredondar; cada linha mostra o valor arredondado.
            </p>
          </Painel>

          {canais && (
            <CustoPorCanalDaFicha
              className="order-4 sm:order-3"
              dados={canais}
              linkDasEmbalagens={f.ativa ? linkDasEmbalagens : undefined}
              linkDaTaxa={linkDaTaxa}
              podeConfigurarTaxa={podeConfigurarTaxa}
            />
          )}

          <Painel className="order-2 sm:order-4" titulo="Modo de preparo">
            {f.modoPreparo ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-texto">{f.modoPreparo}</p>
            ) : (
              <Vazio>Sem modo de preparo ainda.</Vazio>
            )}
          </Painel>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Situação e alterações">
          {f.tipo === 'PRE_PREPARO' && (
            <Painel titulo="Pré-preparo">
              <div className="space-y-3 text-sm">
                <p className="text-texto">
                  {f.insumoProduzido ? (
                    <>
                      Aparece em Insumos como{' '}
                      {linkDoInsumo ? (
                        <Link href={`${linkDoInsumo}/${f.insumoProduzido.id}`} className={LINK_DE_TEXTO}>
                          {f.insumoProduzido.nome}
                        </Link>
                      ) : (
                        <strong className="font-semibold">{f.insumoProduzido.nome}</strong>
                      )}
                      , a {formatarFracao(f.custo.porRendimento)} por {UNIDADES[f.unidadeRendimento].sigla}.
                    </>
                  ) : (
                    'Vira insumo na próxima vez que a ficha for salva.'
                  )}
                </p>
                <div>
                  <h3 className="text-[13px] font-semibold text-suave">Usado em</h3>
                  {f.usadaEm.length === 0 ? (
                    <p className="mt-1 text-suave">Nenhuma ficha ainda.</p>
                  ) : (
                    <>
                      <ul className="mt-1 space-y-1">
                        {f.usadaEm.map((u) => (
                          <li key={u.id}>
                            <Link href={`${base}/${u.id}`} className={LINK_DE_TEXTO}>
                              {u.nome}
                            </Link>
                            {!u.ativa && <span className="ml-1 text-[12px] text-suave">desativada</span>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[12px] text-suave">Mudar esta receita muda o custo dessas fichas na hora.</p>
                    </>
                  )}
                </div>
              </div>
            </Painel>
          )}
          {podeEditar && (
            <Painel titulo="Situação">
              {bloqueio ? (
                <p className="text-sm text-suave">{bloqueio}</p>
              ) : (
                <FormSituacao acao={acaoSituacao} ativo={f.ativa} oQue="ficha" idBase="situacao-ficha" />
              )}
            </Painel>
          )}
          <Painel titulo="Últimas alterações" semRespiro>
            {f.historico.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : <ListaHistorico linhas={f.historico} compacta doCadastro={f.nome} />}
          </Painel>
        </aside>
      </div>
    </div>
  );
}
