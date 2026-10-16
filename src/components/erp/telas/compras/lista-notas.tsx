// Scanner avoid-ai-design, SD4d (P2) aceito: "Laticínios Rio · Vila da Penha" é a linha de apoio da tabela densa, no padrão "A · B" das listas da 1.1–1.4. (O ignore do scanner não aceita id com minúscula.)
/**
 * Notas de compra (1.5) — lista, a MESMA no nível 1 e na pessoa do parceiro:
 * cabeçalho com a contagem e o total do período, "+ Lançar nota", filtros
 * por loja, fornecedor, período e situação (na URL), tabela densa do kit
 * Corporativo no desktop e cartões no celular. Só as lojas do alcance.
 */

import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LinhaDeNota } from '@/lib/erp/compras';
import { formatarData, NOTAS_POR_PAGINA, numeroDaNota, queryDosFiltrosDeNota, temFiltroDeNota, type FiltrosDeNota } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { CAMPO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { CampoData } from '../../ui/campo-data';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';

export function CabecalhoDasNotas({
  subtitulo,
  novaHref,
  bloqueio,
  children,
}: {
  subtitulo: string;
  /** Só para quem lança nota. */
  novaHref?: string;
  bloqueio: string | null;
  children?: ReactNode;
}) {
  return (
    <PageHeader
      icone="compras"
      cor={COR.compras}
      titulo="Notas de compra"
      subtitulo={subtitulo}
      acao={
        novaHref ? (
          <BotaoOuMotivo href={novaHref} bloqueio={bloqueio} variante="primario">
            <Plus size={16} aria-hidden />
            Lançar nota
          </BotaoOuMotivo>
        ) : undefined
      }
    >
      {children}
    </PageHeader>
  );
}

/** "Vila da Penha · 12 notas · R$ 4.380,20" (com filtro: "encontradas"). */
export function subtituloDasNotas(contexto: string, total: number, somaCentavos: number, filtrado: boolean): string {
  const n = `${total} ${total === 1 ? 'nota' : 'notas'}${filtrado ? (total === 1 ? ' encontrada' : ' encontradas') : ''}`;
  return `${contexto} · ${n}${somaCentavos > 0 ? ` · ${formatarDinheiro(somaCentavos)} lançados` : ''}`;
}

const SITUACOES = { lancadas: 'Lançadas', canceladas: 'Canceladas', todas: 'Todas' } as const;

/** Busca por filtros (GET: o estado vai para a URL). */
export function FiltrosDasNotas({
  base,
  filtros: f,
  lojas,
  fornecedores,
  filtrado = temFiltroDeNota(f),
}: {
  base: string;
  filtros: FiltrosDeNota;
  /** Filtro da PESSOA (a loja da visão do topo não conta: "Limpar" não a tira). */
  filtrado?: boolean;
  lojas: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(2,minmax(11rem,1fr))_repeat(2,minmax(9.5rem,auto))_minmax(9rem,auto)_auto]">
      {lojas.length > 1 && (
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="notas-loja" className="sr-only">
            Loja
          </label>
          <select id="notas-loja" name="loja" defaultValue={f.lojaId} className={SELECT}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* No celular, loja e fornecedor em linha inteira: "Todos os fornecedores" não corta. */}
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="notas-fornecedor" className="sr-only">
          Fornecedor
        </label>
        <select id="notas-fornecedor" name="fornecedor" defaultValue={f.fornecedorId} className={SELECT}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="notas-de" className="mb-1 block text-[12px] text-suave lg:sr-only">
          De
        </label>
        <CampoData id="notas-de" name="de" defaultValue={f.de ? formatarData(f.de) : ''} aria-label="Data da nota a partir de (dd/mm/aaaa)" />
      </div>
      <div>
        <label htmlFor="notas-ate" className="mb-1 block text-[12px] text-suave lg:sr-only">
          Até
        </label>
        <CampoData id="notas-ate" name="ate" defaultValue={f.ate ? formatarData(f.ate) : ''} aria-label="Data da nota até (dd/mm/aaaa)" />
      </div>
      <div>
        <label htmlFor="notas-situacao" className="sr-only">
          Situação
        </label>
        <select id="notas-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(SITUACOES) as (keyof typeof SITUACOES)[]).map((k) => (
            <option key={k} value={k}>
              {SITUACOES[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 self-end">
        <button type="submit" className={classeDeBotao('secundario', 'flex-1 lg:flex-none')}>
          Filtrar
        </button>
        {filtrado && (
          <Link href={base} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>
            Limpar
          </Link>
        )}
      </div>
    </form>
  );
}

const hrefDaPagina = (base: string, f: FiltrosDeNota, pagina: number) => {
  const q = queryDosFiltrosDeNota(f, pagina);
  return q ? `${base}?${q}` : base;
};

/** Detalhe que volta para a lista como estava (`?de=`). */
const hrefDoDetalhe = (base: string, id: string, f: FiltrosDeNota) => {
  const q = queryDosFiltrosDeNota(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
};

export function TelaListaNotas({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  paginas,
  novaHref,
  temFornecedor,
  fornecedoresHref,
  cadastraFornecedor = true,
  filtrado = temFiltroDeNota(f),
}: {
  base: string;
  filtros: FiltrosDeNota;
  filtrado?: boolean;
  linhas: LinhaDeNota[];
  total: number;
  pagina: number;
  paginas: number;
  novaHref?: string;
  /** Sem fornecedor cadastrado, o primeiro passo é cadastrar um. */
  temFornecedor: boolean;
  fornecedoresHref: string;
  /** Pode cadastrar fornecedor? Sem isso, a frase manda pedir a quem cuida das compras. */
  cadastraFornecedor?: boolean;
}) {
  if (linhas.length === 0) {
    return (
      <Painel semRespiro>
        {filtrado ? (
          <Vazio
            titulo="Nenhuma nota com esses filtros."
            acao={
              <Link href={base} className={classeDeBotao('secundario')}>
                Limpar filtros
              </Link>
            }
          >
            Os filtros continuam acima, como você deixou.
          </Vazio>
        ) : (
          <Vazio
            titulo="Nenhuma nota lançada ainda."
            acao={
              novaHref && (temFornecedor || cadastraFornecedor) ? (
                <Link href={temFornecedor ? novaHref : `${fornecedoresHref}/novo`} className={classeDeBotao('primario')}>
                  {temFornecedor ? 'Lançar a primeira nota' : 'Cadastrar o primeiro fornecedor'}
                </Link>
              ) : undefined
            }
          >
            {novaHref
              ? temFornecedor
                ? 'Com a nota lançada, o custo dos insumos passa a ser o último preço pago, e as fichas acompanham.'
                : cadastraFornecedor
                  ? 'Para lançar nota, cadastre antes quem vende: nome, CNPJ (se tiver) e contato.'
                  : 'Para lançar nota, falta o fornecedor: peça a quem cuida das compras para cadastrar quem vende.'
              : 'Quem cuida das compras ainda não lançou nenhuma nota nas suas lojas.'}
          </Vazio>
        )}
      </Painel>
    );
  }

  const de = (pagina - 1) * NOTAS_POR_PAGINA + 1;
  const ate = de + linhas.length - 1;

  return (
    <Painel semRespiro>
      {/* Celular: cartões que abrem o detalhe. */}
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((n) => (
          <li key={n.id}>
            <Link href={hrefDoDetalhe(base, n.id, f)} className="ff-transicao flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03]">
              <span className="min-w-0">
                <span className={`block truncate font-medium ${n.cancelada ? 'text-suave line-through' : 'text-texto'}`}>{n.fornecedor}</span>
                <span className="block text-[12px] tabular-nums text-suave">
                  Nota {numeroDaNota(n)} · {formatarData(n.entradaEm)}
                </span>
                <span className="block truncate text-[12px] text-suave">
                  {n.loja} · {n.itens} {n.itens === 1 ? 'item' : 'itens'}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {n.cancelada ? <Selo>Cancelada</Selo> : <span className="font-semibold text-texto">{formatarDinheiro(n.totalCentavos)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">Notas de compra, {total} no total, da mais nova para a mais velha pela data da nota.</caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Data
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              Fornecedor
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              Nota
            </th>
            <th scope="col" className="hidden h-10 px-3 font-semibold md:table-cell">
              Loja
            </th>
            <th scope="col" className="hidden h-10 px-3 text-right font-semibold lg:table-cell">
              Itens
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Total
            </th>
            <th scope="col" className="hidden h-10 px-3 pr-5 font-semibold lg:table-cell">
              Situação
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((n) => (
            <tr key={n.id} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
              <td className="h-11 whitespace-nowrap py-2 pl-4 pr-3 text-suave sm:pl-5">{formatarData(n.entradaEm)}</td>
              <td className="px-3 py-2">
                <Link
                  href={hrefDoDetalhe(base, n.id, f)}
                  className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline ${n.cancelada ? 'text-suave' : 'text-texto'}`}
                >
                  {n.fornecedor}
                </Link>
                <div className="text-[12px] text-suave md:hidden">{n.loja}</div>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-suave">
                Nota {numeroDaNota(n)}
              </td>
              <td className="hidden px-3 py-2 text-suave md:table-cell">{n.loja}</td>
              <td className="hidden px-3 py-2 text-right text-suave lg:table-cell">{n.itens}</td>
              <td className="px-3 py-2 text-right">
                <span className={n.cancelada ? 'text-suave line-through' : 'font-semibold text-texto'}>{formatarDinheiro(n.totalCentavos)}</span>
                {n.freteCentavos > 0 && <div className="text-[12px] text-suave">com {formatarDinheiro(n.freteCentavos)} de frete</div>}
              </td>
              <td className="hidden py-2 pl-3 pr-5 lg:table-cell">{n.cancelada ? <Selo>Cancelada</Selo> : <Selo tom="ok">Lançada</Selo>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Paginacao
        de={de}
        ate={ate}
        total={total}
        singular="nota"
        plural="notas"
        anterior={pagina > 1 ? hrefDaPagina(base, f, pagina - 1) : null}
        proxima={pagina < paginas ? hrefDaPagina(base, f, pagina + 1) : null}
      />
    </Painel>
  );
}
