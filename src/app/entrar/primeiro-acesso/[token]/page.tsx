/**
 * Link de primeiro acesso (ou de senha nova) que o Rodolfo copiou e mandou.
 * Uso único, 72 h. Usado, vencido, revogado ou inexistente: a mesma resposta.
 */

import Link from 'next/link';
import { ERRO_DE_LINK } from '@/lib/erp/acesso';
import { consultarLink } from '@/lib/erp/credenciais';
import { FormSenha } from './form-senha';

export const dynamic = 'force-dynamic';

export default async function PrimeiroAcessoPage({ params }: { params: { token: string } }) {
  const link = await consultarLink(params.token);
  const primeiroNome = link.valido ? link.nome.split(' ')[0] : '';

  return (
    <div className="mx-auto w-full max-w-[440px]">
      <section className="rounded-[14px] border border-white/[0.09] border-t-white/[0.16] bg-[#131211] p-5 sm:p-7">
        {link.valido ? (
          <>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-surface/50">
              {link.primeiraVez ? 'Primeiro acesso' : 'Senha nova'}
            </div>
            <h1 className="font-display text-[26px] font-bold leading-tight">Olá, {primeiroNome}.</h1>
            <p className="mb-6 mt-2 text-[14px] leading-relaxed text-surface/60">
              {link.primeiraVez
                ? 'A FlowFoods criou o seu acesso ao ERP. Defina uma senha para entrar.'
                : 'Defina uma senha nova. As sessões abertas em outros aparelhos serão encerradas.'}
              <span className="mt-1 block text-surface/80">{link.email}</span>
            </p>
            <FormSenha token={params.token} email={link.email} primeiraVez={link.primeiraVez} />
          </>
        ) : (
          <>
            <h1 className="font-display text-[26px] font-bold leading-tight">Link sem validade</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-surface/60">
              {ERRO_DE_LINK} Cada link funciona uma vez só e vale por 72 horas.
            </p>
            <Link
              href="/entrar"
              className="mt-6 inline-block rounded-[7px] border border-white/[0.16] px-4 py-2.5 text-sm font-semibold transition hover:border-surface/45"
            >
              Ir para a entrada
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
