'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import type { Navegacao } from '@/lib/erp/modulos';
import {
  atualizarMemoriaDoRetorno,
  raizDoRetorno,
  resolverRetornoDaNavegacao,
  temVoltarNoShell,
  type MemoriaDoRetorno,
} from '@/lib/erp/voltar-navegacao';
import { Voltar } from '../telas/cadastro/partes';
import { useContextoDaConsulta } from './contexto-da-consulta';

const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Complementa só listas auditadas, sem duplicar Voltar dos detalhes/formulários. */
export function VoltarDaNavegacao({
  nav,
  chaveDoContexto,
  visao,
}: {
  nav: Navegacao;
  /** Pessoa/parceiro identificados pelo layout servidor; sem chave, não usa origem lembrada. */
  chaveDoContexto?: string;
  visao?: string | null;
}) {
  const caminho = usePathname() ?? '';
  const busca = useSearchParams()?.toString() ?? '';
  const atual = caminho + (busca ? '?' + busca : '');
  const consulta = useContextoDaConsulta();
  const contexto = consulta.chave || [chaveDoContexto ?? '', raizDoRetorno(caminho) ?? '', visao ?? ''].join(':');
  const [memoria, guardar] = useState<MemoriaDoRetorno | null>(null);
  // A origem usada no desenho vem da última visita confirmada, nunca do referrer/histórico externo.
  const proxima = atualizarMemoriaDoRetorno(memoria, contexto, atual);
  useAntesDaPintura(() => {
    guardar((anterior) => atualizarMemoriaDoRetorno(anterior, contexto, atual));
  }, [contexto, atual]);
  const id = useId();
  if (!temVoltarNoShell(caminho, busca)) return null;
  const retorno = resolverRetornoDaNavegacao({ caminho, nav, origens: chaveDoContexto ? proxima.anteriores : [] });
  return (
    <div className="mb-4 print:hidden">
      {retorno.href ? (
        <Voltar href={retorno.href}>{retorno.rotulo}</Voltar>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" disabled aria-describedby={id} className="inline-flex min-h-11 items-center text-[13px] font-medium text-suave">
            Voltar
          </button>
          <span id={id} className="text-[12px] text-suave">{retorno.motivo}</span>
        </div>
      )}
    </div>
  );
}
