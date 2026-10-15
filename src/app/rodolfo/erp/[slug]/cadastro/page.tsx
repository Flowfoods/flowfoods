/**
 * ERP — cadastro do Parceiro Flow (nível 1, FlowFoods): nome, endereço,
 * situação e o histórico curto do próprio parceiro. Toda mudança daqui grava
 * antes/depois em `HistoricoAlteracao`.
 */

import Link from 'next/link';
import { exigirParceiro } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { STATUS_DO_PARCEIRO, transicoesDe } from '@/lib/erp/parceiros';
import { ListaHistorico } from '../../historico-lista';
import { Painel, Ponto, Vazio } from '../../ui';
import { FormRenomear, FormStatus } from './forms';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

const EXPLICA = {
  ATIVO: 'Opera normalmente: cadastros e lançamentos liberados.',
  RASCUNHO: 'Criado, mas ainda não liberado. Ninguém cadastra nada até ativar.',
  SUSPENSO: 'Leitura liberada; o servidor recusa qualquer cadastro ou alteração.',
} as const;

export default async function CadastroParceiroPage({ params }: { params: { slug: string } }) {
  const { parceiro, cliente } = await exigirParceiro(params.slug);
  const historico = await listarHistorico(cliente, { entidade: 'ParceiroFlow', limite: 6 });
  const status = STATUS_DO_PARCEIRO[parceiro.status];
  const proximo = transicoesDe(parceiro.status)[0] as 'ATIVO' | 'SUSPENSO' | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-4">
        <Painel titulo="Dados do parceiro">
          <div className="space-y-5">
            <FormRenomear slug={parceiro.slug} nome={parceiro.nome} />
            <dl className="grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4 text-sm">
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">Endereço</dt>
                <dd className="mt-1 truncate tabular-nums text-surface/80">/{parceiro.slug}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">Desde</dt>
                <dd className="mt-1 text-surface/80">{DATA.format(parceiro.criadoEm)}</dd>
              </div>
            </dl>
            <p className="text-[12px] text-surface/40">O endereço é fixo depois de criado: links e relatórios apontam para ele.</p>
          </div>
        </Painel>

        <Painel titulo="Situação">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 font-display text-xl font-bold">
                <Ponto tom={status.tom} />
                {status.rotulo}
              </div>
              <p className="mt-1 text-sm text-surface/55">{EXPLICA[parceiro.status]}</p>
            </div>
            {proximo && <FormStatus slug={parceiro.slug} novo={proximo} />}
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Histórico do parceiro"
        acessorio={
          <Link
            href={`/rodolfo/erp/${parceiro.slug}/historico?entidade=ParceiroFlow`}
            className="text-[11px] text-surface/50 transition hover:text-surface"
          >
            Ver tudo →
          </Link>
        }
        semRespiro
        className="self-start"
      >
        {historico.length === 0 ? (
          <Vazio titulo="Sem alterações registradas." />
        ) : (
          <ListaHistorico linhas={historico} compacta />
        )}
      </Painel>
    </div>
  );
}
