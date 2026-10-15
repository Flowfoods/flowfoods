/**
 * ERP — espaço de um Parceiro Flow: Insumos. Tudo o que esta tela lê passa por
 * `doParceiro(parceiro.id)`; trocar de parceiro é trocar de URL, e a URL só
 * escolhe — o isolamento é o portão de tenant.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { doParceiro, parceiroPorSlug } from '@/lib/erp/tenant';
import { listarInsumos } from '@/lib/erp/insumos';
import { UNIDADES, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { Cabecalho, Metrica, Painel, Ponto, Trilha } from '../ui';
import { FormInsumo } from './form-insumo';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

export default async function ParceiroInsumosPage({ params }: { params: { slug: string } }) {
  const parceiro = await parceiroPorSlug(params.slug);
  if (!parceiro) notFound();

  const [insumos, outros] = await Promise.all([
    listarInsumos(doParceiro(parceiro.id)),
    prisma.parceiroFlow.findMany({ select: { slug: true, nome: true }, orderBy: { nome: 'asc' } }),
  ]);

  const porUnidade = { KG: 0, L: 0, UN: 0 };
  for (const i of insumos) porUnidade[i.unidade]++;
  const ultimo = insumos.reduce<(typeof insumos)[number] | null>(
    (a, i) => (!a || i.criadoEm > a.criadoEm ? i : a),
    null,
  );
  const ativo = parceiro.status === 'ATIVO';

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
            <Ponto tom={ativo ? 'ativo' : parceiro.status === 'RASCUNHO' ? 'rascunho' : 'suspenso'} />
            Parceiro Flow · {parceiro.nome}
          </>
        }
        titulo="Insumos"
        descricao="Tudo o que entra na ficha técnica começa aqui. Custo sempre por unidade base."
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Metrica rotulo="Cadastrados" valor={insumos.length} detalhe="insumos ativos" />
        <Metrica
          rotulo="Por unidade"
          valor={`${porUnidade.KG} · ${porUnidade.L} · ${porUnidade.UN}`}
          detalhe="kg · L · un"
        />
        <Metrica
          rotulo="Último cadastro"
          valor={ultimo ? DATA.format(ultimo.criadoEm) : '—'}
          detalhe={ultimo?.nome ?? 'nenhum ainda'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        <Painel
          titulo="Lista de insumos"
          acessorio={<span className="text-[11px] tabular-nums text-surface/40">{insumos.length}</span>}
          semRespiro
          className="order-2 lg:order-1"
        >
          {insumos.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-display text-lg">Nenhum insumo ainda.</p>
              <p className="mt-1 text-sm text-surface/45">Cadastre o primeiro no formulário ao lado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-surface/40">
                    <th scope="col" className="px-5 py-2.5 text-left font-semibold">Insumo</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Embalagem</th>
                    <th scope="col" className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Preço pago</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold">Custo / unid.</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {insumos.map((i) => (
                    <tr key={i.id} className="border-t border-white/[0.06] transition hover:bg-white/[0.025]">
                      <td className="px-5 py-3">
                        <div className="font-medium text-surface">{i.nome}</div>
                        <div className="text-[11px] text-surface/40">
                          {UNIDADES[i.unidade].nome}
                          <span className="sm:hidden"> · {formatarDinheiro(i.precoEmbalagemCentavos)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-surface/70">
                        {formatarQuantidade(i.conteudoMilesimos, i.unidade)}
                      </td>
                      <td className="hidden px-3 py-3 text-right text-surface/70 sm:table-cell">
                        {formatarDinheiro(i.precoEmbalagemCentavos)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-semibold text-surface">{formatarDinheiro(i.custoUnitarioCentavos)}</span>
                        <span className="ml-1 text-[11px] text-surface/40">/{UNIDADES[i.unidade].sigla}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>

        <Painel titulo="Novo insumo" className="order-1 self-start lg:order-2">
          {ativo ? (
            <FormInsumo slug={parceiro.slug} />
          ) : (
            <p className="text-sm text-surface/55">
              Este parceiro ainda não foi liberado. Cadastros abrem quando ele estiver ativo.
            </p>
          )}
        </Painel>
      </div>
    </div>
  );
}
