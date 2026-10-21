// Scanner avoid-ai-design, SD4d (P2) aceito: "Cozinha · para hoje · planejado por Caio" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.8.
/**
 * Um lote (3.1): o que foi planejado, os insumos (pedido × saiu × falta, pela requisição que a produção criou), o resultado
 * quando concluído (quanto saiu, rendimento, motivo, validade), o custo do lote para quem vê custos (as baixas reais ÷ o que
 * saiu, ao lado do previsto pela ficha e do que a diferença custou), o que entrou no estoque, as saídas possíveis (pegar,
 * concluir, soltar, passar, cancelar, estornar) e o histórico. A mesma tela no nível 1 e na pessoa do parceiro. 3.3: quem
 * está com o lote e desde quando; o lote com outra pessoa só ela ou a gerência conclui, solta ou cancela.
 */

import Link from 'next/link';
import type { LoteDaLoja } from '@/lib/erp/producao';
import { formatarRendimento, fraseSemPreco, pendente as pendenteDoLote, quandoVence, TITULO_NO_HISTORICO_DO_LOTE } from '@/lib/erp/producao-campos';
import { fraseDeQuemPegou, horaDoDia } from '@/lib/erp/producao-equipe-campos';
import { numeroDaRequisicao, textoDoParaDia } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES, formatarValidade } from '@/lib/erp/validade';
import { formatarDinheiro, formatarFracao, formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Linha, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { LivroDoEstoque } from '../estoque/livro';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoDeEstoque } from '../estoque/estado';
import { SeloDaRequisicao, quandoLongo, SeloDoAtraso } from '../requisicoes/partes';
import { FormCancelarLote, FormEstornar } from './formularios';
import { FormPassar, FormPegar, FormSoltar } from './form-tarefas';
import { SeloDoLote } from './partes';

