/**
 * ERP do parceiro (0.3): a área das pessoas do Parceiro Flow. O parceiro vem SÓ
 * da sessão (`exigirParceiroDaSessao`), nunca da URL: não existe endereço que
 * escolha outro parceiro. Sessão própria (não é a do /rodolfo).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirParceiroDaSessao } from '@/lib/erp/contexto';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { Aviso, Cabecalho, Ponto } from '@/app/rodolfo/erp/ui';
import { MarcaErp } from '../entrar/marca';
import { acaoSair } from '../entrar/actions';
import { AbasDoParceiro } from './abas';

export const metadata: Metadata = {
  title: 'FlowFoods ERP',
  robots: 'noindex, nofollow, noarchive',
};

export const dynamic = 'force-dynamic';

const AVISO = {
  SUSPENSO: 'Você pode consultar tudo, mas cadastros e alterações estão parados. Fale com a FlowFoods.',
  RASCUNHO: 'Você já pode olhar. Cadastros e alterações abrem quando a FlowFoods liberar o parceiro.',
} as const;

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const { parceiro, pessoa, bloqueio } = await exigirParceiroDaSessao();
  const status = STATUS_DO_PARCEIRO[parceiro.status];

  return (
    <div className="min-h-screen bg-footer text-surface">
      <div aria-hidden className="h-[3px] bg-primary" />
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/erp" aria-label="FlowFoods ERP — início">
            <MarcaErp />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-[13px] text-surface/55 sm:block">{pessoa.usuario.nome}</span>
            <form action={acaoSair}>
              <button
                type="submit"
                className="rounded-[7px] border border-white/15 px-3 py-1.5 text-xs font-medium text-surface/70 transition hover:border-white/30 hover:text-surface"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Cabecalho
          rotulo={
            <>
              <Ponto tom={status.tom} />
              Parceiro Flow · {status.rotulo}
            </>
          }
          titulo={parceiro.nome}
          acessorio={
            pessoa.parceiros.length > 1 && (
              <Link
                href="/entrar/escolher"
                className="rounded-[7px] border border-white/[0.14] px-3 py-1.5 text-[12px] text-surface/70 transition hover:border-surface/40 hover:text-surface"
              >
                Trocar de parceiro
              </Link>
            )
          }
        />
        {bloqueio && (parceiro.status === 'SUSPENSO' || parceiro.status === 'RASCUNHO') && (
          <Aviso tom={parceiro.status === 'SUSPENSO' ? 'suspenso' : 'rascunho'} titulo={status.rotulo}>
            {AVISO[parceiro.status]}
          </Aviso>
        )}
        <AbasDoParceiro />
        {children}
      </main>
    </div>
  );
}
