/**
 * ERP — cadastro do Parceiro Flow (nível 1, FlowFoods): nome, endereço,
 * situação e o histórico curto do próprio parceiro. Toda mudança daqui grava
 * antes/depois em `HistoricoAlteracao`.
 */

import Link from 'next/link';
import { exigirParceiro } from '@/lib/erp/contexto';
import { listarHistorico } from '@/lib/erp/historico';
import { STATUS_DO_PARCEIRO, transicoesDe } from '@/lib/erp/parceiros';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Painel, Ponto, Vazio } from '@/components/erp/ui/superficies';
import { ListaHistorico } from '@/components/erp/telas/historico/lista-historico';
import { FormRenomear, FormStatus } from './forms';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

const EXPLICA = {
  ATIVO: 'Opera normalmente: cadastros e lançamentos liberados.',
  RASCUNHO: 'Rascunho: ninguém deste parceiro entra e nada se cadastra até ativar. Ative para liberar o acesso.',
  SUSPENSO:
    'Dá para consultar tudo. Insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar; o nome ainda pode ser corrigido.',
} as const;

export default async function CadastroParceiroPage({ params }: { params: { slug: string } }) {
  const { parceiro, cliente } = await exigirParceiro(params.slug);
  const historico = await listarHistorico(cliente, { entidade: 'ParceiroFlow', limite: 6, verPrecos: false });
  const status = STATUS_DO_PARCEIRO[parceiro.status];
  const proximo = transicoesDe(parceiro.status)[0] as 'ATIVO' | 'SUSPENSO' | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="cadastro"
        cor={COR.rede}
        titulo="Cadastro do parceiro"
        subtitulo={`${parceiro.nome} · ${status.rotulo} · desde ${DATA.format(parceiro.criadoEm)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Painel titulo="Dados do parceiro">
            <div className="space-y-5">
              <FormRenomear slug={parceiro.slug} nome={parceiro.nome} />
              <dl className="grid grid-cols-2 gap-4 border-t border-linha pt-4 text-sm">
                <div className="min-w-0">
                  <dt className="text-[12px] font-semibold text-suave">Link do parceiro</dt>
                  <dd className="mt-1 truncate tabular-nums text-texto">/{parceiro.slug}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-semibold text-suave">Desde</dt>
                  <dd className="mt-1 text-texto">{DATA.format(parceiro.criadoEm)}</dd>
                </div>
              </dl>
              <p className="text-[12px] text-suave">
                O link é fixo depois de criado: favoritos e relatórios apontam para ele.
              </p>
            </div>
          </Painel>

          <Painel titulo="Situação">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 font-display text-xl font-bold">
                  <Ponto tom={status.tom} />
                  {status.rotulo}
                </div>
                <p className="mt-1 text-sm text-suave">{EXPLICA[parceiro.status]}</p>
              </div>
              {proximo && <FormStatus slug={parceiro.slug} novo={proximo} />}
            </div>
          </Painel>
        </div>

        <Painel
          titulo="Histórico do parceiro"
          acessorio={
            <Link href={`/rodolfo/erp/${parceiro.slug}/historico?entidade=ParceiroFlow`} className={LINK_DE_TEXTO}>
              Ver o histórico completo
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
    </div>
  );
}
