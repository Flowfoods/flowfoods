/**
 * Detalhe da ficha técnica (1.2), o MESMO para o nível 1 e para a pessoa do
 * parceiro. No topo, o que ajuda a operar: a foto e a descrição. Depois o
 * custo (por porção e da receita, com a conta por extenso; incompleto quando
 * algum insumo está "Sem preço"), os insumos com quantidade e custo, e o modo
 * de preparo. Quem não edita só lê: nenhum botão aparece. Parceiro
 * bloqueado: botões desabilitados, com o motivo.
 */

import Link from 'next/link';
import type { FichaDetalhada } from '@/lib/erp/fichas';
import { contaDaFicha, formatarRendimento, porUnidadeDeRendimento, TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarFracao, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import { ListaHistorico } from '../historico/lista-historico';
import { fraseDoFeitoDaFicha } from './estado';
import { urlDaFoto } from './miniatura';

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
}) {
  const rende = formatarRendimento(f.rendimentoMilesimos, f.unidadeRendimento, f.tipo);
  const por = porUnidadeDeRendimento(f.unidadeRendimento, f.tipo);
  const incompleto = f.custo.semPreco.length > 0;
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
        <div className="min-w-0 space-y-4">
          <Painel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[10px] border border-linha bg-forte sm:w-64">
                {f.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro; o otimizador do Next não a alcança.
                  <img src={urlDaFoto(base, f.id, f.foto)} alt={`Foto de ${f.nome}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center px-4 text-center text-[13px] text-suave">
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
              </div>
            </div>
          </Painel>

          <Painel titulo="Insumos" semRespiro acessorio={<span className="text-[12px] tabular-nums text-suave">{f.itens.length}</span>}>
            <table className="w-full text-sm">
              <caption className="sr-only">Insumos da receita, quantidade e custo de cada um pelo custo de referência.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
                    Insumo
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
                {f.itens.map((i) => (
                  <tr key={i.id} className="border-t border-linha">
                    <td className="h-11 py-2 pl-4 pr-3 sm:pl-5">
                      {linkDoInsumo && i.insumoId ? (
                        <Link href={`${linkDoInsumo}/${i.insumoId}`} className="font-medium text-texto underline-offset-4 hover:underline">
                          {i.nome}
                        </Link>
                      ) : (
                        <span className="font-medium text-texto">{i.nome}</span>
                      )}
                      {!i.ativo && <span className="ml-2 text-[12px] text-suave">insumo desativado</span>}
                      {/* Celular: a quantidade vem embaixo do nome (a coluna some). */}
                      <span className="block text-[12px] text-suave sm:hidden">{formatarQuantidade(i.quantidadeMilesimos, i.unidade)}</span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right text-suave sm:table-cell">
                      {formatarQuantidade(i.quantidadeMilesimos, i.unidade)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right sm:pr-5">
                      {i.custo ? <span className="text-texto">{formatarFracao(i.custo)}</span> : <Selo tom="alerta">Sem preço</Selo>}
                    </td>
                  </tr>
                ))}
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
              Pelo custo de referência de cada insumo (embalagem padrão), somado sem arredondar; cada linha mostra o valor arredondado. O custo pelas compras
              de verdade chega em Compras.
            </p>
          </Painel>

          <Painel titulo="Modo de preparo">
            {f.modoPreparo ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-texto">{f.modoPreparo}</p>
            ) : (
              <Vazio>Sem modo de preparo ainda.</Vazio>
            )}
          </Painel>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Situação e alterações">
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
