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
import { useCaminhoDaPagina } from './caminho-da-pagina';

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
  // Com a janela de módulo aberta, o Voltar do shell continua o da página de trás (caminho e busca de antes da janela): ele
  // não muda e não guarda a janela como visita.
  const caminhoDoEndereco = usePathname() ?? '';
  const buscaDoEndereco = useSearchParams()?.toString() ?? '';
  const caminho = useCaminhoDaPagina();
  const naJanela = caminho !== caminhoDoEndereco;
  // O último endereço fora da janela (guardado no próprio desenho, o padrão do React para lembrar o desenho anterior).
  const [foraDaJanela, guardarForaDaJanela] = useState({ caminho: caminhoDoEndereco, busca: buscaDoEndereco });
  if (!naJanela && (foraDaJanela.caminho !== caminhoDoEndereco || foraDaJanela.busca !== buscaDoEndereco)) {
    guardarForaDaJanela({ caminho: caminhoDoEndereco, busca: buscaDoEndereco });
  }
  const busca = naJanela ? (foraDaJanela.caminho === caminho ? foraDaJanela.busca : '') : buscaDoEndereco;
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
