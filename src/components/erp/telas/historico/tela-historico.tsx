/**
 * Histórico do parceiro (antes → depois, quem, quando), a MESMA tela para o
 * nível 1 e para a pessoa com "ver o histórico". Só se acrescenta; correção é
 * linha nova.
 */

import type { LinhaDeHistorico } from '@/lib/erp/historico';
import { FiltroEmLinks } from '../../ui/filtros';
import { Painel, Vazio } from '../../ui/superficies';
import { ListaHistorico } from './lista-historico';

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
    <div className="space-y-4">
      <FiltroEmLinks
        rotulo="Filtrar alterações"
        opcoes={FILTROS.map((f) => ({
          href: f.valor ? `${hrefBase}?entidade=${f.valor}` : hrefBase,
          rotulo: f.rotulo,
          ativo: (entidade ?? '') === f.valor,
        }))}
      />
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
            <div className="hidden grid-cols-[112px_150px_minmax(0,1fr)_140px] gap-x-4 border-b border-linha bg-forte px-5 py-2.5 text-[12px] font-semibold text-suave sm:grid">
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
