/**
 * ERP — nível 1 (FlowFoods): os Parceiros Flow, um por linha, e o cadastro de
 * um novo. Os números de cada parceiro só são lidos pelo portão de tenant
 * (cliente somente leitura, com RLS), nunca pelo prisma do portal.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { exigirNivel1, leituraDoParceiro } from '@/lib/erp/contexto';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { FormParceiro } from './form-parceiro';
import { Cabecalho, Metrica, Painel, Ponto, Trilha, Vazio } from './ui';

export const dynamic = 'force-dynamic';

export default async function ErpPage() {
  await exigirNivel1();
  const parceiros = await prisma.parceiroFlow.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] });
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
      <Trilha itens={[{ rotulo: 'ERP' }, { rotulo: 'Parceiros Flow' }]} />
      <Cabecalho
        rotulo="Nível 1 · FlowFoods"
        titulo="Parceiros Flow"
        descricao="Cada parceiro enxerga só o que é dele. Escolha um para operar ou crie um novo."
      />

      <div className="grid grid-cols-3 gap-3">
        <Metrica rotulo="Ativos" valor={porStatus.ATIVO} />
        <Metrica rotulo="A liberar" valor={porStatus.RASCUNHO} />
        <Metrica rotulo="Suspensos" valor={porStatus.SUSPENSO} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        <Painel
          titulo="Parceiros"
          acessorio={<span className="text-[11px] tabular-nums text-surface/40">{parceiros.length}</span>}
          semRespiro
          className="self-start"
        >
          {linhas.length === 0 ? (
            <Vazio titulo="Nenhum Parceiro Flow ainda.">Crie o primeiro no formulário ao lado.</Vazio>
          ) : (
            <>
              <div className="flex items-center gap-4 border-b border-white/[0.07] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/40">
                <span className="flex-1">Parceiro</span>
                <span className="w-12 text-right">Lojas</span>
                <span className="hidden w-12 text-right sm:block">Marcas</span>
                <span className="w-14 text-right">Insumos</span>
                <span aria-hidden className="w-3" />
              </div>
              <ul>
                {linhas.map(({ p, lojas, marcas, insumos }) => {
                  const s = STATUS_DO_PARCEIRO[p.status];
                  return (
                    <li key={p.id} className="border-t border-white/[0.06] first:border-t-0">
                      <Link
                        href={`/rodolfo/erp/${p.slug}`}
                        className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.03]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.nome}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-surface/45">
                            <Ponto tom={s.tom} />
                            <span className="truncate">{s.rotulo}</span>
                          </div>
                        </div>
                        <span className="w-12 text-right font-display text-lg font-bold lining-nums tabular-nums">{lojas}</span>
                        <span className="hidden w-12 text-right font-display text-lg font-bold lining-nums tabular-nums sm:block">
                          {marcas}
                        </span>
                        <span className="w-14 text-right font-display text-lg font-bold lining-nums tabular-nums">{insumos}</span>
                        <span
                          aria-hidden
                          className="w-3 text-surface/30 transition group-hover:translate-x-0.5 group-hover:text-bright"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Painel>

        <Painel titulo="Novo parceiro" className="self-start">
          <FormParceiro />
        </Painel>
      </div>
    </div>
  );
}
