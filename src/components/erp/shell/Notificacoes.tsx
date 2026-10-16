'use client';

/**
 * Sino da barra superior. Só mostra o que vem de uma fonte real (o layout
 * conta no servidor); sem nada, o sino fica sem ponto e o painel diz
 * "Nada novo por aqui." — nunca número inventado.
 */

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { BOTAO_ICONE, Popover } from './Popover';
import type { Notificacao } from './tipos';

export function Notificacoes({ itens }: { itens: Notificacao[] }) {
  const n = itens.length;
  return (
    <Popover
      rotulo={n ? `Notificações: ${n} nova${n === 1 ? '' : 's'}` : 'Notificações: nada novo'}
      classeDoBotao={BOTAO_ICONE}
      largura="w-80"
      conteudoDoBotao={
        <>
          <Bell size={18} aria-hidden />
          {n > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-acao px-1 text-[10px] font-bold leading-none text-white"
            >
              {n > 9 ? '9+' : n}
            </span>
          )}
        </>
      }
    >
      {(fechar) =>
        n === 0 ? (
          <p className="px-3 py-4 text-[14px] text-suave">Nada novo por aqui.</p>
        ) : (
          <ul aria-label="Notificações">
            {itens.map((i) => (
              <li key={i.href + i.titulo}>
                <Link
                  href={i.href}
                  onClick={fechar}
                  className="ff-transicao block rounded-[8px] px-3 py-2.5 hover:bg-texto/5"
                >
                  <span className="block text-[14px] font-medium text-texto">{i.titulo}</span>
                  <span className="block text-[12px] text-suave">{i.detalhe}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </Popover>
  );
}
