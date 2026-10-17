/**
 * ERP — nível 1 (FlowFoods): os Parceiros Flow, um por linha, e o cadastro de
 * um novo. Os números de cada parceiro só são lidos pelo portão de tenant
 * (cliente somente leitura, com RLS), nunca pelo prisma do portal.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { exigirNivel1, leituraDoParceiro } from '@/lib/erp/contexto';
import { parceirosSemAdministrador, rascunhosComPessoasAtivas } from '@/lib/erp/credenciais';
import { COR } from '@/lib/erp/modulos';
import { contarPedidosAbertos } from '@/lib/erp/pedidos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Contagem, Metrica, Painel, Ponto, Vazio } from '@/components/erp/ui/superficies';

export const dynamic = 'force-dynamic';

export default async function ErpPage() {
  await exigirNivel1();
  const [parceiros, semAdmin, presos, pedidos] = await Promise.all([
    prisma.parceiroFlow.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] }),
    parceirosSemAdministrador(),
    rascunhosComPessoasAtivas(),
    contarPedidosAbertos(),
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
        <Metrica
          rotulo="Aguardando liberação"
          valor={pedidos.abertos}
        >
          {(pedidos.atrasados > 0 || porStatus.RASCUNHO > 0) && (
            <div className="mt-1.5 text-[12px] leading-snug text-suave">
              {[pedidos.atrasados ? `${pedidos.atrasados} com atraso` : null, porStatus.RASCUNHO ? `${porStatus.RASCUNHO} em rascunho` : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </Metrica>
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
            <Vazio titulo="Nenhum Parceiro Flow ainda.">O primeiro nasce quando você ativa um pedido em “Aguardando liberação”.</Vazio>
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-suave">
                          <Ponto tom={s.tom} />
                          <span className="truncate">{s.rotulo}</span>
                          {presos.has(p.id) ? (
                            <span className="basis-full text-erro sm:basis-auto">
                              <span aria-hidden className="hidden sm:inline">· </span>
                              {presos.get(p.id)} {presos.get(p.id) === 1 ? 'pessoa não entra' : 'pessoas não entram'}: ative para liberar o acesso
                            </span>
                          ) : (
                            semAdmin.has(p.id) && <span className="basis-full text-erro sm:basis-auto">
                              <span aria-hidden className="hidden sm:inline">· </span>sem ninguém cuidando da equipe
                            </span>
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

        <Painel titulo="Novo parceiro" className="self-start">
          <div className="space-y-4 text-sm">
            <p className="text-suave">
              Um parceiro nasce de um pedido: o que chega pelo site ou o que você digita. Ao ativar, nascem o parceiro, o dono e o link de primeiro
              acesso.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/rodolfo/onboarding/novo" className={classeDeBotao('primario', 'w-full')}>
                Cadastrar pedido manual
              </Link>
              <Link href="/rodolfo/onboarding" className={classeDeBotao('secundario', 'w-full')}>
                {pedidos.abertos ? `Ver ${pedidos.abertos} ${pedidos.abertos === 1 ? 'pedido aberto' : 'pedidos abertos'}` : 'Ver o quadro de pedidos'}
              </Link>
            </div>
          </div>
        </Painel>
      </div>
    </div>
  );
}
