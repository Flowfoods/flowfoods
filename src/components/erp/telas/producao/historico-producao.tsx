// Scanner avoid-ai-design, SD4d (P2) aceito: "4,6 kg de 5 kg · lote 261021-01" é a linha de apoio, no padrão "A · B" das telas da 1.1–3.2.
/**
 * O histórico da produção de uma loja (3.3): o que foi produzido, quanto (planejado × produzido e o rendimento), por quem
 * (quem pegou ou, sem pegar, quem concluiu), quando (pegou e concluiu) e quanto tempo levou, num período, com os filtros de
 * pessoa e ficha. Concluídos, perdidos, estornados e cancelados, com o motivo. O custo do lote só para quem vê custos (o
 * servidor nem manda para quem não vê). Sem dado = frase (tempo sem hora de pegar, rendimento do cancelado), nunca zero.
 * Tabela Corporativo a partir de 1280 px; cartões abaixo (a cozinha consulta pelo celular). A mesma tela no nível 1.
 */

import Link from 'next/link';
import type { HistoricoDaProducao, LinhaDoHistoricoDaProducao } from '@/lib/erp/producao-equipe';
import { canceladoPelaPessoa, formatarTempo, fraseDoResumo, fraseDoRendimentoDoLote, horaDoDia, rotuloDoPeriodo, ROTULO_DO_DESFECHO } from '@/lib/erp/producao-equipe-campos';
import { rendimentoDoLote } from '@/lib/erp/producao-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { FiltroDoPeriodo } from './periodo';

function SeloDoDesfecho({ l }: { l: LinhaDoHistoricoDaProducao }) {
  if (l.desfecho === 'CONCLUIDO') return null;
  return <Selo tom={l.desfecho === 'PERDIDO' ? 'erro' : l.desfecho === 'ESTORNADO' ? 'alerta' : 'neutro'}>{ROTULO_DO_DESFECHO[l.desfecho]}</Selo>;
}

function Quanto({ l }: { l: LinhaDoHistoricoDaProducao }) {
  const p = formatarQuantidade(l.planejadoMilesimos, l.unidade);
  if (l.desfecho === 'CANCELADO') return <>planejado {p}</>;
  return (
    <>
      <span className="font-semibold text-texto">{formatarQuantidade(l.produzidoMilesimos ?? 0, l.unidade)}</span> de {p}
    </>
  );
}

function Rendimento({ l }: { l: LinhaDoHistoricoDaProducao }) {
  const texto = fraseDoRendimentoDoLote(l);
  const fora = l.desfecho === 'CONCLUIDO' || l.desfecho === 'ESTORNADO' ? rendimentoDoLote(l.planejadoMilesimos, l.produzidoMilesimos ?? 0).foraDaFaixa : false;
  return (
    <>
      <span className={l.desfecho === 'CANCELADO' || l.desfecho === 'PERDIDO' ? 'text-suave' : ''}>{texto}</span>
      {fora && <span className="block text-[12px] text-atencao">fora de ±10%</span>}
    </>
  );
}

/**
 * Quem fez. Polimento da 3.3: sem pessoa da equipe, o lote concluído é da FlowFoods (o nível 1 nunca é "quem fez"); no
 * cancelado ninguém fez — diz com quem estava e quem cancelou: a própria pessoa ou a gerência (que não é culpa dela).
 */
function QuemFez({ l }: { l: LinhaDoHistoricoDaProducao }) {
  if (l.desfecho === 'CANCELADO') {
    const ela = canceladoPelaPessoa(l);
    return (
      <>
        <span>{l.responsavel ? `estava com ${l.responsavel.nome}` : 'ninguém pegou'}</span>
        {l.canceladaPorNome && <span className="block text-[12px] text-suave">{ela ? 'cancelou: a própria pessoa' : l.responsavel ? `cancelou: ${l.canceladaPorNome} (gerência)` : `cancelou: ${l.canceladaPorNome}`}</span>}
      </>
    );
  }
  return (
    <>
      <span>{l.responsavel?.nome ?? 'FlowFoods'}</span>
      {l.concluidaPorNome && l.concluidaPorNome !== l.responsavel?.nome && <span className="block text-[12px] text-suave">concluiu: {l.concluidaPorNome}</span>}
    </>
  );
}

function Tempo({ l }: { l: LinhaDoHistoricoDaProducao }) {
  if (l.desfecho === 'CANCELADO') return <span className="text-suave">—</span>;
  return (
    <>
      <span>{l.tempoMin === null ? <span className="text-suave">sem hora de pegar</span> : formatarTempo(l.tempoMin)}</span>
      <span className="block text-[12px] text-suave">
        {/* A hora basta quando é o dia da linha; outro dia leva a data (pegou ontem, concluiu hoje). */}
        {l.responsavelDesde ? `pegou ${horaDoDia(l.responsavelDesde, l.dia)} · ` : ''}fim {horaDoDia(l.concluidaEm!, l.dia)}
      </span>
    </>
  );
}

function Custo({ l }: { l: LinhaDoHistoricoDaProducao }) {
  if (!l.custo) return <span className="text-suave">—</span>;
  if (l.custo.incompleto) return <Selo tom="alerta">Custo incompleto</Selo>;
  return <>{formatarDinheiro(l.custo.totalCentavos)}</>;
}

