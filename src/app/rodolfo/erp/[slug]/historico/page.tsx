/**
 * ERP — histórico do parceiro: toda alteração com antes/depois (princípio
 * "alterações visíveis"). Só se acrescenta; correção é linha nova.
 */

import Link from 'next/link';
import { exigirParceiro } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { ListaHistorico } from '../../historico-lista';
import { Painel, Vazio } from '../../ui';

export const dynamic = 'force-dynamic';

const FILTROS = [
  { valor: '', rotulo: 'Tudo' },
  { valor: 'ParceiroFlow', rotulo: 'Parceiro' },
  { valor: 'Loja', rotulo: 'Lojas' },
  { valor: 'Marca', rotulo: 'Marcas' },
  { valor: 'Insumo', rotulo: 'Insumos' },
  { valor: 'AcessoParceiro', rotulo: 'Acessos' },
];
const LIMITE = 100;

export default async function HistoricoPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { entidade?: string };
}) {
  const { parceiro, cliente } = await exigirParceiro(params.slug);
  const entidade = FILTROS.some((f) => f.valor && f.valor === searchParams.entidade)
    ? searchParams.entidade
    : undefined;
  const linhas = await listarHistorico(cliente, { entidade, limite: LIMITE });

  return (
    <div className="space-y-3">
      <nav
        aria-label="Filtrar alterações"
        className="flex max-w-full gap-1 overflow-x-auto rounded-[9px] border border-white/[0.09] bg-[#131211] p-1 sm:w-max"
      >
        {FILTROS.map((f) => {
          const ativo = (entidade ?? '') === f.valor;
          return (
            <Link
              key={f.rotulo}
              href={
                f.valor
                  ? `/rodolfo/erp/${parceiro.slug}/historico?entidade=${f.valor}`
                  : `/rodolfo/erp/${parceiro.slug}/historico`
              }
              aria-current={ativo ? 'true' : undefined}
              className="whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12px] text-surface/55 transition hover:text-surface aria-[current=true]:bg-white/[0.1] aria-[current=true]:text-surface"
            >
              {f.rotulo}
            </Link>
          );
        })}
      </nav>
      <Painel
        titulo={linhas.length === LIMITE ? `Últimas ${LIMITE} alterações` : `${linhas.length} alterações`}
        semRespiro
      >
        {linhas.length === 0 ? (
          <Vazio titulo="Nada registrado ainda.">
            Criar, renomear, ativar e cadastrar aparecem aqui, com antes e depois.
          </Vazio>
        ) : (
          <>
            <div className="hidden grid-cols-[112px_150px_minmax(0,1fr)_140px] gap-x-4 border-b border-white/[0.07] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/40 sm:grid">
              <span>Quando</span>
              <span>O quê</span>
              <span>Antes → depois</span>
              <span className="text-right">Quem</span>
            </div>
            <ListaHistorico linhas={linhas} />
          </>
        )}
      </Painel>
    </div>
  );
}
