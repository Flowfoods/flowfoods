/**
 * Entrada das abas Requisições, Divergências e Contagens (1.8, UX.9): as três
 * são por loja. Uma loja só no acesso = a página leva direto para ela; mais de
 * uma = esta lista, com o que está pendente e atrasado (requisições) ou a
 * situação do estoque (contagens).
 */

import Link from 'next/link';
import type { EstadoDoEstoque } from '@/lib/erp/estoque-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { SeloDoEstado } from '../estoque/situacao';

type Qual = 'requisicoes' | 'divergencias' | 'contagens';

const TITULO: Record<Qual, string> = {
  requisicoes: 'Requisições por loja',
  divergencias: 'Divergências por loja',
  contagens: 'Contagens por loja',
};
const APOIO: Record<Qual, string> = {
  requisicoes: 'o setor pede, o estoque entrega',
  divergencias: 'requisição × contagem',
  contagens: 'período, cobertura e contagem do dia a dia',
};

export function TelaLojasDoEstoque({
  qual,
  lojas,
  base,
  contexto,
}: {
  qual: Qual;
  /** `estado` só nas contagens: sem o estoque aberto não há período; a loja leva à abertura. */
  lojas: { id: string; nome: string; pendentes?: number; atrasadas?: number; estado?: EstadoDoEstoque }[];
  base: string;
  contexto?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader icone="estoque" cor={COR.estoque} titulo={TITULO[qual]} subtitulo={[contexto, APOIO[qual]].filter(Boolean).join(' · ')} />
      <Painel semRespiro>
        {lojas.length === 0 ? (
          <Vazio>Nenhuma loja no seu acesso.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {lojas.map((l) => (
              <li key={l.id}>
                <Link href={destinoDaLoja(qual, base, l)} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-texto/[0.03] sm:px-5">
                  <span className="font-medium text-texto">{l.nome}</span>
                  {qual === 'requisicoes' && (
                    <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-suave">
                      {l.atrasadas ? <Selo tom="erro">{l.atrasadas} com atraso</Selo> : null}
                      {l.pendentes ? `${l.pendentes} ${l.pendentes === 1 ? 'pendente' : 'pendentes'}` : 'nada pendente'}
                    </span>
                  )}
                  {qual === 'contagens' && l.estado && <SeloDoEstado l={{ estado: l.estado }} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}

/** Contagens: `<loja>/periodo` só existe com o estoque aberto; antes disso a loja leva à abertura. */
function destinoDaLoja(qual: Qual, base: string, l: { id: string; estado?: EstadoDoEstoque }) {
  if (qual === 'contagens') return l.estado === 'ABERTO' ? `${base}/${l.id}/periodo` : `${base}/${l.id}`;
  return `${base}/${l.id}/${qual}`;
}