const motivoDe = (l: LinhaDoHistoricoDaProducao) => (l.desfecho === 'CANCELADO' || l.desfecho === 'ESTORNADO' ? l.motivoCancelamento : l.motivoRendimento);

export function TelaHistoricoDaProducao({ h, base, contexto }: { h: HistoricoDaProducao; base: string; contexto?: string }) {
  const aqui = `${base}/historico/${h.loja.id}`;
  const doLote = `${base}/${h.loja.id}`;
  const filtrado = !!h.filtro.pessoa || !!h.filtro.ficha;
  return (
    <div className="space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: h.loja.nome }]} />
      <PageHeader icone="producao" cor={COR.producao} titulo="Histórico da produção" subtitulo={[contexto, h.loja.nome, rotuloDoPeriodo(h.periodo, h.hoje)].filter(Boolean).join(' · ')}>
        <FiltroDoPeriodo aqui={aqui} periodo={h.periodo} pessoa={h.filtro.pessoa} ficha={h.filtro.ficha} pessoas={h.pessoas} fichas={h.fichas} />
      </PageHeader>
      {h.cortado && <Aviso tom="alerta" titulo="Período com lotes demais para uma tela só: escolha um período menor." />}

      <Painel titulo="Lotes encerrados" subtitulo={h.resumo.total ? `${fraseDoResumo(h.resumo)}${filtrado ? ' (com o filtro)' : ''}` : undefined} semRespiro>
        {h.linhas.length === 0 ? (
          <Vazio titulo="Nenhum lote encerrado neste período.">{filtrado ? 'Tire o filtro ou escolha outro período.' : 'Os lotes aparecem aqui quando são concluídos ou cancelados.'}</Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha xl:hidden">
              {h.linhas.map((l) => (
                <li key={l.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`${doLote}/${l.id}`} className="ff-transicao -my-1 min-h-11 min-w-0 rounded-[7px] py-1 hover:bg-texto/[0.03]">
                      <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{l.fichaNome}</span>
                      <span className="block text-[12px] tabular-nums text-suave">
                        lote {l.codigo} · {formatarData(l.dia, true)}
                      </span>
                    </Link>
                    <SeloDoDesfecho l={l} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] tabular-nums sm:grid-cols-4">
                    <div>
                      <dt className="text-suave">Quanto</dt>
                      <dd>
                        <Quanto l={l} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-suave">Rendimento</dt>
                      <dd>
                        <Rendimento l={l} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-suave">Quem fez</dt>
                      <dd>
                        <QuemFez l={l} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-suave">Tempo</dt>
                      <dd>
                        <Tempo l={l} />
                      </dd>
                    </div>
                    {h.verCustos && (
                      <div>
                        <dt className="text-suave">Custo do lote</dt>
                        <dd>
                          <Custo l={l} />
                        </dd>
                      </div>
                    )}
                  </dl>
                  {motivoDe(l) && <p className="text-[12px] text-suave">Motivo: {motivoDe(l)}</p>}
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm xl:table">
              <caption className="sr-only">Lotes encerrados no período: o pré-preparo, quanto, o rendimento, quem fez, o tempo{h.verCustos ? ' e o custo' : ''}.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                    Dia
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Pré-preparo
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Quanto
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Rendimento
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Quem fez
                  </th>
                  <th scope="col" className={`h-10 px-3 text-right font-semibold ${h.verCustos ? '' : 'pr-5'}`}>
                    Tempo
                  </th>
                  {h.verCustos && (
                    <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                      Custo do lote
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {h.linhas.map((l) => (
                  <tr key={l.id} className="border-t border-linha align-top">
                    <td className="whitespace-nowrap py-2.5 pl-5 pr-3">{formatarData(l.dia, true)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`${doLote}/${l.id}`} className={`${LINK_DE_TEXTO} text-sm font-semibold`}>
                        {l.fichaNome}
                      </Link>
                      <span className="block text-[12px] text-suave">lote {l.codigo}</span>
                      {motivoDe(l) && <span className="block max-w-[22rem] text-[12px] text-suave [overflow-wrap:anywhere]">Motivo: {motivoDe(l)}</span>}
                      <span className="mt-1 block">
                        <SeloDoDesfecho l={l} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <Quanto l={l} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Rendimento l={l} />
                    </td>
                    <td className="px-3 py-2.5">
                      <QuemFez l={l} />
                    </td>
                    <td className={`px-3 py-2.5 text-right ${h.verCustos ? '' : 'pr-5'}`}>
                      <Tempo l={l} />
                    </td>
                    {h.verCustos && (
                      <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right">
                        <Custo l={l} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {h.foraDaTela > 0 && <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">Mais {h.foraDaTela} lotes no período: escolha um período menor ou filtre para ver.</p>}
          </>
        )}
      </Painel>
      <p className="text-[12px] text-suave">O tempo conta de quando a pessoa pegou o lote (ou de quando os insumos saíram do estoque, se foi depois) até a conclusão. Lote concluído sem pegar pela tela da cozinha não tem tempo.</p>
    </div>
  );
}
