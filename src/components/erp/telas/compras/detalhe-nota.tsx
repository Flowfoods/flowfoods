// Scanner avoid-ai-design, SD4d (P2) aceito: "Caixa · 5 kg" e "Vila da Penha · 14/10/2026" são linhas de apoio da tabela densa, no padrão "A · B" das telas da 1.1–1.4. (O ignore do scanner não aceita id com minúscula.)
/**
 * Detalhe da nota de compra (1.5), o MESMO no nível 1 e na pessoa do
 * parceiro: cabeçalho (fornecedor, loja, data, total conferido), os itens
 * como foram comprados (snapshot) com o custo por unidade de cada um e se a
 * nota é a que vale no custo do insumo agora, situação (cancelar) e as
 * alterações. Quem só vê não tem botão nenhum.
 */

import Link from 'next/link';
import type { NotaDetalhada } from '@/lib/erp/compras';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarDocumento } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { fechadoNaData, type AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { quantidadeComSinal } from '@/lib/erp/estoque-campos';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { Aviso, Linha, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { ListaHistorico } from '../historico/lista-historico';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import type { AcaoDeNota } from './estado';
import { fraseDaNota } from './estado';
import { FormCancelarNota } from './form-cancelar';
import type { OrcamentoNaNota } from '@/lib/erp/orcamento';
import { AvisoDoOrcamento } from './orcamento';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function TelaDetalheNota({
  nota: n,
  base,
  voltar,
  feito,
  contexto,
  podeLancar,
  bloqueio,
  insumosBase,
  fornecedoresBase,
  estoqueBase,
  acaoCancelar,
  periodos,
  orcamento,
  orcamentoHref,
  documentoHref,
}: {
  nota: NotaDetalhada;
  base: string;
  voltar: string;
  feito?: string;
  contexto?: string;
  /** Lança/edita/cancela NESTA loja. */
  podeLancar: boolean;
  bloqueio: string | null;
  /** Link do insumo (quem vê insumos). */
  insumosBase?: string;
  fornecedoresBase: string;
  /** 1.6: link do estoque da loja (quem vê o estoque dela). */
  estoqueBase?: string;
  acaoCancelar: AcaoDeNota;
  /** Os períodos fechados: nota de período fechado não se edita nem se cancela, e a tela já diz. */
  periodos: AvisoDePeriodos;
  /** 2.5: como ficou o orçamento de compra da loja (nota do período em curso); nulo = não mostra. */
  orcamento?: OrcamentoNaNota | null;
  /** Link da tela do orçamento (quem vê compras). */
  orcamentoHref?: string;
  /** F.1b: link da nota fiscal (XML) de onde a nota veio ou a que foi ligada; ausente = quem não vê notas recebidas. */
  documentoHref?: string;
}) {
  const mensagem = fraseDaNota(feito);
  const fechado = fechadoNaData(periodos.fechados, n.entradaEm);
  const cancela = podeLancar && !n.cancelada && !fechado;
  // F.1b: a nota que veio do XML (ou foi ligada a ele) é o que a nota fiscal diz: não se edita, se cancela e se concilia de novo.
  const edita = cancela && !n.chaveAcesso;
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: n.rotulo }]} />
      <Voltar href={voltar}>Voltar para as notas</Voltar>
      <PageHeader
        icone="compras"
        cor={COR.compras}
        titulo={n.fornecedorNome}
        subtitulo={[contexto, n.rotulo, n.loja, formatarData(n.entradaEm)].filter(Boolean).join(' · ')}
        acao={
          edita ? (
            <BotaoOuMotivo href={`${base}/${n.id}/editar`} bloqueio={bloqueio} variante="primario">
              Editar nota
            </BotaoOuMotivo>
          ) : undefined
        }
      />

      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {orcamento && <AvisoDoOrcamento o={orcamento} href={orcamentoHref} agora={feito === 'lancada' || feito === 'editada'} />}
      {n.chaveAcesso && !n.cancelada && (
        <Aviso tom="neutro" titulo="Esta nota veio da nota fiscal (XML).">
          Ela não se edita. Para corrigir, cancele esta nota (o estoque e o custo voltam) e concilie a nota fiscal de novo.{' '}
          {documentoHref && (
            <Link href={documentoHref} className={LINK_DE_TEXTO}>
              Abrir a nota fiscal
            </Link>
          )}
        </Aviso>
      )}
      {fechado && podeLancar && !n.cancelada && <AvisoDoPeriodoFechado periodo={fechado.nome} href={periodos.href} frase="Esta nota é desse período: não dá para editar nem cancelar." />}
      {n.cancelada && feito !== 'cancelada' && (
        <Aviso tom="alerta" titulo="Nota cancelada.">
          {n.motivoCancelamento ? `Motivo: ${n.motivoCancelamento}.` : ''} Não vale para o custo. A mesma nota pode ser lançada de novo, certa.
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="Total da nota">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <span className={`font-display text-[32px] font-bold leading-none tabular-nums ${n.cancelada ? 'text-suave line-through' : ''}`}>
                {formatarDinheiro(n.totalCentavos)}
              </span>
              <p className="text-sm tabular-nums text-suave">
                Itens {formatarDinheiro(n.somaItensCentavos)} + frete {formatarDinheiro(n.freteCentavos)}
              </p>
            </div>
            <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">
              {n.freteCentavos > 0 ? 'O frete foi dividido entre os itens pelo valor de cada um e entra no custo. ' : ''}
              {n.estoque.frase}
            </p>
          </Painel>

          <Painel titulo="Itens" semRespiro>
            {/* Celular: um bloco por item. */}
            <ul className="divide-y divide-linha md:hidden">
              {n.itens.map((i) => (
                <li key={i.id} className="space-y-0.5 px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <NomeDoItem i={i} insumosBase={insumosBase} />
                    <span className="shrink-0 font-semibold tabular-nums">{formatarDinheiro(i.valorCentavos)}</span>
                  </div>
                  <div className="text-[12px] tabular-nums text-suave">
                    {i.embalagem} · {(i.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} = {formatarQuantidade(i.quantidadeMilesimos, i.unidade)}
                    {i.freteRateadoCentavos > 0 && ` · frete ${formatarDinheiro(i.freteRateadoCentavos)}`}
                  </div>
                  <div className="text-[12px] tabular-nums">
                    <span className="font-semibold text-texto">{formatarCusto(i.custo, i.unidade)}</span> <ValeNoCusto i={i} cancelada={n.cancelada} />
                  </div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm md:table">
              <caption className="sr-only">Itens da nota com o custo por unidade (valor mais frete rateado, dividido pela quantidade).</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                    Insumo
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Quantidade
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Valor
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Frete
                  </th>
                  <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                    Custo por unidade
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {n.itens.map((i) => (
                  <tr key={i.id} className="border-t border-linha">
                    <td className="py-2 pl-5 pr-3">
                      <NomeDoItem i={i} insumosBase={insumosBase} />
                      <div className="text-[12px] text-suave">{i.embalagem}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatarQuantidade(i.quantidadeMilesimos, i.unidade)}
                      <div className="text-[12px] text-suave">{(i.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} emb.</div>
                    </td>
                    <td className="px-3 py-2 text-right">{formatarDinheiro(i.valorCentavos)}</td>
                    <td className="px-3 py-2 text-right text-suave">{i.freteRateadoCentavos > 0 ? formatarDinheiro(i.freteRateadoCentavos) : '—'}</td>
                    <td className="px-3 py-2 pr-5 text-right">
                      <span className="font-semibold">{formatarCusto(i.custo, i.unidade)}</span>
                      <div className="text-[12px]">
                        <ValeNoCusto i={i} cancelada={n.cancelada} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Fornecedor, situação e alterações">
          <Painel titulo="Fornecedor e loja">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Fornecedor">
                {n.fornecedor ? (
                  <Link href={`${fornecedoresBase}/${n.fornecedor.id}`} className={LINK_DE_TEXTO}>
                    {n.fornecedor.nome}
                  </Link>
                ) : (
                  n.fornecedorNome
                )}
              </Linha>
              {n.fornecedor?.documento && <Linha rotulo="CNPJ/CPF">{formatarDocumento(n.fornecedor.documento)}</Linha>}
              <Linha rotulo="Loja">{n.loja}</Linha>
              <Linha rotulo="Número">
                {n.numero}
                {n.serie ? ` · série ${n.serie}` : ''}
              </Linha>
              <Linha rotulo="Data da nota">{formatarData(n.entradaEm)}</Linha>
              {n.lancadaEm && <Linha rotulo="Lançada em">{DATA_HORA.format(n.lancadaEm).replace(',', ' às')}</Linha>}
              {n.canceladaEm && <Linha rotulo="Cancelada em">{DATA_HORA.format(n.canceladaEm).replace(',', ' às')}</Linha>}
            </dl>
          </Painel>
          {n.estoque.movimentos.length > 0 && (
            <Painel
              titulo="No estoque"
              subtitulo="Entrada e estorno, nunca apagados"
              semRespiro
              acessorio={
                estoqueBase ? (
                  <Link href={`${estoqueBase}/${n.lojaId}`} className={`${LINK_DE_TEXTO} whitespace-nowrap`}>
                    Ver o estoque
                  </Link>
                ) : undefined
              }
            >
              <ul className="divide-y divide-linha">
                {n.estoque.movimentos.map((m) => (
                  <li key={m.id} className="px-4 py-2.5 text-sm sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-texto">
                        {m.estorno && <span className="font-semibold">Estorno · </span>}
                        {m.nome}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${m.estorno ? 'text-suave' : 'text-texto'}`}>{quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}</span>
                    </div>
                    <div className="text-[12px] tabular-nums text-suave">
                      {DATA_HORA.format(m.ocorridoEm).replace(',', ' às')} · saldo {formatarQuantidade(m.antes, m.unidade)} para {formatarQuantidade(m.depois, m.unidade)}
                    </div>
                  </li>
                ))}
              </ul>
            </Painel>
          )}
          {cancela && (
            <Painel titulo="Situação">{bloqueio ? <p className="text-sm text-suave">{bloqueio}</p> : <FormCancelarNota acao={acaoCancelar} />}</Painel>
          )}
          <Painel titulo="Alterações" semRespiro>
            {n.historico.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : <ListaHistorico linhas={n.historico} compacta doCadastro={n.rotulo} />}
          </Painel>
        </aside>
      </div>
    </div>
  );
}

type Item = NotaDetalhada['itens'][number];

function NomeDoItem({ i, insumosBase }: { i: Item; insumosBase?: string }) {
  return (
    <span className="min-w-0 font-medium text-texto">
      {insumosBase && i.insumoId ? (
        <Link href={`${insumosBase}/${i.insumoId}`} className="ff-transicao rounded-[5px] underline-offset-4 hover:underline">
          {i.nome}
        </Link>
      ) : (
        i.nome
      )}
      {i.nomeHoje && <span className="text-[12px] font-normal text-suave"> (hoje “{i.nomeHoje}”)</span>}
    </span>
  );
}

function ValeNoCusto({ i, cancelada }: { i: Item; cancelada: boolean }) {
  if (cancelada) return <span className="text-suave">não vale (cancelada)</span>;
  if (i.valeNoCusto) return <Selo tom="ok">vale no custo</Selo>;
  return <span className="text-suave">vale a de {i.valeOutra ?? 'outra data'}</span>;
}
