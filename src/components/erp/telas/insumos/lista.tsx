/**
 * Lista de insumos (1.1), a MESMA para o nível 1 e para a pessoa do parceiro.
 * Recebe a página já lida pelo cliente do portão de quem chama: esta tela não
 * escolhe parceiro nenhum. Tabela densa do kit Corporativo (linha 44 px,
 * cabeçalho em `forte`, números tabulares à direita); abaixo de 640 px vira
 * lista de cartões que abrem o detalhe em tela cheia. Filtros, ordem e página
 * moram na URL e o detalhe volta para eles.
 */

import Link from 'next/link';
import type { LinhaDeInsumo } from '@/lib/erp/insumos';
import {
  CONSERVACOES,
  queryDosFiltros,
  temFiltro,
  TIPOS,
  POR_PAGINA,
  type FiltrosDeInsumo,
} from '@/lib/erp/insumo-campos';
import { UNIDADES, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { CAMPO, MARCAR } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Painel, Selo, Vazio } from '../../ui/superficies';

/** Link da lista com estes filtros mudados (página volta à 1 se não for ela que muda). */
function hrefCom(base: string, f: FiltrosDeInsumo, mudar: Partial<FiltrosDeInsumo>): string {
  const q = queryDosFiltros({ ...f, pagina: 1, ...mudar });
  return q ? `${base}?${q}` : base;
}

function hrefDoDetalhe(base: string, id: string, f: FiltrosDeInsumo): string {
  const q = queryDosFiltros(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
}

function Custo({ i }: { i: LinhaDeInsumo }) {
  if (i.custoCentavos === null) return <Selo tom="alerta">Sem preço</Selo>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-texto">{formatarDinheiro(i.custoCentavos)}</span>
      <span className="ml-0.5 text-[12px] text-suave">/{UNIDADES[i.unidade].sigla}</span>
    </span>
  );
}

const ROTULO_DA_SITUACAO = { ativos: 'Ativos', desativados: 'Desativados', todos: 'Todas as situações' } as const;

/** Barra de busca e filtros (GET: o estado vai para a URL). */
export function FiltrosDaLista({ base, filtros: f }: { base: string; filtros: FiltrosDeInsumo }) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(10.5rem,auto))_auto]">
      {f.ordem !== 'nome' && <input type="hidden" name="ordem" value={f.ordem} />}
      {f.direcao !== 'asc' && <input type="hidden" name="dir" value={f.direcao} />}
      <div className="col-span-2 flex gap-2 lg:col-span-1">
        <label htmlFor="insumos-q" className="sr-only">
          Buscar insumo pelo nome
        </label>
        <input
          id="insumos-q"
          name="q"
          type="search"
          defaultValue={f.q}
          placeholder="Buscar pelo nome"
          className={`${CAMPO} min-w-0 flex-1`}
        />
        <button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>
          Filtrar
        </button>
        {temFiltro(f) && (
          <Link href={hrefCom(base, { ...f, q: '', tipo: null, conservacao: null, situacao: 'ativos', semPreco: false }, {})} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>
            Limpar
          </Link>
        )}
      </div>
      <div>
        <label htmlFor="insumos-tipo" className="sr-only">
          Tipo
        </label>
        <select id="insumos-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={SELECT}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="insumos-conservacao" className="sr-only">
          Conservação
        </label>
        <select id="insumos-conservacao" name="conservacao" defaultValue={f.conservacao ?? ''} className={SELECT}>
          <option value="">Toda conservação</option>
          {Object.entries(CONSERVACOES).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="insumos-situacao" className="sr-only">
          Situação
        </label>
        <select id="insumos-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(ROTULO_DA_SITUACAO) as (keyof typeof ROTULO_DA_SITUACAO)[]).map((k) => (
            <option key={k} value={k}>
              {ROTULO_DA_SITUACAO[k]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px]">
        <input type="checkbox" name="preco" value="sem" defaultChecked={f.semPreco} className={MARCAR} />
        <span className="whitespace-nowrap">Só sem preço</span>
      </label>
    </form>
  );
}

