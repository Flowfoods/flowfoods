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
  STATUS_DO_FILTRO_DE_CMV,
  valorDoFiltroDoCmv,
  temFiltroDeFicha,
  TIPOS_DE_FICHA,
  type FiltrosDeFicha,
} from '@/lib/erp/ficha-campos';
import { formatarDinheiro, formatarFracao, formatarPontosBase } from '@/lib/erp/unidades';
import { CAMPO, MARCAR } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Miniatura } from './miniatura';
import { CANAIS, ORDEM_DOS_CANAIS } from '@/lib/erp/canal-campos';
import { porcentagemDoCmv, STATUS_DO_CMV, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';

/**
 * N.2: o CMV de um canal na lista — o preço que a pessoa definiu, o CMV a esse preço e o farol EM PALAVRA (nunca só a
 * cor), independente em cada canal. Sem dados diz por quê; canal sem preço definido não ganha farol.
 */
function CmvNaLista({ x }: { x: CmvDoCanal }) {
  const st = STATUS_DO_CMV[x.status];
  if (x.status === 'naoOfertado') return <span className="block text-[12px] text-suave">não ofertado</span>;
  const cor = x.status === 'dentro' ? 'text-ok' : x.status === 'acima' ? 'text-atencao' : 'text-suave';
  // 24/10 (referência Nina): sem CMV, a célula diz só o que falta primeiro (custo → meta → preço), em vez de repetir
  // "— / sem dados / sem preço / sem meta" em toda linha. O motivo inteiro continua no title e na ficha.
  if (!x.cmvBp) {
    const falta = !x.fisico.completo ? 'falta custo' : x.metaBp === null && x.precoCentavos === null ? 'sem meta e preço' : x.metaBp === null ? 'sem meta' : 'sem preço';
    return (
      <span className="block" title={x.motivo ?? undefined}>
        <span className="block text-[12px] font-medium text-suave">{st.rotulo}</span>
        <span className="block whitespace-nowrap text-[12px] text-suave">{falta}</span>
      </span>
    );
  }
  return (
    <span className="block" title={x.motivo ?? undefined}>
      <span className="font-semibold text-texto">{porcentagemDoCmv(x.cmvBp)}</span>
      <span className={`block text-[12px] font-medium ${cor}`}>{st.rotulo}</span>
      <span className="block whitespace-nowrap text-[12px] text-suave">{x.precoCentavos !== null ? formatarDinheiro(x.precoCentavos) : 'sem preço'}</span>
      <span className="block whitespace-nowrap text-[12px] text-suave">{x.metaBp !== null ? `meta ${formatarPontosBase(x.metaBp)}` : 'sem meta'}</span>
    </span>
  );
}

/** Celular e tablet: cada canal com o CMV e a palavra do farol ("CMV: Loja 20,0% dentro da meta; iFood sem dados"). */
function cmvEmLinha(contas: readonly CmvDoCanal[]): string {
  const partes = contas.map((x) =>
    x.cmvBp ? `${CANAIS[x.canal].curto} ${porcentagemDoCmv(x.cmvBp)} ${STATUS_DO_CMV[x.status].rotulo}` : `${CANAIS[x.canal].curto} ${STATUS_DO_CMV[x.status].rotulo}`,
  );
  return `CMV: ${partes.join('; ')}`;
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
        <Link href={`${base}/${l.id}/editar`} className={ICONE_DE_ACAO} aria-label={`Editar ${l.nome}`} title="Editar">
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

const ROTULO_DA_SITUACAO = { ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' } as const;

/** Busca e filtros (GET: o estado vai para a URL). */
/** `verCustos` (N.5): quem só opera não vê o filtro de custo (é assunto da precificação). */
export function FiltrosDasFichas({ base, filtros: f, verCustos = true }: { base: string; filtros: FiltrosDeFicha; verCustos?: boolean }) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className={`grid grid-cols-2 gap-2 ${verCustos ? 'lg:grid-cols-4 2xl:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(10.5rem,auto))_auto]' : 'lg:grid-cols-[minmax(18rem,1fr)_repeat(2,minmax(10.5rem,auto))]'}`}>
      <div className={`col-span-2 flex gap-2 ${verCustos ? 'lg:col-span-4 2xl:col-span-1' : 'lg:col-span-1'}`}>
        <label htmlFor="fichas-q" className="sr-only">
          Buscar ficha pelo nome
        </label>
        <input id="fichas-q" name="q" type="search" defaultValue={f.q} placeholder="Buscar pelo nome" className={`${CAMPO} min-w-0 flex-1`} />
        <button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>
          Filtrar
        </button>
        {temFiltroDeFicha(f) && (
          <Link href={base} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>
            Limpar
          </Link>
        )}
      </div>
      <div>
        <label htmlFor="fichas-tipo" className="sr-only">
          Tipo
        </label>
        <select id="fichas-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={SELECT}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_DE_FICHA).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fichas-situacao" className="sr-only">
          Situação
        </label>
        <select id="fichas-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(ROTULO_DA_SITUACAO) as (keyof typeof ROTULO_DA_SITUACAO)[]).map((k) => (
            <option key={k} value={k}>
              {ROTULO_DA_SITUACAO[k]}
            </option>
          ))}
        </select>
      </div>
      {verCustos && (
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="fichas-cmv" className="sr-only">
            CMV por canal
          </label>
          <select id="fichas-cmv" name="cmv" defaultValue={f.cmv ? valorDoFiltroDoCmv(f.cmv) : ''} className={SELECT}>
            <option value="">CMV: todos</option>
            {ORDEM_DOS_CANAIS.map((canal) => (
              <optgroup key={canal} label={CANAIS[canal].rotulo}>
                {STATUS_DO_FILTRO_DE_CMV.map((st) => (
                  <option key={st} value={valorDoFiltroDoCmv({ canal, status: st })}>
                    {CANAIS[canal].curto} · {STATUS_DO_CMV[st].rotulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {verCustos && (
        <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px] lg:col-span-1">
          <input type="checkbox" name="custo" value="incompleto" defaultChecked={f.incompleto} className={MARCAR} />
          <span className="whitespace-nowrap">Só custo incompleto</span>
        </label>
      )}
    </form>
  );
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
            A busca e os filtros continuam acima, como você deixou.
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
          <li key={l.id} className="flex items-center">
            <Link href={hrefDoDetalhe(base, l.id, f)} className="ff-transicao flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3 hover:bg-texto/[0.03]">
              <Miniatura base={base} id={l.id} foto={l.foto} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${l.ativa ? 'text-texto' : 'text-suave'}`}>{l.nome}</span>
                <span className="block truncate text-[12px] text-suave">
                  {TIPOS_DE_FICHA[l.tipo]} · rende {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
                  {!l.ativa && ' · Desativada'}
                </span>
                {/* 1.5 (herança d): validade em linha própria, quebrando em vez de cortar. */}
                {(l.consumoImediato || validadesEmTexto(l.validades)) && <span className="mt-0.5 block text-[12px] leading-snug text-suave">{l.consumoImediato ? 'Consumo imediato' : validadesEmTexto(l.validades)}</span>}
                {precos?.get(l.id) && <span className="mt-0.5 block text-[12px] leading-snug tabular-nums text-suave">{cmvEmLinha(precos.get(l.id)!)}</span>}
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
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">
          Fichas técnicas, {total} no total.{verCustos ? ' Custo = soma dos insumos pelo custo de referência; por porção = custo dividido pelo rendimento.' : ''}
        </caption>
        <thead>
          {precos && (
            <tr className="hidden bg-forte text-[12px] text-suave lg:table-row">
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
            <th scope="col" className="hidden h-10 px-3 font-semibold md:table-cell">
              Rende
            </th>
            <th scope="col" className={`h-10 px-3 text-right font-semibold ${verCustos ? `hidden ${precos ? '' : 'md:table-cell'}` : ''}`}>
              Itens
            </th>
            {verCustos && (
              <>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Custo da receita
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Por porção ou kg
                </th>
              </>
            )}
            {precos &&
              (['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const).map((c) => (
                <th key={c} scope="col" className="hidden h-10 px-3 text-right font-semibold lg:table-cell">
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
                      className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline ${l.ativa ? 'text-texto' : 'text-suave'}`}
                    >
                      {l.nome}
                    </Link>
                    <div className="max-w-[15rem] truncate text-[12px] text-suave lg:max-w-[19rem]">
                      {TIPOS_DE_FICHA[l.tipo]}
                      {l.preparos > 0 ? ` · com ${l.preparos === 1 ? '1 pré-preparo' : `${l.preparos} pré-preparos`}` : ''}
                      {l.descricao ? ` · ${l.descricao}` : ''}
                      <span className={precos ? '' : 'lg:hidden'}>{!l.ativa && ' · Desativada'}</span>
                    </div>
                    {(l.consumoImediato || validadesEmTexto(l.validades)) && <div className="text-[12px] leading-snug text-suave">{l.consumoImediato ? 'Consumo imediato' : validadesEmTexto(l.validades)}</div>}
                    {precos?.get(l.id) && <div className="text-[12px] leading-snug tabular-nums text-suave lg:hidden">{cmvEmLinha(precos.get(l.id)!)}</div>}
                  </div>
                </div>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-suave md:table-cell">
                {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
              </td>
              <td className={`px-3 py-2 text-right text-suave ${verCustos ? `hidden ${precos ? '' : 'md:table-cell'}` : ''}`}>{l.itens}</td>
              {l.custo && (
                <>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
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
                  </td>
                </>
              )}
              {precos &&
                (precos.get(l.id) ? (
                  precos.get(l.id)!.map((x) => (
                    <td key={x.canal} className="hidden px-2.5 py-2 text-right align-top last:pr-5 lg:table-cell">
                      <CmvNaLista x={x} />
                    </td>
                  ))
                ) : (
                  <td colSpan={3} className="hidden px-3 py-2 pr-5 text-right text-[12px] text-suave lg:table-cell">
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
        <ExplicacaoNoPonto ponto="conta" className="hidden border-t border-linha px-5 py-1.5 lg:block">
          <p className="hidden border-t border-linha px-5 py-2.5 text-[12px] text-suave lg:block">
            CMV = custo físico (insumos + embalagens do canal) ÷ o preço que você definiu; a taxa do iFood fica fora. Cada canal tem o seu farol. Sem
            preço definido ou sem meta: sem dados (a sugestão não conta como preço).
          </p>
        </ExplicacaoNoPonto>
      )}
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
