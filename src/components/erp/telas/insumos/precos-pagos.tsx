// Scanner avoid-ai-design, SD4d (P2) aceito: "Laticínios Rio · Vila da Penha" é a linha de apoio da lista densa, no padrão "A · B" das telas da 1.1–1.4. (O ignore do scanner não aceita id com minúscula.)
/**
 * Preço pago (1.5): as últimas compras do insumo (a mais nova primeiro, as
 * canceladas riscadas) e o último preço de cada fornecedor, do mais barato ao
 * mais caro — a comparação de preço por fornecedor do Notion Core, a partir
 * do histórico. Custo por unidade = valor + frete rateado ÷ quantidade.
 */

import { HistoricoRecolhivel } from '../historico/historico-recolhivel';
import Link from 'next/link';
import type { InsumoDetalhado } from '@/lib/erp/insumos';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { Painel, Selo } from '../../ui/superficies';

export function PrecosPagos({
  insumo: i,
  linkDaNota,
  historicoHref,
}: {
  insumo: InsumoDetalhado;
  linkDaNota?: (notaId: string, lojaId: string) => string | null;
  /** L.2: o histórico completo deste insumo (período, lojas, preço médio, planilha); só para quem vê compras. */
  historicoHref?: string;
}) {
  if (i.compras.length === 0) {
    return (
      <Painel titulo="Preço pago">
        <p className="text-sm text-suave">
          {i.ultimaCompra
            ? 'As compras deste insumo são de lojas fora do seu acesso a compras: o custo acima vale, as notas ficam com quem cuida delas.'
            : 'Nenhuma nota de compra com este insumo ainda. Lançada a primeira, o custo passa a ser o preço pago.'}
        </p>
      </Painel>
    );
  }
  const varios = i.precoPorFornecedor.length > 1;
  return (
    <HistoricoRecolhivel chave={i.id} quantidade={i.compras.length}
      titulo="Preço pago"
      subtitulo="Últimas compras, com o frete rateado"
      semRespiro
      acessorio={
        historicoHref ? (
          <Link href={historicoHref} className="ff-transicao inline-flex min-h-11 items-center rounded-[5px] text-[13px] font-medium text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto sm:min-h-9">
            Ver o histórico de compras
          </Link>
        ) : undefined
      }
    >
      {varios && (
        <div className="border-b border-linha px-4 py-3 sm:px-5">
          <h3 className="text-[12px] font-semibold text-suave">Último preço de cada fornecedor</h3>
          <ol className="mt-1.5 space-y-1 text-sm">
            {i.precoPorFornecedor.map((c, n) => (
              <li key={c.notaId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {c.fornecedor ?? 'sem fornecedor'}
                  {n === 0 && <span className="ml-2 text-[12px] font-semibold text-ok">mais barato</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatarCusto(c.custo, i.unidade)}</span>
                  <span className="ml-2 text-[12px] text-suave">{formatarData(c.entradaEm, true)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <ul className="divide-y divide-linha">
        {i.compras.map((c) => {
          const href = linkDaNota ? linkDaNota(c.notaId, c.lojaId) : null;
          const conteudo = (
            <>
              <span className="min-w-0">
                <span className={`block truncate font-medium ${c.cancelada ? 'text-suave line-through' : 'text-texto'}`}>
                  {formatarData(c.entradaEm)} · nota {c.rotulo}
                </span>
                <span className="block truncate text-[12px] text-suave">
                  {c.fornecedor ?? 'sem fornecedor'} · {c.lojaNome}
                </span>
                <span className="block text-[12px] tabular-nums text-suave">
                  {formatarQuantidade(c.quantidadeMilesimos, i.unidade)} por {formatarDinheiro(c.valorCentavos)}
                  {c.freteCentavos > 0 && ` + ${formatarDinheiro(c.freteCentavos)} frete`}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">{c.cancelada ? <Selo>Cancelada</Selo> : <span className="font-semibold">{formatarCusto(c.custo, i.unidade)}</span>}</span>
            </>
          );
          return (
            <li key={c.notaId}>
              {href ? (
                <Link href={href} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03] sm:px-5">
                  {conteudo}
                </Link>
              ) : (
                <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 sm:px-5">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </HistoricoRecolhivel>
  );
}
