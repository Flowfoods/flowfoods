/**
 * Notas recebidas por XML (F.1b) — a fila. A MESMA lista no nível 1 e na pessoa do parceiro: cabeçalho com a contagem e o botão
 * "Importar XML", filtros (na URL) por situação, loja e fornecedor, tabela no desktop e cartões no celular. Só as lojas do alcance.
 * "Aguardando conferência" é a fila de trabalho e vem primeiro; cada linha diz quantos itens já estão ligados a um insumo.
 */

import Link from 'next/link';
import { FileUp } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { LinhaDeDocumento } from '@/lib/erp/documentos-fiscais';
import { formatarData } from '@/lib/erp/compra-campos';
import { DOCUMENTOS_POR_PAGINA, queryDosFiltrosDeDocumento, ROTULO_DA_SITUACAO, temFiltroDeDocumento, type FiltrosDeDocumento } from '@/lib/erp/documento-fiscal-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { CAMPO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { Painel, Selo, Vazio, type Tom } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';

const TOM: Record<string, Tom> = { AGUARDANDO_CONFERENCIA: 'alerta', RECEBIDO: 'alerta', ERRO: 'erro', CONCILIADO: 'ok', CANCELADO: 'neutro' };

export function SeloDoDocumento({ situacao }: { situacao: string }) {
  return <Selo tom={TOM[situacao] ?? 'neutro'}>{ROTULO_DA_SITUACAO[situacao] ?? situacao}</Selo>;
}

export function CabecalhoDosDocumentos({ subtitulo, importarHref, bloqueio, children }: { subtitulo: string; importarHref?: string; bloqueio: string | null; children?: ReactNode }) {
  return (
    <PageHeader
      icone="importar"
      cor={COR.compras}
      titulo="Notas recebidas"
      subtitulo={subtitulo}
      acao={
        importarHref ? (
          <BotaoOuMotivo href={importarHref} bloqueio={bloqueio} variante="primario">
            <FileUp size={16} aria-hidden />
            Importar XML
          </BotaoOuMotivo>
        ) : undefined
      }
    >
      {children}
    </PageHeader>
  );
}

/** "Vila da Penha · 3 aguardando conferência". */
export function subtituloDosDocumentos(contexto: string, f: FiltrosDeDocumento, total: number, naFila: number): string {
  const n = f.situacao === 'fila' ? `${total} aguardando conferência` : `${total} ${total === 1 ? 'nota' : 'notas'}${temFiltroDeDocumento(f) ? (total === 1 ? ' encontrada' : ' encontradas') : ''}`;
  return f.situacao === 'fila' ? `${contexto} · ${n}` : `${contexto} · ${n}${naFila > 0 ? ` · ${naFila} na fila` : ''}`;
}

const SITUACOES = { fila: 'Aguardando conferência', conciliadas: 'Conciliadas', canceladas: 'Canceladas', todas: 'Todas' } as const;

