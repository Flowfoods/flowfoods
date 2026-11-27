import Link from 'next/link';
import { CANAIS } from '@/lib/erp/canal-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import type { LojaNoMes } from '@/lib/erp/faturamento';
import { ROTULO_DA_ORIGEM, rotuloDoMes } from '@/lib/erp/faturamento-campos';
import type { CoberturaDoRecorte } from '@/lib/erp/faturamento-cobertura';
import type { FonteDoTotal, OrigemDoTotal } from '@/lib/erp/faturamento-origem';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { comVoltaParaAHome, type VoltaParaAHome } from '@/lib/erp/volta';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import { InstanteDaIntegracao } from '../integracoes/data-da-situacao';

export const ID_ORIGEM_DO_TOTAL = 'origem-do-total';

const ROTULOS: Record<FonteDoTotal, string> = {
  MANUAL: ROTULO_DA_ORIGEM.MANUAL,
  IMPORTACAO: ROTULO_DA_ORIGEM.IMPORTACAO,
  IFOOD_ANALYTICS: 'iFood Analytics',
  SEM_FONTE: 'Sem fonte',
};

export function PainelOrigemDoTotal({ origem, loja, mes, cobertura, base, hrefMes, volta }: {
  origem: OrigemDoTotal | 'indisponivel';
  loja: LojaNoMes;
  mes: string;
  cobertura: CoberturaDoRecorte;
  base: string;
  hrefMes: string;
  volta?: VoltaParaAHome | null;
}) {
  const dias = origem === 'indisponivel' ? [] : origem.dias;
  const fontes = [...new Set(dias.flatMap(dia => dia.parcelas.flatMap(parcela => parcela.fontes)))];
  return (
    <Painel id={ID_ORIGEM_DO_TOTAL} className="scroll-mt-6" titulo="De onde vem o total"
      subtitulo={`${loja.loja.nome} · ${rotuloDoMes(mes)}`}
      acessorio={<Link href={hrefMes} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Fechar origem</Link>}
    >
      {origem === 'indisponivel' ? <p className="text-sm text-suave">A origem está temporariamente indisponível.</p> : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-suave">Fontes</dt>
              <dd>{fontes.length ? fontes.map(fonte => ROTULOS[fonte]).join(', ') : ROTULOS.SEM_FONTE}</dd>
            </div>
            <div>
              <dt className="text-suave">Última atualização comprovada</dt>
              <dd><InstanteDaIntegracao valor={origem.ultimaAtualizacao} vazio="Sem registro" /></dd>
            </div>
            <div>
              <dt className="text-suave">Cobertura</dt>
              <dd>{dias.length} {dias.length === 1 ? 'dia lançado' : 'dias lançados'} · {cobertura.total} {cobertura.total === 1 ? 'lançamento' : 'lançamentos'} · {loja.faltas} {loja.faltas === 1 ? 'falta' : 'faltas'}</dd>
            </div>
          </dl>
          {dias.length > 0 ? (
            <ul className="mt-4 divide-y divide-linha border-t border-linha">
              {dias.map(dia => (
                <li key={dia.data} className="grid gap-x-5 gap-y-1 py-1 sm:grid-cols-[minmax(8rem,auto)_1fr] sm:items-center">
                  <Link href={comVoltaParaAHome(`${base}/${loja.loja.id}/${dia.data}`, volta)}
                    className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center justify-self-start text-sm`}
                    aria-label={`Ver lançamentos de ${formatarData(dia.data)}`}>
                    {formatarData(dia.data)}
                  </Link>
                  <ul className="min-w-0 space-y-1 pb-2 text-sm sm:py-2">
                    {dia.parcelas.map(parcela => (
                      <li key={parcela.canal} className="flex flex-wrap items-baseline gap-x-2">
                        <span>{CANAIS[parcela.canal].rotulo}</span>
                        <span className="font-medium tabular-nums">{formatarDinheiro(parcela.valorCentavos)}</span>
                        <span className="text-suave">{parcela.fontes.map(fonte => ROTULOS[fonte]).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-suave">Nenhum lançamento neste mês.</p>}
        </>
      )}
    </Painel>
  );
}