export function TelaDoLote({
  d,
  base,
  contexto,
  feito,
  pode,
  hrefs,
  acoes,
  pessoas,
  bloqueio,
}: {
  d: LoteDaLoja;
  base: string;
  contexto?: string;
  feito?: string;
  /** `gerenciar` (3.3) = "definir a lista do dia": solta e passa o lote de qualquer pessoa, conclui e cancela por ela. `pegar` = é uma pessoa da equipe (o nível 1 não pega). */
  pode: { registrar: boolean; estornar: boolean; gerenciar: boolean; pegar: boolean };
  /** Para onde os links levam; null = a pessoa não vê aquela tela (o link nem aparece). */
  hrefs: { requisicao: string | null; estoque: string | null };
  acoes: { pegar: AcaoDeEstoque; soltar: AcaoDeEstoque; passar: AcaoDeEstoque; cancelar: AcaoDeEstoque; estornar: AcaoDeEstoque };
  /** Quem pode receber o lote (só para a gerência). */
  pessoas: readonly { usuarioId: string; nome: string }[];
  bloqueio: string | null;
}) {
  const o = d.ordem;
  const u = UNIDADES[o.unidade];
  const quadro = `${base}/${d.loja.id}`;
  const aqui = `${quadro}/${o.id}`;
  const pend = pendenteDoLote(o.status);
  const livre = pode.registrar && !bloqueio && d.aberto;
  // 3.3: o lote com outra pessoa: só ela ou a gerência mexe.
  const comOutro = d.responsavel && !d.responsavel.comigo ? d.responsavel : null;
  const mexe = !comOutro || pode.gerenciar;
  const podeConcluir = livre && pend;
  const entrouNoEstoque = d.movimentos.find((m) => m.tipo === 'PRODUCAO_ENTRADA' && !m.estorno);
  const quantoEntrou = entrouNoEstoque ? formatarQuantidade(entrouNoEstoque.quantidadeMilesimos, o.unidade) : null;
  const c = d.custo;
  const semPreco = c?.semPreco ?? [];
  const entregues = d.requisicao?.status === 'ATENDIDA';
  // Sem baixa não há custo: "—" (ou "a entregar" enquanto o lote ainda espera), nunca R$ 0,00.
  const custoDoItem = (i: (typeof d.itensDoLote)[number]) =>
    i.semPreco ? 'Sem preço' : i.saiuMilesimos === 0 || i.valorCentavos === null ? (pend && i.faltaMilesimos > 0 ? 'a entregar' : '—') : formatarDinheiro(i.valorCentavos);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: quadro }, { rotulo: `Lote ${o.codigoLote}` }]} />
      <Voltar href={quadro}>Voltar para a produção</Voltar>
      <PageHeader
        icone="producao"
        cor={COR.producao}
        titulo={`Lote ${o.codigoLote}`}
        subtitulo={[contexto, o.fichaNome, formatarQuantidade(o.planejadoMilesimos, o.unidade), textoDoParaDia(o.dataPlanejada, d.hoje), o.planejadaPorNome ? `planejado por ${o.planejadaPorNome}` : null].filter(Boolean).join(' · ')}
        acao={
          podeConcluir ? (
            !mexe ? (
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <button type="button" disabled aria-describedby="concluir-com-outro" className={classeDeBotao('secundario')}>
                  Concluir o lote
                </button>
                <span id="concluir-com-outro" className="text-[12px] text-suave">
                  Está com {comOutro!.nome}: só ele ou a gerência conclui
                </span>
              </div>
            ) : entregues ? (
              <Link href={`${aqui}/concluir`} className={classeDeBotao('primario')}>
                Concluir o lote
              </Link>
            ) : (
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <button type="button" disabled aria-describedby="concluir-falta" className={classeDeBotao('secundario')}>
                  Concluir o lote
                </button>
                <span id="concluir-falta" className="text-[12px] text-suave">
                  Falta entregar os insumos{d.requisicao ? ` (requisição ${numeroDaRequisicao(d.requisicao.numero)})` : ''}
                </span>
              </div>
            )
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeloDoLote status={o.status} estornado={o.estornado} />
          <SeloDoAtraso dias={d.atrasoDias} />
          {o.status === 'CONCLUIDA' && o.produzidoMilesimos === 0 && <Selo tom="erro">Lote perdido</Selo>}
          {pend && d.responsavel && <span className="text-[13px] font-semibold text-texto">{d.responsavel.comigo ? `Com você desde ${horaDoDia(d.responsavel.desde, d.hoje)}` : fraseDeQuemPegou(d.responsavel.nome, d.responsavel.desde, d.hoje)}</span>}
          {pend && !d.responsavel && o.status === 'EM_EXECUCAO' && <span className="text-[13px] text-suave">Em produção, sem ninguém</span>}
        </div>
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}
      {o.status === 'CANCELADA' && (
        <Aviso tom="neutro" titulo={`${o.estornado ? 'Estornado' : 'Cancelado'} por ${o.canceladaPorNome ?? '—'}${o.canceladaEm ? ` em ${quandoLongo(o.canceladaEm)}` : ''}.`}>
          {o.motivoCancelamento}
        </Aviso>
      )}
      {!d.aberto && pend && <Aviso tom="alerta" titulo="O estoque desta loja não está aberto.">Sem ele, os insumos não saem nem o lote entra.</Aviso>}
      {o.observacao && (
        <p className="rounded-[10px] border border-linha px-3.5 py-2.5 text-sm text-texto">
          <span className="text-suave">Observação: </span>
          {o.observacao}
        </p>
      )}

      {d.requisicao && (
        <Painel titulo="Os insumos" subtitulo={`Saem do estoque pela requisição ${numeroDaRequisicao(d.requisicao.numero)}, que o estoque entrega`} acessorio={<SeloDaRequisicao status={d.requisicao.status} />} semRespiro>
          <ul className="divide-y divide-linha md:hidden">
            {d.itensDoLote.map((i) => (
              <li key={i.insumoId} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-texto">{i.nome}</span>
                  <span className="shrink-0 tabular-nums text-texto">{formatarQuantidade(i.pedidoMilesimos, i.unidade)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-[12px] tabular-nums">
                  <div>
                    <dt className="text-suave">Saiu</dt>
                    <dd className="font-semibold text-texto">{formatarQuantidade(i.saiuMilesimos, i.unidade)}</dd>
                  </div>
                  <div>
                    <dt className="text-suave">Falta</dt>
                    <dd className={`font-semibold ${i.faltaMilesimos > 0 ? 'text-atencao' : 'text-texto'}`}>{i.faltaMilesimos ? formatarQuantidade(i.faltaMilesimos, i.unidade) : '—'}</dd>
                  </div>
                  {c && (
                    <div>
                      <dt className="text-suave">Custo</dt>
                      <dd className="font-semibold text-texto">{custoDoItem(i)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Insumos do lote: pedido, o que saiu do estoque, o que falta e, para quem vê custos, o custo.</caption>
            <thead>
              <tr className="bg-forte text-left text-[12px] text-suave">
                <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                  Insumo
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Pedido
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Saiu
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Falta
                </th>
                {c && (
                  <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                    Custo
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {d.itensDoLote.map((i) => (
                <tr key={i.insumoId} className="h-11 border-t border-linha">
                  <td className="py-2.5 pl-5 pr-3 font-medium text-texto">{i.nome}</td>
                  <td className="px-3 py-2.5 text-right">{formatarQuantidade(i.pedidoMilesimos, i.unidade)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatarQuantidade(i.saiuMilesimos, i.unidade)}</td>
                  <td className={`px-3 py-2.5 text-right ${i.faltaMilesimos > 0 ? 'text-atencao' : 'text-suave'}`}>{i.faltaMilesimos ? formatarQuantidade(i.faltaMilesimos, i.unidade) : '—'}</td>
                  {c && <td className={`px-3 py-2.5 pr-5 text-right ${i.semPreco ? 'text-atencao' : ''}`}>{custoDoItem(i)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {hrefs.requisicao && (
            <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
              {pend && d.requisicao.status !== 'ATENDIDA' ? 'Quem entrega abre a requisição para dar a baixa. ' : ''}
              <Link href={`${hrefs.requisicao}/${d.requisicao.id}`} className={LINK_DE_TEXTO}>
                Abrir a requisição {numeroDaRequisicao(d.requisicao.numero)}
              </Link>
              {pend ? '. Sobrou insumo? Devolva por lá antes de concluir.' : '.'}
            </p>
          )}
        </Painel>
      )}

      {(o.status === 'CONCLUIDA' || o.estornado) && o.produzidoMilesimos !== null && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Painel titulo="O que saiu" subtitulo={`Concluído por ${o.concluidaPorNome ?? '—'}${o.concluidaEm ? ` em ${quandoLongo(o.concluidaEm)}` : ''}`}>
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Quem fez">{o.feitoPor ?? 'sem quem fez'}</Linha>
              <Linha rotulo="Planejado">
                <span className="tabular-nums">{formatarQuantidade(o.planejadoMilesimos, o.unidade)}</span>
              </Linha>
              <Linha rotulo="Saiu de verdade">
                <span className="font-semibold tabular-nums">{formatarQuantidade(o.produzidoMilesimos, o.unidade)}</span>
              </Linha>
              {d.rendimento && (
                <Linha rotulo="Rendimento">
                  <span className="tabular-nums">
                    {formatarRendimento(d.rendimento.rendimentoBp)}
                    {d.rendimento.diferencaMilesimos > 0 ? ` · faltaram ${formatarQuantidade(d.rendimento.diferencaMilesimos, o.unidade)}` : d.rendimento.diferencaMilesimos < 0 ? ` · ${formatarQuantidade(-d.rendimento.diferencaMilesimos, o.unidade)} a mais` : ''}
                  </span>
                </Linha>
              )}
              {o.motivoRendimento && <Linha rotulo="Motivo da diferença">{o.motivoRendimento}</Linha>}
              {o.conservacao && o.validadeEm && o.validadeMin && (
                <Linha rotulo="Validade">
                  <span className="tabular-nums">
                    {CONSERVACOES[o.conservacao]} · {formatarValidade(o.validadeMin)} · vence {quandoVence(o.validadeEm)}
                  </span>
                </Linha>
              )}
              {!o.conservacao && o.produzidoMilesimos > 0 && <Linha rotulo="Validade">Não informada (a ficha não dizia)</Linha>}
            </dl>
          </Painel>

          {c && (
            <Painel titulo="Custo do lote" subtitulo="O que saiu do estoque pelos insumos, dividido pelo que saiu de verdade">
              {semPreco.length > 0 ? (
                <p className="text-[15px] text-texto">
                  <span className="font-semibold">Custo incompleto</span> · {formatarDinheiro(c.totalCentavos)} <span className="text-suave">({fraseSemPreco(semPreco)}, que saiu sem preço)</span>
                </p>
              ) : c.porUnidade && o.produzidoMilesimos ? (
                <>
                  <p className="text-[22px] font-semibold tabular-nums text-texto">
                    {formatarFracao(c.porUnidade)}/{u.sigla}
                  </p>
                  <p className="mt-0.5 text-[13px] tabular-nums text-suave">
                    {formatarDinheiro(c.totalCentavos)} ÷ {formatarQuantidade(o.produzidoMilesimos, o.unidade)}
                  </p>
                </>
              ) : (
                <p className="text-[15px] text-texto">
                  <span className="font-semibold">{formatarDinheiro(c.totalCentavos)}</span> <span className="text-suave">saíram do estoque e nada saiu do lote.</span>
                </p>
              )}
              <dl className="mt-3 space-y-2 border-t border-linha pt-3 text-sm">
                {c.previstoPorUnidade && (
                  <Linha rotulo="A ficha prevê hoje">
                    <span className="tabular-nums">
                      {formatarFracao(c.previstoPorUnidade)}/{u.sigla}
                    </span>
                  </Linha>
                )}
                {c.perda && d.rendimento && d.rendimento.diferencaMilesimos !== 0 && (
                  <Linha rotulo={d.rendimento.diferencaMilesimos > 0 ? 'A diferença custou' : 'A mais, valia'}>
                    <span className="tabular-nums">{formatarFracao(d.rendimento.diferencaMilesimos > 0 ? c.perda : { num: -c.perda.num, den: c.perda.den })}</span>
                  </Linha>
                )}
              </dl>
              <p className="mt-3 text-[12px] text-suave">O custo de referência do pré-preparo continua o da ficha: o lote mostra o que custou de verdade, sem mexer nele.</p>
            </Painel>
          )}
        </div>
      )}

      {(entrouNoEstoque || d.saldoNaLoja !== null) && (
        <Painel
          titulo="No estoque"
          subtitulo={d.saldoNaLoja !== null ? `${o.fichaNome} na ${d.loja.nome} agora: ${formatarQuantidade(d.saldoNaLoja, o.unidade)}` : undefined}
          acessorio={
            hrefs.estoque ? (
              <Link href={hrefs.estoque} className={LINK_DE_TEXTO}>
                Ver o estoque
              </Link>
            ) : undefined
          }
          semRespiro={d.movimentos.length > 0}
        >
          {d.movimentos.length === 0 ? <Vazio>{pend ? 'O lote entra no estoque quando for concluído.' : 'Nada entrou no estoque por este lote.'}</Vazio> : <LivroDoEstoque movimentos={[...d.movimentos].reverse()} />}
        </Painel>
      )}

      {(pend ? livre : pode.estornar && !bloqueio && d.aberto && o.status === 'CONCLUIDA') && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {pend && livre && (
            <Painel
              titulo={!d.responsavel ? 'Quem vai fazer' : d.responsavel.comigo ? 'Com você' : `Com ${d.responsavel.nome}`}
              subtitulo={!d.responsavel ? (pode.pegar ? 'Pegar é começar: o lote fica com você, com a hora' : 'Quem pega é a equipe da loja') : d.responsavel.comigo ? 'Soltar devolve o lote para alguém pegar' : mexe ? 'A gerência solta ou passa para outra pessoa' : 'Só quem pegou ou a gerência mexe neste lote'}
            >
              <div className="space-y-4">
                {!d.responsavel && pode.pegar && <FormPegar acao={acoes.pegar} campos={{ lote: o.id, versao: String(o.versao) }} rotulo={`Pegar o lote ${o.codigoLote}`} recarregar={aqui} cozinha={false} variante="secundario" />}
                {pode.gerenciar && o.status === 'EM_EXECUCAO' && <FormPassar acao={acoes.passar} lote={o.id} versao={o.versao} pessoas={pessoas} atual={d.responsavel?.nome ?? null} recarregar={aqui} cozinha={false} />}
                {d.responsavel && mexe && <FormSoltar acao={acoes.soltar} lote={o.id} versao={o.versao} recarregar={aqui} cozinha={false} deOutro={d.responsavel.comigo ? undefined : d.responsavel.nome} />}
                {mexe ? <FormCancelarLote acao={acoes.cancelar} versao={o.versao} recarregar={aqui} /> : <p className="text-[13px] text-suave">Se for para você terminar, peça para a gerência passar o lote para você.</p>}
              </div>
            </Painel>
          )}
          {o.status === 'CONCLUIDA' && (
            <Painel titulo="Estornar" subtitulo="Só quem ajusta o estoque: tira o lote do estoque e deixa o motivo no histórico">
              <FormEstornar acao={acoes.estornar} versao={o.versao} recarregar={aqui} quantoEntrou={quantoEntrou} />
            </Painel>
          )}
        </div>
      )}

      <Painel titulo="Histórico" semRespiro>
        {d.historico.length === 0 ? <Vazio>Sem alterações.</Vazio> : <ListaHistorico linhas={d.historico} compacta doCadastro={`Lote ${o.codigoLote} · ${o.fichaNome}`} titulos={TITULO_NO_HISTORICO_DO_LOTE} />}
      </Painel>
    </div>
  );
}
