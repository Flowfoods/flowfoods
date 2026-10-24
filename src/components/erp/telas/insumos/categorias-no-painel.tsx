/**
 * F4 — o conteúdo do painel de categorias da lista de insumos. Cada categoria com a situação e quantos insumos tem (o
 * número filtra a lista), e, para quem gere as categorias (`insumos.categorias`), criar, renomear, reordenar, desativar e
 * excluir (só sem uso) — os mesmos formulários e regras da tela de Categorias, voltando para a lista como estava.
 */

import Link from 'next/link';
import type { LinhaDeCategoria } from '@/lib/erp/categorias';
import { queryDosFiltros, type FiltrosDeInsumo } from '@/lib/erp/insumo-campos';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Selo } from '../../ui/superficies';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { fraseDaCategoria } from './executar-categorias';
import { AcoesDaCategoria, ComCamposOcultos, FormNovaCategoria, type AcoesDaLinha } from './form-categorias';

export function CategoriasNoPainel({
  categorias,
  base,
  filtros,
  podeGerir,
  bloqueio,
  feito,
  cat,
  acaoCriar,
  acoesDe,
  hrefClassificar,
}: {
  categorias: LinhaDeCategoria[];
  base: string;
  filtros: FiltrosDeInsumo;
  podeGerir: boolean;
  bloqueio: string | null;
  feito?: string;
  cat?: string;
  acaoCriar: AcaoDeCadastro;
  acoesDe: (id: string) => AcoesDaLinha;
  /** A classificação assistida (fila e sugestões), para quem classifica. */
  hrefClassificar?: string;
}) {
  const naLista = queryDosFiltros({ ...filtros, categoria: filtros.categoria });
  const frase = fraseDaCategoria(feito, categorias.find((c) => c.id === cat)?.nome ?? null);
  const moveis = categorias.filter((c) => !c.sistema);
  const filtrar = (id: string) => `${base}?${queryDosFiltros({ ...filtros, categoria: id, pagina: 1 })}`;
  return (
    <ComCamposOcultos valores={{ naLista }}>
      <div className="space-y-5">
        {frase && <Aviso tom="ok" titulo={frase} />}
        <p className="text-[13px] text-suave">A categoria diz o que o insumo é para o CMV e vale para a rede inteira. O número filtra a lista.</p>
        {podeGerir && <FormNovaCategoria acao={acaoCriar} bloqueio={bloqueio} />}
        <ul className="divide-y divide-linha" aria-label="Categorias de insumo">
          {categorias.map((c) => {
            const i = moveis.findIndex((m) => m.id === c.id);
            return (
              <li key={c.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${c.ativa ? 'text-texto' : 'text-suave'}`}>{c.nome}</span>
                    {!c.ativa && <Selo>Desativada</Selo>}
                  </span>
                  {c.nInsumos > 0 ? (
                    <Link href={filtrar(c.id)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 shrink-0 items-center text-sm tabular-nums sm:min-h-0`} aria-label={`Ver os ${c.nInsumos} insumos de ${c.nome}`}>
                      {c.nInsumos} {c.nInsumos === 1 ? 'insumo' : 'insumos'}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-sm text-suave">nenhum insumo</span>
                  )}
                </div>
                {podeGerir && !bloqueio && <AcoesDaCategoria categoria={c} acoes={acoesDe(c.id)} primeira={i === 0} ultima={i === moveis.length - 1} />}
              </li>
            );
          })}
        </ul>
        {hrefClassificar && (
          <p className="border-t border-linha pt-3 text-[13px] text-suave">
            Sugestões pelo nome e a fila do que falta classificar:{' '}
            <Link href={hrefClassificar} className={LINK_DE_TEXTO}>
              Classificar insumos
            </Link>
            .
          </p>
        )}
      </div>
    </ComCamposOcultos>
  );
}
