// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção" e "R$ 3,20 · R$ 1,60 por porção" seguem o subtítulo do contrato ("Rede Completa · N fichas") como linha de apoio, igual aos insumos da 1.1. (O ignore do scanner não aceita id com minúscula.)
/**
 * Lista de fichas técnicas (1.2), a MESMA para o nível 1 e para a pessoa do
 * parceiro. Recebe a página já lida pelo cliente do portão de quem chama.
 * Tabela densa do kit Corporativo com a foto em miniatura (bate o olho e
 * sabe o que é); abaixo de 640 px vira cartões. Filtros e página na URL.
 * Custo incompleto aparece como selo, nunca como um número baixo.
 */

import Link from 'next/link';
import type { LinhaDeFicha } from '@/lib/erp/fichas';
import {
  custoIncompleto,
  FICHAS_POR_PAGINA,
  formatarRendimento,
  porUnidadeDeRendimento,
  queryDosFiltrosDeFicha,
  temFiltroDeFicha,
  TIPOS_DE_FICHA,
  type FiltrosDeFicha,
} from '@/lib/erp/ficha-campos';
import { formatarFracao } from '@/lib/erp/unidades';
import { CAMPO, MARCAR } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Miniatura } from './miniatura';

function hrefCom(base: string, f: FiltrosDeFicha, mudar: Partial<FiltrosDeFicha>): string {
  const q = queryDosFiltrosDeFicha({ ...f, pagina: 1, ...mudar });
  return q ? `${base}?${q}` : base;
}

function hrefDoDetalhe(base: string, id: string, f: FiltrosDeFicha): string {
  const q = queryDosFiltrosDeFicha(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
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
export function FiltrosDasFichas({ base, filtros: f }: { base: string; filtros: FiltrosDeFicha }) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(18rem,1fr)_repeat(2,minmax(10.5rem,auto))_auto]">
      <div className="col-span-2 flex gap-2 lg:col-span-1">
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
      <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px] lg:col-span-1">
        <input type="checkbox" name="custo" value="incompleto" defaultChecked={f.incompleto} className={MARCAR} />
        <span className="whitespace-nowrap">Só custo incompleto</span>
      </label>
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
}: {
  /** /erp/fichas ou /rodolfo/erp/<slug>/fichas */
  base: string;
  filtros: FiltrosDeFicha;
  linhas: LinhaDeFicha[];
  total: number;
  pagina: number;
  paginas: number;
  /** Quem cria (e não está bloqueado) vê os atalhos no vazio. */
  novaHref?: string;
  importarHref?: string;
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

  const de = (pagina - 1) * FICHAS_POR_PAGINA + 1;
  const ate = de + linhas.length - 1;

  return (
    <Painel semRespiro>
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((l) => (
          <li key={l.id}>
            <Link href={hrefDoDetalhe(base, l.id, f)} className="ff-transicao flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-texto/[0.03]">
              <Miniatura base={base} id={l.id} foto={l.foto} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${l.ativa ? 'text-texto' : 'text-suave'}`}>{l.nome}</span>
                <span className="block truncate text-[12px] text-suave">
                  {TIPOS_DE_FICHA[l.tipo]} · rende {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
                  {!l.ativa && ' · Desativada'}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <CustoPorRende l={l} empilhado />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">
          Fichas técnicas, {total} no total. Custo = soma dos insumos pelo custo de referência; por porção = custo dividido pelo rendimento.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Ficha
            </th>
            <th scope="col" className="hidden h-10 px-3 font-semibold md:table-cell">
              Rende
            </th>
            <th scope="col" className="hidden h-10 px-3 text-right font-semibold md:table-cell">
              Insumos
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Custo da receita
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Por porção ou kg
            </th>
            <th scope="col" className="hidden h-10 px-3 pr-5 font-semibold lg:table-cell">
              Situação
            </th>
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
                    <div className="max-w-[15rem] truncate text-[12px] text-suave lg:max-w-[28rem]">
                      {TIPOS_DE_FICHA[l.tipo]}
                      {l.preparos > 0 ? ` · com ${l.preparos === 1 ? '1 pré-preparo' : `${l.preparos} pré-preparos`}` : ''}
                      {l.descricao ? ` · ${l.descricao}` : ''}
                      <span className="lg:hidden">{!l.ativa && ' · Desativada'}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-suave md:table-cell">
                {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
              </td>
              <td className="hidden px-3 py-2 text-right text-suave md:table-cell">{l.itens}</td>
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
                <CustoPorRende l={l} />
              </td>
              <td className="hidden py-2 pl-3 pr-5 lg:table-cell">
                {l.ativa ? <Selo tom="ok">Ativa</Selo> : <Selo>Desativada</Selo>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