function Ordenar({
  base,
  f,
  coluna,
  children,
  alinhar = 'left',
}: {
  base: string;
  f: FiltrosDeInsumo;
  coluna: 'nome' | 'custo';
  children: string;
  alinhar?: 'left' | 'right';
}) {
  const ativa = f.ordem === coluna;
  const proxima = ativa && f.direcao === 'asc' ? 'desc' : 'asc';
  return (
    <th
      scope="col"
      aria-sort={ativa ? (f.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`h-10 px-3 font-semibold first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 ${alinhar === 'right' ? 'text-right' : ''}`}
    >
      <Link
        href={hrefCom(base, f, { ordem: coluna, direcao: proxima })}
        className={`ff-transicao inline-flex min-h-8 items-center gap-1 rounded-[5px] hover:text-texto ${ativa ? 'text-texto' : ''}`}
      >
        {children}
        <span aria-hidden className="text-[11px]">
          {ativa ? (f.direcao === 'asc' ? '▲' : '▼') : ''}
        </span>
        <span className="sr-only">
          {ativa ? `, em ordem ${f.direcao === 'asc' ? 'crescente' : 'decrescente'}. Clique para inverter` : ', clique para ordenar'}
        </span>
      </Link>
    </th>
  );
}

export function TelaListaInsumos({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  paginas,
  novoHref,
}: {
  /** /erp/insumos ou /rodolfo/erp/<slug>/insumos */
  base: string;
  filtros: FiltrosDeInsumo;
  linhas: LinhaDeInsumo[];
  total: number;
  pagina: number;
  paginas: number;
  /** Quem cadastra (e não está bloqueado) vê o atalho no vazio. */
  novoHref?: string;
}) {
  if (total === 0) {
    return (
      <Painel>
        {temFiltro(f) ? (
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
            titulo="Nenhum insumo ainda."
            acao={
              novoHref ? (
                <Link href={novoHref} className={classeDeBotao('primario')}>
                  Cadastrar o primeiro insumo
                </Link>
              ) : undefined
            }
          >
            {novoHref
              ? 'Comece pelo que mais pesa no custo: carne, queijo, pão, embalagem do delivery.'
              : 'Quem cuida dos cadastros ainda não incluiu nenhum.'}
          </Vazio>
        )}
      </Painel>
    );
  }

  const de = (pagina - 1) * POR_PAGINA + 1;
  const ate = de + linhas.length - 1;

  return (
    <Painel semRespiro>
      {/* Celular: cartões que abrem o detalhe. */}
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((i) => (
          <li key={i.id}>
            <Link
              href={hrefDoDetalhe(base, i.id, f)}
              className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03]"
            >
              <span className="min-w-0">
                <span className={`block truncate font-medium ${i.ativo ? 'text-texto' : 'text-suave'}`}>{i.nome}</span>
                <span className="block truncate text-[12px] text-suave">
                  {TIPOS[i.tipo]} · {formatarQuantidade(i.conteudoMilesimos, i.unidade)}
                  {!i.ativo && ' · Desativado'}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <Custo i={i} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">
          Insumos, {total} no total. Custo por unidade = preço mais frete, dividido pelo que vem na embalagem.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <Ordenar base={base} f={f} coluna="nome">
              Insumo
            </Ordenar>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Embalagem
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Preço e frete
            </th>
            <Ordenar base={base} f={f} coluna="custo" alinhar="right">
              Custo por unidade
            </Ordenar>
            <th scope="col" className="hidden h-10 px-3 text-right font-semibold md:table-cell">
              Outras embalagens
            </th>
            <th scope="col" className="hidden h-10 px-3 pr-5 font-semibold lg:table-cell">
              Situação
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((i) => (
            <tr key={i.id} id={`insumo-${i.id}`} className="ff-alvo ff-transicao border-t border-linha hover:bg-texto/[0.03]">
              <td className="h-11 py-2 pl-4 pr-3 sm:pl-5">
                <Link href={hrefDoDetalhe(base, i.id, f)} className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline ${i.ativo ? 'text-texto' : 'text-suave'}`}>
                  {i.nome}
                </Link>
                <div className="text-[12px] text-suave">
                  {TIPOS[i.tipo]} · {CONSERVACOES[i.conservacao]}
                  <span className="lg:hidden">{!i.ativo && ' · Desativado'}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right text-suave">{formatarQuantidade(i.conteudoMilesimos, i.unidade)}</td>
              <td className="px-3 py-2 text-right">
                <div className="text-texto">{i.precoEmbalagemCentavos > 0 ? formatarDinheiro(i.precoEmbalagemCentavos) : '—'}</div>
                {i.taxaEntregaCentavos > 0 && (
                  <div className="text-[12px] text-suave">+ {formatarDinheiro(i.taxaEntregaCentavos)} frete</div>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <Custo i={i} />
              </td>
              <td className="hidden px-3 py-2 text-right text-suave md:table-cell">{i.variantes > 0 ? i.variantes : '—'}</td>
              <td className="hidden py-2 pl-3 pr-5 lg:table-cell">
                {i.ativo ? <Selo tom="ok">Ativo</Selo> : <Selo>Desativado</Selo>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <nav
        aria-label="Páginas da lista"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5"
      >
        <span className="tabular-nums">
          {de === ate ? `${de}` : `${de}–${ate}`} de {total} {total === 1 ? 'insumo' : 'insumos'}
        </span>
        {paginas > 1 && (
          <span className="flex gap-2">
            {pagina > 1 ? (
              <Link href={hrefCom(base, f, { pagina: pagina - 1 })} className={classeDeBotao('secundario')}>
                Anterior
              </Link>
            ) : (
              <span aria-disabled className={classeDeBotao('secundario', 'pointer-events-none opacity-55')}>
                Anterior
              </span>
            )}
            {pagina < paginas ? (
              <Link href={hrefCom(base, f, { pagina: pagina + 1 })} className={classeDeBotao('secundario')}>
                Próxima
              </Link>
            ) : (
              <span aria-disabled className={classeDeBotao('secundario', 'pointer-events-none opacity-55')}>
                Próxima
              </span>
            )}
          </span>
        )}
      </nav>
    </Painel>
  );
}
