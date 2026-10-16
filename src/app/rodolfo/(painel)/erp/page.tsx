/**
 * ERP — nível 1 (FlowFoods): os Parceiros Flow, um por linha, e o cadastro de
 * um novo. Os números de cada parceiro só são lidos pelo portão de tenant
 * (cliente somente leitura, com RLS), nunca pelo prisma do portal.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { exigirNivel1, leituraDoParceiro } from '@/lib/erp/contexto';
import { parceirosSemAdministrador } from '@/lib/erp/credenciais';
import { COR } from '@/lib/erp/modulos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Contagem, Metrica, Painel, Ponto, Vazio } from '@/components/erp/ui/superficies';
import { FormParceiro } from './form-parceiro';

export const dynamic = 'force-dynamic';

export default async function ErpPage() {
  await exigirNivel1();
  const [parceiros, semAdmin] = await Promise.all([
    prisma.parceiroFlow.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] }),
    parceirosSemAdministrador(),
  ]);
  const linhas = await Promise.all(
    parceiros.map(async (p) => {
      const c = leituraDoParceiro(p.id);
      const [lojas, marcas, insumos] = await Promise.all([
        c.loja.count({ where: { ativa: true } }),
        c.marca.count({ where: { ativa: true } }),
        c.insumo.count(),
      ]);
      return { p, lojas, marcas, insumos };
    }),
  );
  const porStatus = { ATIVO: 0, RASCUNHO: 0, SUSPENSO: 0 };
  for (const p of parceiros) porStatus[p.status]++;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="parceiros"
        cor={COR.parceiros}
        titulo="Parceiros Flow"
        subtitulo={`Nível 1 · ${parceiros.length} parceiro${parceiros.length === 1 ? '' : 's'} · cada um enxerga só o que é dele`}
      />

      <div className="grid grid-cols-3 gap-3">
        <Metrica rotulo="Ativos" valor={porStatus.ATIVO} />
        <Metrica rotulo="Aguardando liberação" valor={porStatus.RASCUNHO} />
        <Metrica rotulo="Suspensos" valor={porStatus.SUSPENSO} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <Painel
          titulo="Parceiros"
          acessorio={<Contagem>{parceiros.length}</Contagem>}
          semRespiro
          className="self-start"
        >
          {linhas.length === 0 ? (
            <Vazio titulo="Nenhum Parceiro Flow ainda.">Crie o primeiro no formulário ao lado.</Vazio>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                    Parceiro
                  </th>
                  <th scope="col" className="h-10 w-16 px-2 text-right font-semibold">
                    Lojas
                  </th>
                  <th scope="col" className="hidden h-10 w-16 px-2 text-right font-semibold sm:table-cell">
                    Marcas
                  </th>
                  <th scope="col" className="h-10 w-20 px-4 text-right font-semibold sm:px-5">
                    Insumos
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {linhas.map(({ p, lojas, marcas, insumos }) => {
                  const s = STATUS_DO_PARCEIRO[p.status];
                  return (
                    <tr key={p.id} className="ff-transicao relative border-t border-linha hover:bg-texto/[0.03]">
                      <td className="max-w-0 px-4 py-3 sm:px-5">
                        {/* O link cobre a linha inteira (alvo grande), sem virar tabela clicável por JS. */}
                        <Link
                          href={`/rodolfo/erp/${p.slug}`}
                          className="block truncate font-medium text-texto after:absolute after:inset-0"
                        >
                          {p.nome}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-suave">
                          <Ponto tom={s.tom} />
                          <span className="truncate">{s.rotulo}</span>
                          {semAdmin.has(p.id) && (
                            <span className="truncate text-erro">· sem ninguém cuidando da equipe</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right font-display text-lg font-bold">{lojas}</td>
                      <td className="hidden px-2 py-3 text-right font-display text-lg font-bold sm:table-cell">
                        {marcas}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-lg font-bold sm:px-5">{insumos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Painel>

        <Painel id="novo-parceiro" titulo="Novo parceiro" className="scroll-mt-24 self-start">
          <FormParceiro />
        </Painel>
      </div>
    </div>
  );
}
