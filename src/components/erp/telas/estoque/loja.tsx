/**
 * O estoque de UMA loja (1.6), a mesma tela no nível 1 e na pessoa do
 * parceiro. Três estados:
 * - não aberto: o que é a abertura e o "Abrir estoque" (quem ajusta saldo);
 * - contagem em andamento: quanto falta, continuar, conferir e concluir,
 *   descartar;
 * - aberto: saldo por insumo (quantidade, custo de referência, valor), o
 *   total, e o livro do estoque (abertura, compras e estornos, cada um com o
 *   saldo de antes e de depois).
 */

import Link from 'next/link';
import type { EstoqueDaLoja } from '@/lib/erp/estoque';
import { fraseDoQueFalta } from '@/lib/erp/estoque-campos';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, type Conservacao } from '@/lib/erp/validade';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarFracao, formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltroEmLinks } from '../../ui/filtros';
import { Aviso, Barra, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { IconeDaConservacao } from '../cadastro/validade';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from './estado';
import { FormAbrirEstoque, FormDescartarContagem } from './formularios';
import { LivroDoEstoque } from './livro';
import { SeloDoEstado } from './situacao';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');

export interface FiltrosDaTela {
  q: string;
  conservacao: Conservacao | '';
  comSaldo: boolean;
}

export function lerFiltrosDoSaldo(sp: Record<string, string | string[] | undefined>): FiltrosDaTela {
  const um = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const c = um('conservacao');
  return {
    q: um('q').trim().slice(0, 80),
    conservacao: (ORDEM_DAS_CONSERVACOES as readonly string[]).includes(c) ? (c as Conservacao) : '',
    comSaldo: um('saldo') !== 'todos',
  };
}

function hrefDoFiltro(aqui: string, f: FiltrosDaTela, muda: Partial<FiltrosDaTela>): string {
  const g = { ...f, ...muda };
  const p = new URLSearchParams();
  if (g.q) p.set('q', g.q);
  if (g.conservacao) p.set('conservacao', g.conservacao);
  if (!g.comSaldo) p.set('saldo', 'todos');
  const s = p.toString();
  return s ? `${aqui}?${s}` : aqui;
}

export function TelaEstoqueDaLoja({
  e,
  base,
  contexto,
  feito,
  filtros,
  insumosBase,
  notasBase,
  pode,
  acoes,
  bloqueio,
}: {
  e: EstoqueDaLoja;
  base: string;
  contexto?: string;
  feito?: string;
  filtros: FiltrosDaTela;
  /** Link do insumo (quem vê insumos). */
  insumosBase?: string;
  /** Link da nota (quem vê compras nesta loja). */
  notasBase?: string;
  pode: { contar: boolean; ajustar: boolean };
  acoes: { abrir: AcaoDeEstoque; descartar: AcaoDeEstoque };
  bloqueio: string | null;
}) {
  const aqui = `${base}/${e.loja.id}`;
  const a = e.abertura;
  const subtitulo =
    e.estado === 'ABERTO' && a?.fechadaEm
      ? `Aberto em ${quando(a.fechadaEm)}${a.fechadaPorNome ? ` por ${a.fechadaPorNome}` : ''}`
      : e.estado === 'EM_CONTAGEM' && a
        ? `Contagem de abertura começada em ${quando(a.criadoEm)}${a.iniciadaPorNome ? ` por ${a.iniciadaPorNome}` : ''}`
        : 'Estoque ainda não aberto';
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: e.loja.nome }]} />
      <Voltar href={base}>Voltar para o estoque das lojas</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={`Estoque da ${e.loja.nome}`}
        subtitulo={[contexto, subtitulo].filter(Boolean).join(' · ')}
        acao={<SeloDoEstado l={e} />}
      />
      {feito && <Aviso tom="ok" titulo={feito} />}

      {e.estado === 'NAO_ABERTO' && (
        <Painel titulo="Abrir o estoque desta loja" subtitulo="A primeira contagem vira o saldo inicial de cada insumo">
          <div className="max-w-2xl space-y-3 text-sm text-suave">
            <p>
              A lista traz todos os insumos ativos da rede, separados por onde ficam (seco, pista fria, refrigerado, congelado). Quem conta digita o que tem na loja: embalagens fechadas e o solto. Insumo que não tem na loja é zero.
            </p>
            <p>
              Notas lançadas antes de concluir a abertura já estão na contagem e não entram de novo. Depois de concluir, toda nota desta loja entra no estoque na hora.
            </p>
          </div>
          <div className="mt-4">
            {!e.loja.ativa ? (
              <p className="text-sm text-suave">Loja desativada: reative a loja para abrir o estoque.</p>
            ) : pode.ajustar && !bloqueio ? (
              <FormAbrirEstoque acao={acoes.abrir} />
            ) : (
              <p className="text-sm text-suave">{bloqueio ?? 'Quem abre o estoque é quem ajusta saldo (gerente ou dona). Você conta quando a contagem começar.'}</p>
            )}
          </div>
        </Painel>
      )}

      {e.estado === 'EM_CONTAGEM' && e.contagem && (
        <Painel titulo="Contagem de abertura em andamento" subtitulo="Os números ficam salvos; nada vai para o estoque antes de concluir">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-display text-[28px] font-bold leading-none tabular-nums">
                {e.contagem.contados} <span className="text-[18px] font-semibold text-suave">de {e.contagem.total}</span>
              </div>
              <p className="mt-1.5 text-sm text-suave">
                {fraseDoQueFalta(e.contagem)}
                {e.contagem.zerados > 0 && ` · ${e.contagem.zerados} com zero`}
              </p>
              <div className="mt-3 max-w-md">
                <Barra valor={e.contagem.contados} total={e.contagem.total} tom="alerta" rotulo={`${e.contagem.contados} de ${e.contagem.total} contados`} />
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {pode.contar && !bloqueio && (
                <Link href={`${aqui}/abertura`} className={classeDeBotao(pode.ajustar ? 'secundario' : 'primario')}>
                  Continuar a contagem
                </Link>
              )}
              {pode.ajustar && !bloqueio && (
                <Link href={`${aqui}/abertura/conferir`} className={classeDeBotao('primario')}>
                  Conferir e concluir
                </Link>
              )}
            </div>
          </div>
          {pode.ajustar && !bloqueio && (
            <div className="mt-5 border-t border-linha pt-4">
              <FormDescartarContagem acao={acoes.descartar} />
            </div>
          )}
        </Painel>
      )}

      {e.estado === 'ABERTO' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
              <div className="text-[12px] font-medium text-suave">Valor em estoque</div>
              <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{formatarDinheiro(e.total.centavos)}</div>
              <div className="mt-1.5 text-[12px] text-suave">{e.total.pendentes > 0 ? `custo de referência de hoje · ${e.total.pendentes} sem preço fora da soma` : 'pelo custo de referência de hoje'}</div>
            </div>
            <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
              <div className="text-[12px] font-medium text-suave">Insumos com saldo</div>
              <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{e.itensComSaldo}</div>
              <div className="mt-1.5 text-[12px] text-suave">de {e.totalDeItens} acompanhados nesta loja</div>
            </div>
            <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
              <div className="text-[12px] font-medium text-suave">Na abertura</div>
              <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{formatarDinheiro(a?.valorTotalCentavos ?? 0)}</div>
              <div className="mt-1.5 text-[12px] text-suave">
                {a?.fechadaEm ? `valor de ${DATA_HORA.format(a.fechadaEm).slice(0, 10)}, fotografado` : ''}
                {a?.naoContadosNoFechamento ? ` · ${a.naoContadosNoFechamento} entraram com zero` : ''}
              </div>
            </div>
          </div>

          <Painel
            titulo="Saldo por insumo"
            subtitulo="Quantidade = abertura + compras − saídas (as saídas chegam com a requisição, na fase 1.8)"
            semRespiro
          >
            <div className="space-y-3 border-b border-linha px-4 py-3 sm:px-5">
              <form role="search" className="flex w-full max-w-xl gap-2">
                {filtros.conservacao && <input type="hidden" name="conservacao" value={filtros.conservacao} />}
                {!filtros.comSaldo && <input type="hidden" name="saldo" value="todos" />}
                <label htmlFor="saldo-busca" className="sr-only">
                  Buscar insumo no estoque
                </label>
                <input
                  id="saldo-busca"
                  name="q"
                  type="search"
                  defaultValue={filtros.q}
                  placeholder="Buscar insumo"
                  className="ff-transicao block min-h-11 min-w-0 flex-1 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto placeholder:text-suave/70 hover:border-texto/30 sm:min-h-10"
                />
                <button type="submit" className={classeDeBotao('secundario')}>
                  Buscar
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                <FiltroEmLinks
                  rotulo="Onde fica"
                  opcoes={[
                    { href: hrefDoFiltro(aqui, filtros, { conservacao: '' }), rotulo: 'Todos os lugares', ativo: !filtros.conservacao },
                    ...ORDEM_DAS_CONSERVACOES.map((c) => ({ href: hrefDoFiltro(aqui, filtros, { conservacao: c }), rotulo: CONSERVACOES[c], ativo: filtros.conservacao === c })),
                  ]}
                />
                <FiltroEmLinks
                  rotulo="Quais insumos"
                  opcoes={[
                    { href: hrefDoFiltro(aqui, filtros, { comSaldo: true }), rotulo: 'Com saldo', ativo: filtros.comSaldo },
                    { href: hrefDoFiltro(aqui, filtros, { comSaldo: false }), rotulo: 'Todos, com zero', ativo: !filtros.comSaldo },
                  ]}
                />
              </div>
            </div>
            {e.linhas.length === 0 ? (
              <Vazio titulo={filtros.q || filtros.conservacao ? 'Nada com esse filtro.' : 'Nenhum insumo com saldo.'}>
                {filtros.comSaldo ? (
                  <Link href={hrefDoFiltro(aqui, filtros, { comSaldo: false })} className={LINK_DE_TEXTO}>
                    Ver também os que estão com zero
                  </Link>
                ) : (
                  'Mude a busca ou o lugar.'
                )}
              </Vazio>
            ) : (
              <>
                <ul className="divide-y divide-linha md:hidden">
                  {e.linhas.map((l) => (
                    <li key={l.insumoId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <IconeDaConservacao conservacao={l.conservacao} />
                        <span className="min-w-0">
                          <NomeDoInsumo l={l} insumosBase={insumosBase} />
                          <span className="block text-[12px] tabular-nums text-suave">
                            {l.porUnidade ? `${formatarFracao(l.porUnidade)}/${UNIDADES[l.unidade].sigla}` : 'Sem preço'}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className={`block font-semibold ${l.quantidadeMilesimos < 0 ? 'text-erro' : 'text-texto'}`}>{formatarQuantidadeComSinal(l.quantidadeMilesimos, l.unidade)}</span>
                        <span className="block text-[12px] text-suave">{l.valorCentavos === null ? 'valor pendente' : formatarDinheiro(l.valorCentavos)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full text-sm md:table">
                  <caption className="sr-only">Saldo de cada insumo nesta loja, com o valor pelo custo de referência de hoje.</caption>
                  <thead>
                    <tr className="bg-forte text-left text-[12px] text-suave">
                      <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                        Insumo
                      </th>
                      <th scope="col" className="h-10 px-3 font-semibold">
                        Onde fica
                      </th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">
                        Quantidade
                      </th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">
                        Custo de referência
                      </th>
                      <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {e.linhas.map((l) => (
                      <tr key={l.insumoId} className="border-t border-linha">
                        <td className="h-11 py-2 pl-5 pr-3">
                          <NomeDoInsumo l={l} insumosBase={insumosBase} />
                        </td>
                        <td className="px-3 py-2 text-suave">
                          <span className="inline-flex items-center gap-2">
                            <IconeDaConservacao conservacao={l.conservacao} />
                            {CONSERVACOES[l.conservacao]}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${l.quantidadeMilesimos < 0 ? 'text-erro' : ''}`}>{formatarQuantidadeComSinal(l.quantidadeMilesimos, l.unidade)}</td>
                        <td className="px-3 py-2 text-right text-suave">{l.porUnidade ? `${formatarFracao(l.porUnidade)}/${UNIDADES[l.unidade].sigla}` : <Selo tom="alerta">Sem preço</Selo>}</td>
                        <td className="px-3 py-2 pr-5 text-right">{l.valorCentavos === null ? <span className="text-suave">pendente</span> : formatarDinheiro(l.valorCentavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Painel>

          <Painel titulo="Livro do estoque" subtitulo="Só se acrescenta: correção é um lançamento novo (estorno), nunca apagar" semRespiro>
            <LivroDoEstoque movimentos={e.movimentos} notasBase={notasBase} />
          </Painel>
        </>
      )}
    </div>
  );
}

function formatarQuantidadeComSinal(milesimos: number, unidade: keyof typeof UNIDADES): string {
  return milesimos < 0 ? `−${formatarQuantidade(-milesimos, unidade)}` : formatarQuantidade(milesimos, unidade);
}

function NomeDoInsumo({ l, insumosBase }: { l: EstoqueDaLoja['linhas'][number]; insumosBase?: string }) {
  return (
    <span className="block min-w-0 truncate font-medium text-texto">
      {insumosBase ? (
        <Link href={`${insumosBase}/${l.insumoId}`} className="ff-transicao rounded-[5px] underline-offset-4 hover:underline">
          {l.nome}
        </Link>
      ) : (
        l.nome
      )}
      {!l.ativo && <span className="ml-1.5 text-[12px] font-normal text-suave">(desativado)</span>}
    </span>
  );
}
