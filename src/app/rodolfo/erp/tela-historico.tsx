/**
 * Histórico do parceiro (antes → depois, quem, quando), a MESMA tela para o
 * nível 1 e para a pessoa com "ver o histórico". Só se acrescenta; correção é
 * linha nova.
 */

import Link from 'next/link';
import type { LinhaDeHistorico } from '@/lib/erp/historico';
import { ListaHistorico } from './historico-lista';
import { Painel, Vazio } from './ui';

export const FILTROS = [
  { valor: '', rotulo: 'Tudo' },
  { valor: 'ParceiroFlow', rotulo: 'Parceiro' },
  { valor: 'Loja', rotulo: 'Lojas' },
  { valor: 'Marca', rotulo: 'Marcas' },
  { valor: 'Insumo', rotulo: 'Insumos' },
  { valor: 'AcessoParceiro', rotulo: 'Acessos' },
  { valor: 'PerfilAcesso', rotulo: 'Perfis' },
];
export const LIMITE_DO_HISTORICO = 100;

/** Entidade do filtro, só se for uma das conhecidas. */
export function entidadeDoFiltro(valor: string | undefined): string | undefined {
  return FILTROS.some((f) => f.valor && f.valor === valor) ? valor : undefined;
}

export function TelaHistorico({
  linhas,
  entidade,
  hrefBase,
}: {
  linhas: LinhaDeHistorico[];
  entidade: string | undefined;
  hrefBase: string;
}) {
  const LIMITE = LIMITE_DO_HISTORICO;
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
              href={f.valor ? `${hrefBase}?entidade=${f.valor}` : hrefBase}
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