export function FiltrosDosDocumentos({
  base,
  filtros: f,
  lojas,
  fornecedores,
  filtrado = temFiltroDeDocumento(f),
}: {
  base: string;
  filtros: FiltrosDeDocumento;
  filtrado?: boolean;
  lojas: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(13rem,16rem)_repeat(2,minmax(11rem,1fr))_auto]">
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="docs-situacao" className="sr-only">
          Situação
        </label>
        <select id="docs-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(SITUACOES) as (keyof typeof SITUACOES)[]).map((k) => (
            <option key={k} value={k}>
              {SITUACOES[k]}
            </option>
          ))}
        </select>
      </div>
      {lojas.length > 1 && (
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="docs-loja" className="sr-only">
            Loja
          </label>
          <select id="docs-loja" name="loja" defaultValue={f.lojaId} className={SELECT}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="docs-fornecedor" className="sr-only">
          Fornecedor
        </label>
        <select id="docs-fornecedor" name="fornecedor" defaultValue={f.fornecedorId} className={SELECT}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 flex gap-2 lg:col-span-1">
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

const hrefDaPagina = (base: string, f: FiltrosDeDocumento, pagina: number) => {
  const q = queryDosFiltrosDeDocumento(f, pagina);
  return q ? `${base}?${q}` : base;
};

const itensLigados = (l: LinhaDeDocumento) => `${l.vinculados} de ${l.itens} ${l.itens === 1 ? 'item ligado' : 'itens ligados'}`;

function CorpoDaLista({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  importarHref,
  temAlguma,
}: {
  base: string;
  filtros: FiltrosDeDocumento;
  linhas: LinhaDeDocumento[];
  total: number;
  pagina: number;
  paginas: number;
  importarHref?: string;
  /** Há nota recebida em alguma situação? Sem nenhuma, o vazio convida a importar a primeira. */
  temAlguma: boolean;
}) {
  if (linhas.length === 0) {
    const filaVazia = f.situacao === 'fila' && !f.lojaId && !f.fornecedorId;
    return (
      <Painel semRespiro>
        {temAlguma ? (
          <Vazio
            titulo={filaVazia ? 'Nenhuma nota na fila.' : 'Nenhuma nota com esses filtros.'}
            acao={
              filaVazia ? (
                <Link href={`${base}?situacao=todas`} className={classeDeBotao('secundario')}>
                  Ver todas as notas recebidas
                </Link>
              ) : (
                <Link href={base} className={classeDeBotao('secundario')}>
                  Limpar filtros
                </Link>
              )
            }
          >
            {filaVazia ? 'Todas as notas recebidas já foram conferidas.' : 'Os filtros continuam acima, como você deixou.'}
          </Vazio>
        ) : (
          <Vazio
            titulo="Nenhuma nota recebida ainda."
            acao={
              importarHref ? (
                <Link href={importarHref} className={classeDeBotao('primario')}>
                  Importar o primeiro XML
                </Link>
              ) : undefined
            }
          >
            {importarHref
              ? 'Receba o XML da nota fiscal que o fornecedor mandou. O sistema lê os itens e você só escolhe o insumo de cada um; da segunda nota em diante ele já lembra.'
              : 'Quem cuida das compras ainda não recebeu nenhuma nota fiscal nas suas lojas.'}
          </Vazio>
        )}
      </Painel>
    );
  }
  const de = (pagina - 1) * DOCUMENTOS_POR_PAGINA + 1;
  const ate = de + linhas.length - 1;
  return (
    <Painel semRespiro>
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((d) => (
          <li key={d.id}>
            <Link href={`${base}/${d.id}`} className="ff-transicao flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03]">
              <span className="min-w-0">
                <span className="block truncate font-medium text-texto">{d.emitente}</span>
                <span className="block text-[12px] tabular-nums text-suave">
                  {d.rotulo} · emitida em {formatarData(d.emitidaEm)}
                </span>
                <span className="block truncate text-[12px] text-suave">{[d.loja, itensLigados(d)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="shrink-0 space-y-1 text-right text-sm tabular-nums">
                <span className="block font-semibold text-texto">{formatarDinheiro(d.totalCentavos)}</span>
                <SeloDoDocumento situacao={d.situacao} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">Notas fiscais recebidas por XML, {total} no total, da mais nova para a mais velha pela data de emissão.</caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Emissão
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
            <th scope="col" className="hidden h-10 px-3 font-semibold lg:table-cell">
              Itens
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Total
            </th>
            <th scope="col" className="h-10 px-3 pr-5 font-semibold">
              Situação
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((d) => (
            <tr key={d.id} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
              <td className="h-11 whitespace-nowrap py-2 pl-4 pr-3 text-suave sm:pl-5">{formatarData(d.emitidaEm)}</td>
              <td className="px-3 py-2">
                <Link href={`${base}/${d.id}`} className="ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
                  {d.emitente}
                </Link>
                {d.loja && <div className="text-[12px] text-suave md:hidden">{d.loja}</div>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-suave">{d.rotulo.replace('Nota ', '')}</td>
              <td className="hidden px-3 py-2 text-suave md:table-cell">{d.loja ?? 'Escolher a loja'}</td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-suave lg:table-cell">{itensLigados(d)}</td>
              <td className="px-3 py-2 text-right font-semibold text-texto">{formatarDinheiro(d.totalCentavos)}</td>
              <td className="py-2 pl-3 pr-5">
                <SeloDoDocumento situacao={d.situacao} />
              </td>
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
        proxima={de + linhas.length - 1 < total ? hrefDaPagina(base, f, pagina + 1) : null}
      />
    </Painel>
  );
}

/** Explica, uma vez, as duas palavras que a pessoa não precisa saber: o arquivo XML e a chave de acesso. */
export function TelaListaDocumentos(props: ComponentProps<typeof CorpoDaLista>) {
  return (
    <div className="space-y-3">
      <ExplicacaoNoPonto ponto="xml">
        <p className="text-[13px] text-suave">
          Cada nota aqui veio de um arquivo XML: o arquivo da nota fiscal que o fornecedor manda por e-mail (não é o PDF). A chave de acesso é o número de 44 dígitos que identifica a nota; por ele, a mesma nota não entra duas vezes.
        </p>
      </ExplicacaoNoPonto>
      <CorpoDaLista {...props} />
    </div>
  );
}
