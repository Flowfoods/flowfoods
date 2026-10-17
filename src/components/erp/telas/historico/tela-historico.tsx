/**
 * Histórico do parceiro (antes → depois, quem, quando), a MESMA tela para o
 * nível 1 e para a pessoa com "ver o histórico". Só se acrescenta; correção é
 * linha nova.
 */

import type { LinhaDeHistorico } from '@/lib/erp/historico';
import { FiltroEmLinks } from '../../ui/filtros';
import { Painel, Vazio } from '../../ui/superficies';
import { ListaHistorico } from './lista-historico';

export const FILTROS: { valor: string; rotulo: string; entidades?: string[] }[] = [
  { valor: '', rotulo: 'Tudo' },
  { valor: 'ParceiroFlow', rotulo: 'Parceiro' },
  { valor: 'Loja', rotulo: 'Lojas' },
  { valor: 'Marca', rotulo: 'Marcas' },
  // Insumos e as outras embalagens de compra deles.
  { valor: 'Insumo', rotulo: 'Insumos', entidades: ['Insumo', 'InsumoVariante'] },
  // 1.9: a taxa do iFood (canal de venda) mora com as fichas: é o custo do prato por canal.
  { valor: 'FichaTecnica', rotulo: 'Fichas técnicas', entidades: ['FichaTecnica', 'CanalConfig'] },
  // 1.5: notas de compra e fornecedores.
  { valor: 'NotaEntrada', rotulo: 'Compras', entidades: ['NotaEntrada', 'Fornecedor'] },
  // 3.1: os lotes de produção (o custo deles só para quem tem "ver insumos e custos").
  { valor: 'OrdemProducao', rotulo: 'Produção' },
  // 2.1: faturamento por canal e dia (só para quem tem "ver faturamento").
  { valor: 'FaturamentoLancamento', rotulo: 'Faturamento' },
  // 2.2a: despesas, linhas do plano e a regra do período (só para quem tem "ver DRE").
  { valor: 'Despesa', rotulo: 'DRE e despesas', entidades: ['Despesa', 'DreLinha', 'RegraDoPeriodo', 'DreMeta', 'PeriodoApuracao', 'DreFotografia'] },
  { valor: 'AcessoParceiro', rotulo: 'Acessos' },
  { valor: 'PerfilAcesso', rotulo: 'Perfis' },
];
export const LIMITE_DO_HISTORICO = 100;

/** Entidade do filtro, só se for uma das conhecidas. */
export function entidadeDoFiltro(valor: string | undefined): string | undefined {
  return FILTROS.some((f) => f.valor && f.valor === valor) ? valor : undefined;
}

/** O que o filtro lê do histórico (Insumos inclui as embalagens). */
export function entidadesDoFiltro(valor: string | undefined): string[] | undefined {
  const f = FILTROS.find((x) => x.valor && x.valor === valor);
  return f ? (f.entidades ?? [f.valor]) : undefined;
}

export function TelaHistorico({
  linhas,
  entidade,
  hrefBase,
  verFaturamento = false,
  verDre = false,
}: {
  linhas: LinhaDeHistorico[];
  entidade: string | undefined;
  hrefBase: string;
  /** O filtro "Faturamento" só aparece para quem tem "ver faturamento" (as linhas já vêm filtradas do servidor). */
  verFaturamento?: boolean;
  /** O filtro "DRE e despesas" só aparece para quem tem "ver DRE" (as linhas já vêm filtradas do servidor). */
  verDre?: boolean;
}) {
  const LIMITE = LIMITE_DO_HISTORICO;
  return (
    <div className="space-y-4">
      <FiltroEmLinks
        rotulo="Filtrar alterações"
        opcoes={FILTROS.filter((f) => (verFaturamento || f.valor !== 'FaturamentoLancamento') && (verDre || f.valor !== 'Despesa')).map((f) => ({
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
