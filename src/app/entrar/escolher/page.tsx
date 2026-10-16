/**
 * Quem tem acesso a mais de um parceiro (consultor, sócio de rede) escolhe com
 * qual vai trabalhar. O servidor confere o vínculo antes de gravar na sessão.
 */

import { redirect } from 'next/navigation';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { sessaoDaRequisicao } from '@/lib/erp/sessao';
import { Ponto } from '@/components/erp/ui/superficies';
import { acaoEscolherParceiro, acaoSair } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EscolherPage() {
  const sessao = await sessaoDaRequisicao();
  if (!sessao) redirect('/entrar');

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-surface/50">
        Olá, {sessao.usuario.nome.split(' ')[0]}
      </div>
      <h1 className="font-display text-[26px] font-bold leading-tight">Com qual parceiro vai trabalhar?</h1>
      <p className="mb-6 mt-2 text-[14px] text-surface/55">Dá para trocar depois, pelo topo da tela.</p>
      <ul className="overflow-hidden rounded-[14px] border border-white/[0.09] border-t-white/[0.16] bg-[#131211]">
        {sessao.parceiros.map((p) => {
          const s = STATUS_DO_PARCEIRO[p.status];
          const atual = sessao.parceiro?.id === p.id;
          return (
            <li key={p.id} className="border-t border-white/[0.06] first:border-t-0">
              <form action={acaoEscolherParceiro}>
                <input type="hidden" name="parceiroId" value={p.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-surface">{p.nome}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[12px] text-surface/50">
                      <Ponto tom={s.tom} />
                      {s.rotulo}
                      {atual && ' · aberto agora'}
                    </span>
                  </span>
                  <span aria-hidden className="text-surface/35">
                    →
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <form action={acaoSair} className="mt-6">
        <button type="submit" className="text-[13px] text-surface/50 underline-offset-4 transition hover:text-surface hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}
