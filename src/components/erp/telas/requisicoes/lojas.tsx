/**
 * Entrada do menu (1.8): Requisições e Divergências são por loja. Uma loja
 * só no acesso = a página leva direto para ela; mais de uma = esta lista, com
 * o que está pendente e atrasado (requisições).
 */

import Link from 'next/link';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel, Selo, Vazio } from '../../ui/superficies';

export function TelaLojasDoEstoque({
  qual,
  lojas,
  base,
  contexto,
}: {
  qual: 'requisicoes' | 'divergencias';
  lojas: { id: string; nome: string; pendentes?: number; atrasadas?: number }[];
  base: string;
  contexto?: string;
}) {
  const titulo = qual === 'requisicoes' ? 'Requisições por loja' : 'Divergências por loja';
  return (
    <div className="space-y-6">
      <PageHeader icone="estoque" cor={COR.estoque} titulo={titulo} subtitulo={[contexto, qual === 'requisicoes' ? 'o setor pede, o estoque entrega' : 'requisição × contagem'].filter(Boolean).join(' · ')} />
      <Painel semRespiro>
        {lojas.length === 0 ? (
          <Vazio>Nenhuma loja no seu acesso.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {lojas.map((l) => (
              <li key={l.id}>
                <Link href={`${base}/${l.id}/${qual}`} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-texto/[0.03] sm:px-5">
                  <span className="font-medium text-texto">{l.nome}</span>
                  {qual === 'requisicoes' && (
                    <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-suave">
                      {l.atrasadas ? <Selo tom="erro">{l.atrasadas} com atraso</Selo> : null}
                      {l.pendentes ? `${l.pendentes} ${l.pendentes === 1 ? 'pendente' : 'pendentes'}` : 'nada pendente'}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
