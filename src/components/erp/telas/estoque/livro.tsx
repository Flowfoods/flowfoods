/**
 * Livro do estoque (1.6): os movimentos da loja, do mais novo para o mais
 * velho — abertura, compra e estorno, cada um com a quantidade (com sinal) e
 * o saldo de antes e de depois. O estorno aparece como linha própria, nunca
 * como a linha original apagada ou mudada.
 */

import Link from 'next/link';
import type { MovimentoDaTela } from '@/lib/erp/estoque';
import { quantidadeComSinal, ROTULO_DO_MOVIMENTO } from '@/lib/erp/estoque-campos';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Selo, Vazio } from '../../ui/superficies';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');

function Tipo({ m }: { m: MovimentoDaTela }) {
  if (m.estorno) return <Selo tom="alerta">Estorno · {ROTULO_DO_MOVIMENTO[m.tipo].toLowerCase()}</Selo>;
  // 1.8: a baixa pela requisição é saída comum (neutra), não um "ok" verde.
  return <Selo tom={m.tipo === 'ABERTURA' || m.tipo === 'REQUISICAO' ? 'neutro' : 'ok'}>{ROTULO_DO_MOVIMENTO[m.tipo]}</Selo>;
}

function Origem({ m, notasBase, requisicoesBase, producaoBase }: { m: MovimentoDaTela; notasBase?: string; requisicoesBase?: string; producaoBase?: string }) {
  // 1.8: a baixa (e o estorno dela) leva à requisição.
  if (m.requisicaoId && requisicoesBase) {
    return (
      <Link href={`${requisicoesBase}/${m.requisicaoId}`} className={LINK_DE_TEXTO}>
        {m.motivo ?? 'Ver a requisição'}
      </Link>
    );
  }
  // 3.1: o lote que entrou no estoque (e o estorno dele) leva ao lote.
  if (m.ordemProducaoId && producaoBase) {
    return (
      <Link href={`${producaoBase}/${m.ordemProducaoId}`} className={LINK_DE_TEXTO}>
        {m.motivo ?? 'Ver o lote'}
      </Link>
    );
  }
  if (m.notaId && notasBase) {
    return (
      <Link href={`${notasBase}/${m.notaId}`} className={LINK_DE_TEXTO}>
        {m.motivo ?? 'Ver a nota'}
      </Link>
    );
  }
  return <span>{m.motivo ?? '—'}</span>;
}

export function LivroDoEstoque({ movimentos, notasBase, requisicoesBase, producaoBase }: { movimentos: MovimentoDaTela[]; notasBase?: string; requisicoesBase?: string; producaoBase?: string }) {
  if (movimentos.length === 0) return <Vazio>Nenhum movimento ainda.</Vazio>;
  return (
    <>
      <ul className="divide-y divide-linha md:hidden">
        {movimentos.map((m) => (
          <li key={m.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-texto">{m.nome}</span>
                <span className="mt-0.5 block">
                  <Tipo m={m} />
                </span>
              </span>
              <span className={`shrink-0 text-right font-semibold tabular-nums ${m.estorno ? 'text-suave' : 'text-texto'}`}>{quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}</span>
            </div>
            <div className="text-[12px] tabular-nums text-suave">
              {quando(m.ocorridoEm)} · saldo {formatarQuantidade(m.antes, m.unidade)} para {formatarQuantidade(m.depois, m.unidade)}
            </div>
            <div className="text-[12px] text-suave">
              <Origem m={m} notasBase={notasBase} requisicoesBase={requisicoesBase} producaoBase={producaoBase} />
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Movimentos do estoque desta loja, do mais novo para o mais velho.</caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Quando
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              Insumo
            </th>
            <th scope="col" className="h-10 px-3 font-semibold">
              O quê
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Quantidade
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Saldo
            </th>
            <th scope="col" className="hidden h-10 px-3 pr-5 font-semibold lg:table-cell">
              Origem
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {movimentos.map((m) => (
            <tr key={m.id} className="border-t border-linha align-top">
              <td className="whitespace-nowrap py-2.5 pl-5 pr-3 text-suave">{quando(m.ocorridoEm)}</td>
              <td className="px-3 py-2.5">
                <span className="font-medium text-texto">{m.nome}</span>
                <div className="text-[12px] text-suave lg:hidden">
                  <Origem m={m} notasBase={notasBase} requisicoesBase={requisicoesBase} producaoBase={producaoBase} />
                </div>
              </td>
              <td className="px-3 py-2.5">
                <Tipo m={m} />
              </td>
              <td className={`px-3 py-2.5 text-right font-semibold ${m.estorno ? 'text-suave' : ''}`}>
                {quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}
                {m.valorCentavos !== 0 && <div className="text-[12px] font-normal text-suave">{m.valorCentavos < 0 ? `−${formatarDinheiro(-m.valorCentavos)}` : formatarDinheiro(m.valorCentavos)}</div>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-suave">
                {formatarQuantidade(m.antes, m.unidade)} <span aria-hidden>›</span>
                <span className="sr-only"> passa a </span> <span className="font-semibold text-texto">{formatarQuantidade(m.depois, m.unidade)}</span>
              </td>
              <td className="hidden px-3 py-2.5 pr-5 text-[13px] text-suave lg:table-cell">
                <Origem m={m} notasBase={notasBase} requisicoesBase={requisicoesBase} producaoBase={producaoBase} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
