/**
 * Entrada das pessoas dos parceiros no ERP (0.3). Não é o login do /rodolfo:
 * outra tabela de usuários, outro cookie de sessão.
 */

import { redirect } from 'next/navigation';
import { configDoRosto, rostoPossivel } from '@/lib/erp/rosto';
import { sessaoDaRequisicao } from '@/lib/erp/sessao';
import { AjudaDeAcesso } from './ajuda';
import { FormEntrar } from './form-entrar';

export const dynamic = 'force-dynamic';

const AVISOS: Record<string, string> = {
  criada: 'Senha criada. Agora entre com o seu e-mail e a senha nova.',
  saiu: 'Você saiu. Até a próxima.',
};

/** O rosto só funciona em https (ou localhost): em http o botão nem aparece. */
function rostoNoSite(): boolean {
  try {
    return rostoPossivel(configDoRosto());
  } catch {
    return false;
  }
}

export default async function EntrarPage({ searchParams }: { searchParams: { senha?: string; saiu?: string } }) {
  const sessao = await sessaoDaRequisicao();
  if (sessao) redirect(sessao.parceiro ? '/erp' : '/entrar/escolher');
  const aviso = searchParams.senha === 'criada' ? AVISOS.criada : searchParams.saiu ? AVISOS.saiu : null;
  const rosto = rostoNoSite();

  return (
    <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,420px)] lg:gap-20">
      <section className="max-w-xl">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-suave">
          Parceiro Flow
        </div>
        <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">
          Estoque, ficha técnica e resultado do seu grupo, num lugar só.
        </h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-suave sm:mt-4 sm:text-[15px]">
          O acesso é criado pela FlowFoods. Use o e-mail e a senha que você definiu pelo link que recebeu.
        </p>
      </section>

      <section
        aria-label="Entrar"
        className="rounded-[14px] border border-linha bg-painel p-5 sm:p-7"
      >
        <h2 className="mb-5 font-display text-xl font-bold">Entrar</h2>
        <FormEntrar aviso={aviso} rosto={rosto} />
        <AjudaDeAcesso className="mt-6 border-t border-linha pt-4" />
      </section>
    </div>
  );
}
