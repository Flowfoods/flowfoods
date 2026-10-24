'use client';

/**
 * Menu do usuário: nome, papel e iniciais; o tema (Claro / Escuro / Do
 * aparelho); links da conta; Sair. O tema muda na hora (atributo no wrapper)
 * e a escolha vai para o cookie pelo servidor — o próximo carregamento já
 * vem no tema certo, sem flash.
 */

import { EnvioComEstado } from '../ui/botoes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { iniciais } from '@/lib/erp/modulos';
import { ROTULO_DO_TEMA, TEMAS, type Tema } from '@/lib/erp/tema';
import { acaoTrocarTema } from './acoes';
import { limparRascunhos } from '../telas/cadastro/rascunho';
import { Popover } from './Popover';

const ICONE_DO_TEMA = { claro: Sun, escuro: Moon, sistema: Monitor } as const;

export function MenuUsuario({
  usuario,
  tema: temaInicial,
  links,
  sair,
}: {
  usuario: { nome: string; papel: string; email?: string };
  tema: Tema;
  links: { rotulo: string; href: string }[];
  sair: (() => Promise<void>) | null;
}) {
  const router = useRouter();
  const [tema, setTema] = useState(temaInicial);
  const [saindo, iniciarSaida] = useTransition();

  function trocar(t: Tema) {
    setTema(t);
    document.querySelector('.ff-app')?.setAttribute('data-tema', t);
    void acaoTrocarTema(t).then(() => router.refresh());
  }

  return (
    <Popover
      rotulo={`Conta de ${usuario.nome}`}
      largura="w-72"
      classeDoBotao="ff-transicao flex min-h-11 items-center gap-2.5 rounded-[7px] pl-1 pr-1 hover:bg-texto/5 aria-expanded:bg-texto/5 lg:pr-2.5"
      conteudoDoBotao={
        <>
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-linha-forte bg-forte text-[12px] font-semibold text-texto"
          >
            {iniciais(usuario.nome)}
          </span>
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block max-w-[10rem] truncate text-[13px] font-medium leading-tight text-texto">
              {usuario.nome}
            </span>
            <span className="block max-w-[10rem] truncate text-[12px] leading-tight text-suave">{usuario.papel}</span>
          </span>
        </>
      }
    >
      {() => (
        <div>
          <div className="border-b border-linha px-3 pb-3 pt-2">
            <p className="truncate text-[14px] font-semibold">{usuario.nome}</p>
            <p className="truncate text-[12px] text-suave">{usuario.papel}</p>
            {usuario.email && <p className="truncate text-[12px] text-suave">{usuario.email}</p>}
          </div>
          <fieldset className="border-b border-linha px-3 py-3">
            <legend className="mb-2 text-[12px] text-suave">Tema</legend>
            <div className="grid grid-cols-3 gap-1 rounded-[9px] border border-linha p-1">
              {TEMAS.map((t) => {
                const I = ICONE_DO_TEMA[t];
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tema === t}
                    onClick={() => trocar(t)}
                    className="ff-transicao flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-[6px] text-[11px] text-suave hover:text-texto aria-pressed:bg-forte aria-pressed:font-semibold aria-pressed:text-texto"
                  >
                    <I size={16} aria-hidden />
                    {ROTULO_DO_TEMA[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {links.length > 0 && (
            <ul className="border-b border-linha py-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="ff-transicao flex min-h-11 items-center rounded-[8px] px-3 text-[14px] hover:bg-texto/5"
                  >
                    {l.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-1">
            {sair ? (
              <form action={sair} onSubmit={limparRascunhos}>
                <EnvioComEstado
                  pendente={
                    <>
                      <LogOut size={16} aria-hidden /> Saindo…
                    </>
                  }
                  className="ff-transicao flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[14px] hover:bg-texto/5"
                >
                  <LogOut size={16} aria-hidden /> Sair
                </EnvioComEstado>
              </form>
            ) : (
              <button
                type="button"
                disabled={saindo}
                onClick={() => {
                  limparRascunhos();
                  iniciarSaida(() => signOut({ callbackUrl: '/rodolfo/login' }));
                }}
                className="ff-transicao flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[14px] hover:bg-texto/5"
              >
                <LogOut size={16} aria-hidden /> {saindo ? 'Saindo…' : 'Sair'}
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
