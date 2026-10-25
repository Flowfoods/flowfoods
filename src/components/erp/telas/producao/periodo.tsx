/**
 * O período (e os filtros) do histórico da produção e dos indicadores (3.3). Tudo na URL (GET): voltar funciona e dá para
 * mandar o link filtrado. Em cima, os atalhos Hoje · 7 dias · 30 dias (trilho segmentado); embaixo, de/até e, no histórico,
 * pessoa e ficha, com "Filtrar" e "Limpar" (só com filtro ativo). Celular: duas colunas; a partir de 1024 px, uma linha.
 */

import Link from 'next/link';
import { ATALHOS_DO_PERIODO, type PeriodoDoHistorico } from '@/lib/erp/producao-equipe-campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltroEmLinks } from '../../ui/filtros';

const CAMPO_DO_FILTRO = 'ff-transicao block min-h-11 w-full rounded-[7px] border border-linha-forte bg-campo px-3 text-base text-texto sm:min-h-10 sm:text-sm';

function consulta(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function FiltroDoPeriodo({
  aqui,
  periodo,
  pessoa,
  ficha,
  pessoas,
  fichas,
}: {
  aqui: string;
  periodo: PeriodoDoHistorico;
  /** Só no histórico: a pessoa e a ficha filtradas e as opções (as que aparecem no período). */
  pessoa?: string | null;
  ficha?: string | null;
  pessoas?: readonly { id: string; nome: string }[];
  fichas?: readonly { id: string; nome: string }[];
}) {
  const filtros = pessoas !== undefined;
  const ativo = !!pessoa || !!ficha || periodo.atalho !== '7';
  return (
    <div className="space-y-3">
      <FiltroEmLinks
        rotulo="Período"
        opcoes={ATALHOS_DO_PERIODO.map((a) => ({ href: `${aqui}${consulta({ periodo: a.chave, pessoa, ficha })}`, rotulo: a.rotulo, ativo: periodo.atalho === a.chave }))}
      />
      <form method="get" action={aqui} className={`grid grid-cols-2 items-end gap-3 ${filtros ? 'lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]' : 'sm:grid-cols-[repeat(2,minmax(0,12rem))_auto]'}`}>
        <div className="min-w-0">
          <label htmlFor="periodo-de" className="mb-1 block text-[12px] font-medium text-suave">
            De
          </label>
          <input id="periodo-de" type="date" name="de" defaultValue={periodo.de} className={CAMPO_DO_FILTRO} />
        </div>
        <div className="min-w-0">
          <label htmlFor="periodo-ate" className="mb-1 block text-[12px] font-medium text-suave">
            Até
          </label>
          <input id="periodo-ate" type="date" name="ate" defaultValue={periodo.ate} className={CAMPO_DO_FILTRO} />
        </div>
        {filtros && (
          <>
            <div className="min-w-0">
              <label htmlFor="filtro-pessoa" className="mb-1 block text-[12px] font-medium text-suave">
                Quem fez
              </label>
              <select id="filtro-pessoa" name="pessoa" defaultValue={pessoa ?? ''} className={CAMPO_DO_FILTRO}>
                <option value="">Todas</option>
                {pessoas!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="filtro-ficha" className="mb-1 block text-[12px] font-medium text-suave">
                Pré-preparo
              </label>
              <select id="filtro-ficha" name="ficha" defaultValue={ficha ?? ''} className={CAMPO_DO_FILTRO}>
                <option value="">Todos</option>
                {fichas!.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
          <button type="submit" className={classeDeBotao('secundario', 'min-h-11 sm:min-h-10')}>
            Filtrar
          </button>
          {ativo && (
            <Link href={aqui} className={`${LINK_DE_TEXTO} ff-toque inline-flex min-h-11 items-center`}>
              Limpar
            </Link>
          )}
        </div>
      </form>
      {periodo.aviso && <p className="text-[13px] text-atencao">{periodo.aviso}</p>}
    </div>
  );
}
