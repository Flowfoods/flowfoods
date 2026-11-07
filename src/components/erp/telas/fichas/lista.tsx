// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção" e "R$ 3,20 · R$ 1,60 por porção" seguem o subtítulo do contrato ("Rede Completa · N fichas") como linha de apoio, igual aos insumos da 1.1. (O ignore do scanner não aceita id com minúscula.)
/**
 * Lista de fichas técnicas (1.2), a MESMA para o nível 1 e para a pessoa do
 * parceiro. Recebe a página já lida pelo cliente do portão de quem chama.
 * Tabela densa do kit Corporativo com a foto em miniatura (bate o olho e
 * sabe o que é); abaixo de 640 px vira cartões. Filtros e página na URL.
 * Custo incompleto aparece como selo, nunca como um número baixo.
 */

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { validadesEmTexto } from '@/lib/erp/validade';
import type { LinhaDeFicha } from '@/lib/erp/fichas';
import type { CustoDaFicha } from '@/lib/erp/ficha-campos';

/** N.5: a linha como a tela recebe; `custo` null = visão operacional (o servidor não mandou o número). */
export type LinhaNaTela = Omit<LinhaDeFicha, 'custo'> & { custo: CustoDaFicha | null };

/** N.5: tira os custos da página para quem só opera (o número não sai do servidor). */
export const linhasSemCusto = (linhas: readonly LinhaDeFicha[]): LinhaNaTela[] => linhas.map((l) => ({ ...l, custo: null }));
import {
  custoIncompleto,
  FICHAS_POR_PAGINA,
  formatarRendimento,
  porUnidadeDeRendimento,
  queryDosFiltrosDeFicha,
  temFiltroDeFicha,
  TIPOS_DE_FICHA,
  type FiltrosDeFicha,
  type FiltroDoCmv,
} from '@/lib/erp/ficha-campos';
import { formatarDinheiro, formatarFracao, formatarPontosBase } from '@/lib/erp/unidades';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Miniatura } from './miniatura';
import { CANAIS } from '@/lib/erp/canal-campos';
import { porcentagemDoCmv, STATUS_DO_CMV, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import type { FiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { APRESENTACAO_DA_FAIXA, AVISO_DO_ARREDONDAMENTO, FarolDeCmv } from './farol';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';
import { TextoClassificacao } from './texto-classificacao';

/**
 * N.2: o CMV de um canal na lista — o preço que a pessoa definiu, o CMV a esse preço e o farol EM PALAVRA (nunca só a
 * cor), independente em cada canal. Sem dados diz por quê; canal sem preço definido não ganha farol.
 */
function CmvNaLista({ x }: { x: CmvDoCanal }) {
  return (
    <span className="block min-w-0">
      <FarolDeCmv conta={x} modo="lista" />
      {x.ofertado && <span className="mt-1 block text-[12px] text-suave">{x.precoCentavos !== null ? formatarDinheiro(x.precoCentavos) : 'sem preço'}</span>}
    </span>
  );
}

/** Resumo por canal; só agrupa informações que são iguais em todos os canais. */
function CmvPorCanal({ contas }: { contas: readonly CmvDoCanal[] }) {
  if (!contas.length) return null;
  const primeira = contas[0];
  const faixaComum = contas.length > 1 && contas.every(x => x.farol.faixa === primeira.farol.faixa && !x.farol.motivo)
    && primeira.farol.faixa !== 'semDados' && primeira.farol.faixa !== 'naoOfertado';
  const metaComum = contas.length > 1 && contas.every(x => x.ofertado && x.metaBp === primeira.metaBp && x.status === primeira.status);
  const meta = (x: CmvDoCanal) => x.metaBp === null ? 'Meta não definida' : `Meta: ${formatarPontosBase(x.metaBp)} · ${STATUS_DO_CMV[x.status].rotulo}`;
  return <div className="mt-2 space-y-1.5 text-[12px] leading-snug tabular-nums text-suave">
    <p className="font-medium text-texto">CMV por canal</p>
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 min-[400px]:grid-cols-3">
      {contas.map(x => <div key={x.canal} className="min-w-0">
        <dt className="font-medium text-texto">{CANAIS[x.canal].curto}</dt>
        <dd className="space-y-0.5 break-words">
          {x.cmvBp && x.farol.faixa !== 'semDados' && x.farol.faixa !== 'naoOfertado' && <span className="block font-semibold text-texto">{porcentagemDoCmv(x.cmvBp)}</span>}
          {!faixaComum && <span className="block">{APRESENTACAO_DA_FAIXA[x.farol.faixa].rotulo}</span>}
          {x.farol.motivo && <span className="block">{x.farol.motivo}</span>}
          {!metaComum && x.ofertado && <span className="block">{meta(x)}</span>}
        </dd>
      </div>)}
    </dl>
    {(metaComum || faixaComum) && <div className="space-y-0.5 border-t border-linha pt-1.5">
      {metaComum && <p>{meta(primeira)} · todos os canais</p>}
      {faixaComum && <p>{APRESENTACAO_DA_FAIXA[primeira.farol.faixa].rotulo} · todos os canais</p>}
    </div>}
  </div>;
}

function hrefCom(base: string, f: FiltrosDeFicha, mudar: Partial<FiltrosDeFicha>): string {
  const q = queryDosFiltrosDeFicha({ ...f, pagina: 1, ...mudar });
  return q ? `${base}?${q}` : base;
}

function hrefDoDetalhe(base: string, id: string, f: FiltrosDeFicha): string {
  const q = queryDosFiltrosDeFicha(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
}

/** F4: caneta e lixeira de 44 x 44, com o nome da ficha no rótulo (o leitor de tela diz qual linha é). */
const ICONE_DE_ACAO =
  'ff-transicao inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[7px] border border-linha-forte text-texto hover:border-texto/35 hover:bg-texto/5';

function AcoesDaFicha({ l, base, f, empilhado = false }: { l: { id: string; nome: string; ativa: boolean }; base: string; f: FiltrosDeFicha; empilhado?: boolean }) {
  const q = queryDosFiltrosDeFicha(f);
  const de = q ? `?de=${encodeURIComponent(q)}` : '';
  return (
    <span className={`inline-flex gap-1.5 ${empilhado ? 'flex-col' : ''}`}>
      {l.ativa ? (
        <Link href={`${base}/${l.id}/editar${de}`} className={ICONE_DE_ACAO} aria-label={`Editar ${l.nome}`} title="Editar">
          <Pencil size={16} aria-hidden />
        </Link>
      ) : (
        // Desativada não se edita: reative no detalhe. O espaço fica para as lixeiras alinharem.
        !empilhado && <span aria-hidden className="inline-block h-11 w-11 shrink-0" />
      )}
      <Link href={`${base}/${l.id}/remover${de}`} className={ICONE_DE_ACAO} aria-label={`Remover ${l.nome}`} title="Remover">
        <Trash2 size={16} aria-hidden />
      </Link>
    </span>
  );
}

/** Custo por porção (ou kg); `empilhado` (celular): o "por porção" vai embaixo e o nome ganha espaço. */
function CustoPorRende({ l, empilhado = false }: { l: LinhaDeFicha; empilhado?: boolean }) {
  if (custoIncompleto(l.custo)) return <Selo tom="alerta">{empilhado ? 'Incompleto' : 'Custo incompleto'}</Selo>;
  return (
    <span className={empilhado ? 'block' : 'whitespace-nowrap'}>
      <span className={`font-semibold text-texto ${empilhado ? 'block' : ''}`}>{formatarFracao(l.custo.porRendimento)}</span>
      <span className={`text-[12px] text-suave ${empilhado ? 'block' : 'ml-1'}`}>{porUnidadeDeRendimento(l.unidadeRendimento, l.tipo)}</span>
    </span>
  );
}

export { FiltrosDasFichas } from './filtros';

function Correspondencias({ pares, faixas }: { pares?: readonly FiltroDoCmv[]; faixas?: readonly FiltroDaFaixaDoCmv[] }) {
  if (!pares?.length && !faixas?.length) return null;
  const grupos = [pares?.length ? `Meta: ${pares.map(p => `${CANAIS[p.canal].curto} · ${STATUS_DO_CMV[p.status].rotulo}`).join('; ')}` : '', faixas?.length ? `Faixa: ${faixas.map(p => `${CANAIS[p.canal].curto} · ${APRESENTACAO_DA_FAIXA[p.faixa].rotulo}`).join('; ')}` : ''].filter(Boolean);
  return <span className="block break-words text-[12px] leading-snug text-suave">Corresponde: {grupos.join('; ')}.</span>;
}

export function TelaListaFichas({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  paginas,
  novaHref,
  importarHref,
  cmv: precos,
  correspondenciasCmv,
  correspondenciasFaixasCmv,
  acoes = false,
}: {
  /** /erp/fichas ou /rodolfo/erp/<slug>/fichas */
  base: string;
  filtros: FiltrosDeFicha;
  linhas: LinhaNaTela[];
  total: number;
  pagina: number;
  paginas: number;
  /** Quem cria (e não está bloqueado) vê os atalhos no vazio. */
  novaHref?: string;
  importarHref?: string;
  /** N.2: preço, CMV e farol por canal das fichas de prato (só para quem vê preços; nem sai do servidor para os outros). */
  cmv?: ReadonlyMap<string, CmvDoCanal[]>;
  correspondenciasCmv?: ReadonlyMap<string, FiltroDoCmv[]>;
  correspondenciasFaixasCmv?: ReadonlyMap<string, FiltroDaFaixaDoCmv[]>;
  /** F4: caneta e lixeira na linha (quem edita fichas e não está bloqueado; a página e a action conferem de novo). */
  acoes?: boolean;
}) {
  if (total === 0) {
    return (
      <Painel>
        {temFiltroDeFicha(f) ? (
          <Vazio
            titulo="Nada encontrado com esses filtros."
            acao={
              <Link href={base} className={classeDeBotao('secundario')}>
                Limpar filtros
              </Link>
            }
          >
            {f.tipo === 'PRE_PREPARO' && (f.cmv.length > 0 || f.faixasCmv.length > 0) ? 'Pré-preparos não são vendidos por canal. Retire os filtros de CMV para vê-los.' : 'A busca e os filtros continuam acima, como você deixou.'}
          </Vazio>
        ) : (
          <Vazio
            titulo="Nenhuma ficha técnica ainda."
            acao={
              novaHref ? (
                <span className="flex flex-wrap justify-center gap-2">
                  <Link href={novaHref} className={classeDeBotao('primario')}>
                    Montar a primeira ficha
                  </Link>
                  {importarHref && (
                    <Link href={importarHref} className={classeDeBotao('secundario')}>
                      Importar planilha
                    </Link>
                  )}
                </span>
              ) : undefined
            }
          >
            {novaHref
              ? 'Comece pelos campeões de venda: a receita, a foto e quanto custa cada porção.'
              : 'Quem cuida das receitas ainda não montou nenhuma.'}
          </Vazio>
        )}
      </Painel>
    );
  }

  // N.5: a página inteira vem com ou sem custos (o servidor decide pela permissão).
  const verCustos = linhas.every((l) => l.custo !== null);
  const de = (pagina - 1) * FICHAS_POR_PAGINA + 1;
  const ate = de + linhas.length - 1;

  return (
    <Painel semRespiro>
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((l) => (
          <li key={l.id}>
            <div className="flex items-center">
            <Link href={hrefDoDetalhe(base, l.id, f)} className="ff-transicao flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3 hover:bg-texto/[0.03]">
              <Miniatura base={base} id={l.id} foto={l.foto} />
              <span className="min-w-0 flex-1">
                <span className={`block break-words font-medium [overflow-wrap:anywhere] ${l.ativa ? 'text-texto' : 'text-suave'}`}>{l.nome}</span>
                <span className="block truncate text-[12px] text-suave">
                  {TIPOS_DE_FICHA[l.tipo]} · rende {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
                  {!l.ativa && ' · Desativada'}
                </span>
                {/* 1.5 (herança d): validade em linha própria, quebrando em vez de cortar. */}
                {(l.consumoImediato || validadesEmTexto(l.validades)) && <span className="mt-0.5 block text-[12px] leading-snug text-suave">{l.consumoImediato ? 'Consumo imediato' : validadesEmTexto(l.validades)}</span>}
              </span>
              {l.custo && (
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <CustoPorRende l={{ ...l, custo: l.custo }} empilhado />
                </span>
              )}
            </Link>
            {acoes && (
              <span className="shrink-0 py-2 pr-4">
                <AcoesDaFicha l={l} base={base} f={f} empilhado />
              </span>
            )}
            </div>
            {(l.classificacao.secao || l.classificacao.subsecao || precos?.has(l.id) || correspondenciasCmv?.get(l.id)?.length || correspondenciasFaixasCmv?.get(l.id)?.length) ? <div className="min-w-0 space-y-2 px-4 pb-3">
              <TextoClassificacao classificacao={l.classificacao} />
              <Correspondencias pares={correspondenciasCmv?.get(l.id)} faixas={correspondenciasFaixasCmv?.get(l.id)} />
              {precos?.get(l.id) && <CmvPorCanal contas={precos.get(l.id)!} />}
            </div> : null}
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">
          Fichas técnicas, {total} no total.{verCustos ? ' Custo = soma dos insumos pelo custo de referência; por porção = custo dividido pelo rendimento.' : ''}
        </caption>
        <thead>
          {precos && (
            <tr className="hidden bg-forte text-[12px] text-suave 2xl:table-row">
              <td colSpan={4} />
              <th scope="colgroup" colSpan={3} className="border-b border-linha px-3 pr-5 pt-2 text-center font-semibold">
                CMV ao seu preço
              </th>
              {acoes && <td />}
            </tr>
          )}
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Ficha
            </th>
            <th scope="col" className="hidden h-10 px-3 font-semibold 2xl:table-cell">
              Rende
            </th>
            <th scope="col" className={`h-10 px-3 text-right font-semibold ${verCustos ? `hidden ${precos ? '' : 'md:table-cell'}` : ''}`}>
              Itens
            </th>
            {verCustos && (
              <>
                <th scope="col" className="hidden h-10 px-3 text-right font-semibold 2xl:table-cell">
                  Custo da receita
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Por porção ou kg
                </th>
              </>
            )}
            {precos &&
              (['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const).map((c) => (
                <th key={c} scope="col" className="hidden h-10 px-3 text-right font-semibold 2xl:table-cell">
                  <span className="sr-only">CMV no </span>
                  {CANAIS[c].curto}
                </th>
              ))}
            <th scope="col" className={`hidden h-10 px-3 pr-5 font-semibold ${precos ? '' : 'lg:table-cell'}`}>
              Situação
            </th>
            {acoes && (
              <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.id} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
              <td className="py-2 pl-4 pr-3 sm:pl-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Miniatura base={base} id={l.id} foto={l.foto} />
                  <div className="min-w-0">
                    <Link
                      href={hrefDoDetalhe(base, l.id, f)}
                      className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere] ${l.ativa ? 'text-texto' : 'text-suave'}`}
                    >
                      {l.nome}
                    </Link>
                    <TextoClassificacao classificacao={l.classificacao} />
                    <Correspondencias pares={correspondenciasCmv?.get(l.id)} faixas={correspondenciasFaixasCmv?.get(l.id)} />
                    <div className="max-w-[19rem] break-words text-[12px] text-suave">
                      {TIPOS_DE_FICHA[l.tipo]}
                      <span className="2xl:hidden"> · rende {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}</span>
                      {l.preparos > 0 ? ` · com ${l.preparos === 1 ? '1 pré-preparo' : `${l.preparos} pré-preparos`}` : ''}
                      {l.descricao ? ` · ${l.descricao}` : ''}
                      <span className={precos ? '' : 'lg:hidden'}>{!l.ativa && ' · Desativada'}</span>
                    </div>
                    {(l.consumoImediato || validadesEmTexto(l.validades)) && <div className="text-[12px] leading-snug text-suave">{l.consumoImediato ? 'Consumo imediato' : validadesEmTexto(l.validades)}</div>}
                    {precos?.get(l.id) && <div className="2xl:hidden"><CmvPorCanal contas={precos.get(l.id)!} /></div>}
                  </div>
                </div>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-suave 2xl:table-cell">
                {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
              </td>
              <td className={`px-3 py-2 text-right text-suave ${verCustos ? `hidden ${precos ? '' : 'md:table-cell'}` : ''}`}>{l.itens}</td>
              {l.custo && (
                <>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right 2xl:table-cell">
                    {custoIncompleto(l.custo) ? (
                      <span className="text-suave" title={`Falta preço em: ${l.custo.faltaPreco.join(', ')}`}>
                        {formatarFracao(l.custo.total)} + ?
                      </span>
                    ) : (
                      formatarFracao(l.custo.total)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CustoPorRende l={{ ...l, custo: l.custo }} />
                    <span className="block text-[12px] text-suave 2xl:hidden">Receita: {formatarFracao(l.custo.total)}{custoIncompleto(l.custo) ? ' + ?' : ''}</span>
                  </td>
                </>
              )}
              {precos &&
                (precos.get(l.id) ? (
                  precos.get(l.id)!.map((x) => (
                    <td key={x.canal} className="hidden px-2.5 py-2 text-right align-top last:pr-5 2xl:table-cell">
                      <CmvNaLista x={x} />
                    </td>
                  ))
                ) : (
                  <td colSpan={3} className="hidden px-3 py-2 pr-5 text-right text-[12px] text-suave 2xl:table-cell">
                    não se vende
                  </td>
                ))}
              <td className={`hidden py-2 pl-3 pr-5 ${precos ? '' : 'lg:table-cell'}`}>
                {l.ativa ? <Selo tom="ok">Ativa</Selo> : <Selo>Desativada</Selo>}
              </td>
              {acoes && (
                <td className="whitespace-nowrap py-2 pl-3 pr-5 text-right">
                  <AcoesDaFicha l={l} base={base} f={f} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {precos && (
        <ExplicacaoNoPonto ponto="conta" className="hidden border-t border-linha px-5 py-1.5 2xl:block">
          <p className="hidden border-t border-linha px-5 py-2.5 text-[12px] text-suave 2xl:block">
            CMV = custo físico (insumos + embalagens do canal) ÷ o preço que você definiu; a taxa do iFood fica fora. Cada canal tem o seu farol. Sem
            custo completo ou preço definido: sem dados (a sugestão não conta como preço). Sem meta, a faixa ainda pode ser calculada.
          </p>
        </ExplicacaoNoPonto>
      )}
      {precos && <p className="border-t border-linha px-4 py-2 text-[12px] text-suave sm:px-5">{AVISO_DO_ARREDONDAMENTO}</p>}
      <Paginacao
        de={de}
        ate={ate}
        total={total}
        singular="ficha"
        plural="fichas"
        anterior={pagina > 1 ? hrefCom(base, f, { pagina: pagina - 1 }) : null}
        proxima={pagina < paginas ? hrefCom(base, f, { pagina: pagina + 1 }) : null}
      />
    </Painel>
  );
}
