/**
 * ERP — espaço de um Parceiro Flow (N2). Cabeçalho, situação e abas comuns a
 * Insumos, Lojas e marcas, Histórico e Cadastro. O parceiro vem de
 * `exigirParceiro` (sessão + slug); a URL só escolhe, o portão isola.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { exigirParceiro } from '@/lib/erp/contexto';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { Abas } from '../abas';
import { Aviso, Cabecalho, Ponto, Trilha } from '../ui';

export const dynamic = 'force-dynamic';

export default async function ParceiroLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { parceiro, bloqueio } = await exigirParceiro(params.slug);
  const outros = await prisma.parceiroFlow.findMany({ select: { slug: true, nome: true }, orderBy: { nome: 'asc' } });
  const status = STATUS_DO_PARCEIRO[parceiro.status];

  return (
    <div className="space-y-6">
      <Trilha
        itens={[
          { rotulo: 'ERP', href: '/rodolfo/erp' },
          { rotulo: 'Parceiros Flow', href: '/rodolfo/erp' },
          { rotulo: parceiro.nome },
        ]}
      />

      <Cabecalho
        rotulo={
          <>
            <Ponto tom={status.tom} />
            Parceiro Flow · {status.rotulo}
          </>
        }
        titulo={parceiro.nome}
        acessorio={
          outros.length > 1 && (
            <nav
              aria-label="Trocar de parceiro"
              className="flex max-w-full gap-1 overflow-x-auto rounded-[9px] border border-white/[0.09] bg-[#131211] p-1"
            >
              {outros.map((o) => (
                <Link
                  key={o.slug}
                  href={`/rodolfo/erp/${o.slug}`}
                  aria-current={o.slug === parceiro.slug ? 'page' : undefined}
                  className="whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12px] text-surface/55 transition hover:text-surface aria-[current=page]:bg-white/[0.1] aria-[current=page]:text-surface"
                >
                  {o.nome}
                </Link>
              ))}
            </nav>
          )
        }
      />

      {bloqueio && (
        <Aviso tom={parceiro.status === 'SUSPENSO' ? 'suspenso' : 'rascunho'} titulo={status.rotulo}>
          {parceiro.status === 'SUSPENSO'
            ? 'Dá para consultar tudo; cadastros e alterações ficam bloqueados até reativar em Cadastro.'
            : 'Cadastros abrem quando o parceiro for liberado em Cadastro.'}
        </Aviso>
      )}

      <Abas slug={parceiro.slug} />

      {children}
    </div>
  );
}
