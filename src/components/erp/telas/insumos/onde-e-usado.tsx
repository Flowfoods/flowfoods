/**
 * "Onde é usado" (reorganização de 24/10/2026): as fichas que levam o insumo e
 * os pratos que o usam como embalagem de um canal, com link para cada ficha.
 * Mostra o alcance de uma mudança no cadastro compartilhado antes de ela
 * acontecer. Sem custo nem preço (a cozinha também lê).
 */

import Link from 'next/link';
import type { OndeEUsado } from '@/lib/erp/onde-e-usado';
import { CANAIS } from '@/lib/erp/canal-campos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { Contagem, Painel, Selo } from '../../ui/superficies';

export function PainelOndeEUsado({ onde, fichasBase }: { onde: OndeEUsado; fichasBase: string }) {
  const { usos, total, cortada, unidade } = onde;
  return (
    <Painel
      id="onde-e-usado"
      titulo="Onde é usado"
      subtitulo={total === 0 ? 'Nenhuma ficha técnica leva este insumo' : 'Mudar este insumo muda estas fichas'}
      acessorio={total > 0 ? <Contagem>{total}</Contagem> : undefined}
      semRespiro={usos.length > 0}
    >
      {usos.length === 0 ? (
        <p className="text-[13px] text-suave">Quando uma ficha usar este insumo na receita ou como embalagem de um canal, ela aparece aqui.</p>
      ) : (
        <>
          <ul className="divide-y divide-linha">
            {usos.map((u) => (
              <li key={u.fichaId}>
                <Link
                  href={`${fichasBase}/${u.fichaId}`}
                  className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03] sm:px-5"
                >
                  <span className="min-w-0">
                    <span className={`flex flex-wrap items-center gap-2 font-medium ${u.ativa ? 'text-texto' : 'text-suave'}`}>
                      <span className="[overflow-wrap:anywhere]">{u.nome}</span>
                      {!u.ativa && <Selo>Desativada</Selo>}
                    </span>
                    <span className="block text-[12px] text-suave">
                      {[
                        u.tipo === 'PRE_PREPARO' ? 'Pré-preparo' : 'Prato',
                        u.naReceitaMilesimos !== null ? `${formatarQuantidade(u.naReceitaMilesimos, unidade)} na receita` : null,
                        u.embalagemEm.length > 0 ? `embalagem: ${u.embalagemEm.map((c) => CANAIS[c].curto).join(', ')}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-suave">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {cortada && (
            <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
              Mostrando {usos.length} de {total} fichas.
            </p>
          )}
        </>
      )}
    </Painel>
  );
}
