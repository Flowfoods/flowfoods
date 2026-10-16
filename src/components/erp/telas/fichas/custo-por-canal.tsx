// Scanner avoid-ai-design, SD4d (P2) aceito: "1 un · R$ 0,89" e "a cada R$ 10,00: R$ 2,62" são a linha de apoio da tabela densa (Kairu Corporativo), no padrão "A · B" das telas da 1.1–1.8. (O ignore do scanner não aceita id com minúscula.)
/**
 * "Custo por canal" no detalhe da ficha de PRATO (1.9), o MESMO no nível 1 e
 * na pessoa do parceiro. Tabela densa com os canais nas colunas (Loja ·
 * Delivery · iFood) e as camadas empilhadas nas linhas: insumos da receita
 * (a porção, em cascata), embalagens (cada uma e o total), a taxa do iFood (%
 * do preço) e o custo do canal. No celular, um bloco por canal com as mesmas
 * camadas. Incompleto = selo com a palavra e o porquê; nunca R$ 0,00.
 *
 * A taxa do iFood é sobre o PREÇO, que chega na 1.10: até lá ela aparece como
 * "26,2% do preço" (e quanto fica a cada R$ 10,00), sem preço inventado.
 */

import Link from 'next/link';
import type { CustoPorCanal } from '@/lib/erp/canais';
import { CANAIS, contaDaTaxa, porQueIncompleto, taxaACadaDezReais, type CamadasDoCanal, type CanalVenda } from '@/lib/erp/canal-campos';
import { formatarFracao, formatarPontosBase, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';

type Linha = { insumoId: string; nome: string; unidade: Unidade; porCanal: Partial<Record<CanalVenda, CamadasDoCanal['embalagens'][number]>> };

/** As embalagens dos canais numa lista só (a mesma caixa no delivery e no iFood é uma linha). */
function linhasDasEmbalagens(canais: readonly CamadasDoCanal[]): Linha[] {
  const mapa = new Map<string, Linha>();
  for (const c of canais) {
    for (const e of c.embalagens) {
      const l = mapa.get(e.insumoId) ?? { insumoId: e.insumoId, nome: e.nome, unidade: e.unidade, porCanal: {} };
      l.porCanal[c.canal] = e;
      mapa.set(e.insumoId, l);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const TRACO = <span className="text-suave">—</span>;

function ValorDaEmbalagem({ e }: { e: CamadasDoCanal['embalagens'][number] | undefined }) {
  if (!e) return TRACO;
  return (
    <>
      {e.valor ? <span className="text-texto">{formatarFracao(e.valor)}</span> : <Selo tom="alerta">Sem preço</Selo>}
      <span className="block text-[12px] text-suave">{formatarQuantidade(e.quantidadeMilesimos, e.unidade)}</span>
    </>
  );
}

function Taxa({ c, linkDaTaxa }: { c: CamadasDoCanal; linkDaTaxa?: string }) {
  if (c.taxa.tipo === 'nenhuma') return TRACO;
  if (c.taxa.tipo === 'naoConfigurada') {
    return (
      <>
        <Selo tom="alerta">Não configurada</Selo>
        {linkDaTaxa && (
          <Link href={linkDaTaxa} className={`mt-1 block text-[12px] ${LINK_DE_TEXTO}`}>
            Configurar
          </Link>
        )}
      </>
    );
  }
  return (
    <>
      <span className="text-texto">{formatarPontosBase(c.taxa.totalBp)} do preço</span>
      <span className="block text-[12px] text-suave">a cada R$ 10,00: {taxaACadaDezReais(c.taxa.totalBp)}</span>
    </>
  );
}

function Total({ c }: { c: CamadasDoCanal }) {
  return (
    <>
      <span className={`font-semibold ${c.incompleto ? 'text-atencao' : 'text-texto'}`}>{formatarFracao(c.total ?? c.semTaxa)}</span>
      {c.taxa.tipo === 'sobrePreco' && !c.total && <span className="block text-[12px] font-normal text-suave">+ {formatarPontosBase(c.taxa.totalBp)} do preço</span>}
      {c.incompleto && (
        <span className="mt-1 block">
          <Selo tom="alerta">Incompleto</Selo>
        </span>
      )}
    </>
  );
}

export function CustoPorCanalDaFicha({
  dados,
  className = '',
  linkDasEmbalagens,
  linkDaTaxa,
  podeConfigurarTaxa,
}: {
  dados: CustoPorCanal;
  className?: string;
  /** Editar as embalagens por canal (só quem edita fichas e vê a precificação). */
  linkDasEmbalagens?: string;
  /** "Canais de venda" (quem vê a precificação). */
  linkDaTaxa?: string;
  /** Quem muda preços (a dona): "Configurar" a taxa do iFood. */
  podeConfigurarTaxa: boolean;
}) {
  const canais = dados.canais;
  const linhas = linhasDasEmbalagens(canais);
  const ifood = canais.find((c) => c.canal === 'IFOOD')!;
  const motivos = canais.map((c) => ({ c, por: porQueIncompleto(c) })).filter((x) => x.por);
  const th = 'h-10 px-3 text-right font-semibold';
  const td = 'whitespace-nowrap px-3 py-2.5 text-right align-top';
  return (
    <Painel
      className={className}
      titulo="Custo por canal"
      subtitulo="Uma porção: na loja, só os insumos; no delivery, + embalagens; no iFood, + embalagens + taxa"
      semRespiro
      acessorio={
        linkDasEmbalagens ? (
          <Link href={linkDasEmbalagens} className={`shrink-0 text-[13px] ${LINK_DE_TEXTO}`}>
            Editar embalagens
          </Link>
        ) : undefined
      }
    >
      {/* Desktop e tablet: canais nas colunas, camadas nas linhas (Kairu Corporativo). */}
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">Custo de uma porção em cada canal de venda, camada por camada.</caption>
        <thead>
          <tr className="bg-forte text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 text-left font-semibold">
              Camada
            </th>
            {canais.map((c) => (
              <th key={c.canal} scope="col" className={`${th} last:pr-5`}>
                {CANAIS[c.canal].curto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-5 pr-3 text-left font-medium text-texto">
              Insumos da receita
            </th>
            {canais.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                {formatarFracao(c.daFicha)}
                {c.insumosSemPreco.length > 0 && <span className="block text-[12px] text-atencao">+ sem preço</span>}
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-5 pr-3 text-left font-medium text-texto">
              Embalagens
              {linhas.length === 0 && <span className="block text-[12px] font-normal text-suave">Nenhuma ainda{linkDasEmbalagens ? ': em Editar embalagens' : ''}.</span>}
            </th>
            {canais.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                {c.canal === 'LOJA' ? TRACO : c.embalagens.length ? formatarFracao(c.embalagensTotal) : <span className="text-suave">nenhuma</span>}
              </td>
            ))}
          </tr>
          {linhas.map((l) => (
            <tr key={l.insumoId} className="text-[13px]">
              <th scope="row" className="py-1.5 pl-9 pr-3 text-left font-normal text-suave">
                {l.nome}
              </th>
              {canais.map((c) => (
                <td key={c.canal} className={`whitespace-nowrap px-3 py-1.5 text-right align-top text-suave last:pr-5`}>
                  {c.canal === 'LOJA' ? '' : <ValorDaEmbalagem e={l.porCanal[c.canal]} />}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-5 pr-3 text-left font-medium text-texto">
              Taxa do iFood
              {ifood.taxa.tipo === 'sobrePreco' && <span className="block text-[12px] font-normal text-suave">{contaDaTaxa(ifood.taxa.taxa)}</span>}
            </th>
            {canais.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                <Taxa c={c} linkDaTaxa={podeConfigurarTaxa ? linkDaTaxa : undefined} />
              </td>
            ))}
          </tr>
        </tbody>
        <tfoot className="tabular-nums">
          <tr className="border-t border-linha-forte">
            <th scope="row" className="h-11 pl-5 pr-3 text-left font-semibold">
              Custo do canal
            </th>
            {canais.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                <Total c={c} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Celular: um bloco por canal, as mesmas camadas em linha. */}
      <ol className="divide-y divide-linha sm:hidden">
        {canais.map((c) => (
          <li key={c.canal} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-texto">{CANAIS[c.canal].rotulo}</h3>
              <span className="text-right tabular-nums">
                <Total c={c} />
              </span>
            </div>
            <dl className="mt-1.5 space-y-1 text-[13px] tabular-nums">
              <div className="flex justify-between gap-3">
                <dt className="text-suave">Insumos da receita</dt>
                <dd>{formatarFracao(c.daFicha)}</dd>
              </div>
              {c.canal !== 'LOJA' && (
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Embalagens{c.embalagens.length ? ` (${c.embalagens.map((e) => `${e.nome} ${formatarQuantidade(e.quantidadeMilesimos, e.unidade)}`).join(', ')})` : ''}</dt>
                  <dd className="shrink-0">{c.embalagens.length ? formatarFracao(c.embalagensTotal) : 'nenhuma'}</dd>
                </div>
              )}
              {c.taxa.tipo !== 'nenhuma' && (
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Taxa do iFood</dt>
                  <dd className="text-right">
                    <Taxa c={c} linkDaTaxa={podeConfigurarTaxa ? linkDaTaxa : undefined} />
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ol>

      <div className="space-y-1 border-t border-linha px-4 py-3 text-[12px] text-suave sm:px-5">
        {motivos.map(({ c, por }) => (
          <p key={c.canal} className="text-atencao">
            {CANAIS[c.canal].rotulo}: custo incompleto — {por}.
          </p>
        ))}
        <p>
          Embalagem entra inteira, pelo custo de referência (o último preço pago). A taxa do iFood é sobre o preço de venda, que chega em breve.
          {linkDaTaxa && (
            <>
              {' '}
              <Link href={linkDaTaxa} className={LINK_DE_TEXTO}>
                Ver os canais de venda
              </Link>
            </>
          )}
        </p>
      </div>
    </Painel>
  );
}
