/**
 * ERP — estrutura do parceiro (N2 → N3): as lojas (onde a operação acontece) e
 * as marcas do grupo. Faturamento, estoque e produção vão se pendurar aqui.
 */

import { exigirParceiro } from '@/lib/erp/contexto';
import { listarEstrutura } from '@/lib/erp/estrutura';
import { Metrica, Painel, Vazio } from '../../ui';
import { FormNome } from './form-nome';

export const dynamic = 'force-dynamic';

const DATA_CURTA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});
const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function Situacao({ ativa }: { ativa: boolean }) {
  return <span className={ativa ? 'text-surface/70' : 'text-surface/35'}>{ativa ? 'Ativa' : 'Inativa'}</span>;
}

/** No celular a coluna Situação some; inativa vira uma marca discreta ao lado do nome. */
function InativaNoCelular({ ativa }: { ativa: boolean }) {
  if (ativa) return null;
  return <span className="ml-2 text-[11px] font-normal text-surface/35 sm:hidden">inativa</span>;
}

export default async function EstruturaPage({ params }: { params: { slug: string } }) {
  const { parceiro, cliente, bloqueio } = await exigirParceiro(params.slug);
  const { lojas, marcas } = await listarEstrutura(cliente);
  const lojasAtivas = lojas.filter((l) => l.ativa).length;
  const marcasAtivas = marcas.filter((m) => m.ativa).length;
  const ultimo = [...lojas, ...marcas].reduce<{
    nome: string;
    criadoEm: Date;
  } | null>((a, x) => (!a || x.criadoEm > a.criadoEm ? x : a), null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Metrica
          rotulo="Lojas"
          valor={lojasAtivas}
          detalhe={lojas.length === lojasAtivas ? 'todas ativas' : `${lojas.length} no total`}
        />
        <Metrica
          rotulo="Marcas"
          valor={marcasAtivas}
          detalhe={marcas.length === marcasAtivas ? 'todas ativas' : `${marcas.length} no total`}
        />
        <Metrica
          rotulo="Último cadastro"
          valor={ultimo ? DATA_CURTA.format(ultimo.criadoEm) : '—'}
          detalhe={ultimo?.nome ?? 'nenhum ainda'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Lojas"
          acessorio={<span className="text-[11px] tabular-nums text-surface/40">{lojas.length}</span>}
          semRespiro
        >
          <div className="border-b border-white/[0.07] px-5 pb-1 pt-4">
            {bloqueio ? (
              <p className="pb-3 text-sm text-surface/55">{bloqueio}</p>
            ) : (
              <FormNome slug={parceiro.slug} tipo="loja" />
            )}
          </div>
          {lojas.length === 0 ? (
            <Vazio titulo="Nenhuma loja ainda.">
              Cada endereço que opera vira uma loja: estoque e faturamento são por loja.
            </Vazio>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-surface/40">
                  <th scope="col" className="px-5 py-2.5 text-left font-semibold">
                    Loja
                  </th>
                  <th scope="col" className="hidden w-24 px-3 py-2.5 text-left font-semibold sm:table-cell">
                    Situação
                  </th>
                  <th scope="col" className="w-28 px-5 py-2.5 text-right font-semibold">
                    Desde
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lojas.map((l) => (
                  <tr key={l.id} className="border-t border-white/[0.06] transition hover:bg-white/[0.025]">
                    <td className="max-w-0 px-5 py-3">
                      <div className="truncate font-medium text-surface">
                        {l.nome}
                        <InativaNoCelular ativa={l.ativa} />
                      </div>
                      <div className="truncate text-[11px] text-surface/40">{l.slug}</div>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <Situacao ativa={l.ativa} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-surface/60">
                      {DATA.format(l.criadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Painel>

        <Painel
          titulo="Marcas"
          acessorio={<span className="text-[11px] tabular-nums text-surface/40">{marcas.length}</span>}
          semRespiro
        >
          <div className="border-b border-white/[0.07] px-5 pb-1 pt-4">
            {bloqueio ? (
              <p className="pb-3 text-sm text-surface/55">{bloqueio}</p>
            ) : (
              <FormNome slug={parceiro.slug} tipo="marca" />
            )}
          </div>
          {marcas.length === 0 ? (
            <Vazio titulo="Nenhuma marca ainda.">Marca do grupo aparece no faturamento por loja × marca × canal.</Vazio>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-surface/40">
                  <th scope="col" className="px-5 py-2.5 text-left font-semibold">
                    Marca
                  </th>
                  <th scope="col" className="hidden w-24 px-3 py-2.5 text-left font-semibold sm:table-cell">
                    Situação
                  </th>
                  <th scope="col" className="w-28 px-5 py-2.5 text-right font-semibold">
                    Desde
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {marcas.map((m) => (
                  <tr key={m.id} className="border-t border-white/[0.06] transition hover:bg-white/[0.025]">
                    <td className="max-w-0 truncate px-5 py-3 font-medium text-surface">
                      {m.nome}
                      <InativaNoCelular ativa={m.ativa} />
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <Situacao ativa={m.ativa} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-surface/60">
                      {DATA.format(m.criadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Painel>
      </div>
    </div>
  );
}
