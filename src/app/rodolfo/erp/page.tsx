/**
 * ERP — nível 1 (FlowFoods): os Parceiros Flow, um por linha. Daqui se entra
 * no espaço de cada um; os dados de um parceiro só são lidos pelo portão de
 * tenant (`doParceiro`), inclusive a contagem desta lista.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { Cabecalho, Painel, Ponto, Trilha } from './ui';

export const dynamic = 'force-dynamic';

const STATUS = {
  ATIVO: { tom: 'ativo', rotulo: 'Ativo' },
  RASCUNHO: { tom: 'rascunho', rotulo: 'Aguardando liberação' },
  SUSPENSO: { tom: 'suspenso', rotulo: 'Suspenso' },
} as const;

export default async function ErpPage() {
  const parceiros = await prisma.parceiroFlow.findMany({ orderBy: { nome: 'asc' } });
  const linhas = await Promise.all(
    parceiros.map(async (p) => ({ p, totalInsumos: await doParceiro(p.id).insumo.count() })),
  );

  return (
    <div className="space-y-6">
      <Trilha itens={[{ rotulo: 'ERP' }, { rotulo: 'Parceiros Flow' }]} />
      <Cabecalho
        rotulo="Nível 1 · FlowFoods"
        titulo="Parceiros Flow"
        descricao="Cada parceiro enxerga só o que é dele. Escolha um para operar."
      />

      <Painel titulo={`${parceiros.length} parceiros`} semRespiro>
        {linhas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-surface/50">
            Nenhum Parceiro Flow ainda. Em ambiente de teste, rode{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px]">npm run erp:seed-teste</code>.
          </p>
        ) : (
          <ul>
            {linhas.map(({ p, totalInsumos }) => {
              const s = STATUS[p.status];
              return (
                <li key={p.id} className="border-t border-white/[0.07] first:border-t-0">
                  <Link
                    href={`/rodolfo/erp/${p.slug}`}
                    className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.nome}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-surface/45">
                        <Ponto tom={s.tom} />
                        {s.rotulo}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-bold tabular-nums">{totalInsumos}</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-surface/40">insumos</div>
                    </div>
                    <span aria-hidden className="text-surface/30 transition group-hover:translate-x-0.5 group-hover:text-bright">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
    </div>
  );
}
