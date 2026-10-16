/**
 * Tela de Insumos do ERP, a MESMA para o nível 1 (/rodolfo/erp/<slug>/insumos)
 * e para a pessoa do parceiro (/erp/insumos). Recebe a lista já lida pelo
 * cliente do portão de quem chama e o formulário com a action certa: esta
 * tela não escolhe parceiro nenhum. Sem `formulario` (a pessoa não tem
 * "cadastrar e editar insumos"), o cadastro nem aparece — e a action recusa
 * do mesmo jeito. (A 1.1 completa — editar, variantes, filtros — é o Cartão B.)
 */

import type { ReactNode } from 'react';
import type { InsumoLinha } from '@/lib/erp/insumos';
import { UNIDADES, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { Contagem, Painel, Vazio } from '../../ui/superficies';

export function TelaInsumos({
  linhas: insumos,
  bloqueio,
  formulario,
}: {
  /** Insumos já lidos pelo cliente do portão de quem chama. */
  linhas: InsumoLinha[];
  bloqueio: string | null;
  formulario?: ReactNode;
}) {
  return (
    <div className={`grid gap-4 ${formulario ? 'lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]' : ''}`}>
      <Painel
        titulo="Lista de insumos"
        acessorio={<Contagem>{insumos.length}</Contagem>}
        semRespiro
        className="order-2 lg:order-1"
      >
        {insumos.length === 0 ? (
          <Vazio titulo="Nenhum insumo ainda.">
            {formulario ? 'Cadastre o primeiro no formulário.' : 'Quem cuida dos cadastros ainda não incluiu nenhum.'}
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                    Insumo
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Embalagem
                  </th>
                  <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
                    Preço pago
                  </th>
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-right font-semibold sm:px-5">
                    Custo / unid.
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {insumos.map((i) => (
                  <tr
                    key={i.id}
                    id={`insumo-${i.id}`}
                    className="ff-alvo ff-transicao scroll-mt-24 border-t border-linha hover:bg-texto/[0.03]"
                  >
                    <td className="h-11 px-4 py-2.5 sm:px-5">
                      <div className="font-medium text-texto">{i.nome}</div>
                      <div className="text-[12px] text-suave">
                        {UNIDADES[i.unidade].nome}
                        <span className="sm:hidden"> · {formatarDinheiro(i.precoEmbalagemCentavos)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-suave">
                      {formatarQuantidade(i.conteudoMilesimos, i.unidade)}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-suave sm:table-cell">
                      {formatarDinheiro(i.precoEmbalagemCentavos)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right sm:px-5">
                      <span className="font-semibold text-texto">{formatarDinheiro(i.custoUnitarioCentavos)}</span>
                      <span className="ml-1 text-[12px] text-suave">/{UNIDADES[i.unidade].sigla}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      {/* Bloqueado: no celular o card some (o aviso do topo já explica). */}
      {formulario && (
        <Painel
          id="novo-insumo"
          titulo="Novo insumo"
          className={`order-1 scroll-mt-24 self-start lg:order-2 ${bloqueio ? 'hidden lg:block' : ''}`}
        >
          {bloqueio ? <p className="text-sm text-suave">{bloqueio}</p> : formulario}
        </Painel>
      )}
    </div>
  );
}
