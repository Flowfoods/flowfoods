'use client';

/**
 * I.1b — O que a pessoa já tinha preenchido numa nota, ficha ou embalagens de um prato NÃO se perde quando ela sai para
 * cadastrar o insumo que faltava ("Insumo que falta: cadastrar") e volta.
 *
 * Fica só no navegador desta aba (`sessionStorage`): nunca vai ao servidor, some quando a aba fecha e vale 20 minutos. É um
 * conforto por tela (a chave é o caminho da página), não um dado do ERP: se o navegador não deixar guardar, a tela funciona do
 * mesmo jeito, só sem recuperar. Ao voltar, o formulário abre com o que estava e diz que recuperou, com a opção de descartar.
 * Uma foto escolhida na ficha não é guardada (arquivos não cabem aqui): a ficha avisa.
 */

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PARAMETRO_INSUMO_CRIADO } from '@/lib/erp/volta';

const PREFIXO = 'ff-rascunho:';
const VALE_MS = 20 * 60 * 1000;

export function guardarRascunho(chave: string, valores: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIXO + chave, JSON.stringify({ em: Date.now(), valores }));
  } catch {
    // Sem armazenamento (janela privada, bloqueio): a tela segue sem recuperar.
  }
}

export function descartarRascunho(chave: string): void {
  try {
    window.sessionStorage.removeItem(PREFIXO + chave);
  } catch {
    // idem
  }
}

function lerRascunho<T>(chave: string): T | null {
  try {
    const bruto = window.sessionStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;
    const lido = JSON.parse(bruto) as { em?: unknown; valores?: unknown };
    if (typeof lido.em !== 'number' || Date.now() - lido.em > VALE_MS || lido.valores === null || typeof lido.valores !== 'object') {
      window.sessionStorage.removeItem(PREFIXO + chave);
      return null;
    }
    return lido.valores as T;
  } catch {
    return null;
  }
}

export interface RascunhoDaTela<T> {
  /** Chave deste rascunho (o caminho da página). */
  chave: string;
  /** undefined = ainda não olhou (primeiro desenho); null = não há; senão, o que estava preenchido. */
  valores: T | null | undefined;
  /** O insumo que acabou de ser cadastrado e voltou na URL (`?insumoCriado=`), quando veio de lá. */
  insumoCriado: string | null;
  /** Esquece o rascunho (descartar, ou depois de gravar). */
  descartar: () => void;
}

/**
 * Lê (uma vez, depois do primeiro desenho) o rascunho desta página e o insumo criado que voltou na URL. O rascunho é consumido:
 * ao recuperar, sai do armazenamento (se a pessoa sair de novo, o formulário guarda outro).
 */
export function useRascunhoDaTela<T>(): RascunhoDaTela<T> {
  // Sem o roteador montado (teste de renderização, pré-visualização) os dois vêm nulos: a tela funciona, só não recupera nada.
  const pathname = usePathname() ?? '';
  const busca = useSearchParams();
  // Capturado no primeiro desenho: depois a barra de endereço é limpa e o parâmetro some, mas a tela já o aplicou.
  const [insumoCriado] = useState(() => busca?.get(PARAMETRO_INSUMO_CRIADO) ?? null);
  const [valores, setValores] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!pathname) return setValores(null);
    setValores(lerRascunho<T>(pathname));
    descartarRascunho(pathname);
    // Limpa o parâmetro da barra de endereço: recarregar a página não repete o aviso nem a escolha.
    if (new URLSearchParams(window.location.search).has(PARAMETRO_INSUMO_CRIADO)) {
      const p = new URLSearchParams(window.location.search);
      p.delete(PARAMETRO_INSUMO_CRIADO);
      window.history.replaceState(window.history.state, '', p.toString() ? `${pathname}?${p}` : pathname);
    }
    // Só no primeiro desenho da página: o rascunho é desta visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { chave: pathname, valores, insumoCriado, descartar: () => descartarRascunho(pathname) };
}

/** "Recuperamos o que você tinha preenchido" + "Descartar". Região viva: o leitor de tela anuncia. */
export function AvisoDeRascunho({ quando, aoDescartar, observacao }: { quando: boolean; aoDescartar: () => void; observacao?: string }) {
  if (!quando) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-linha-forte px-4 py-3 text-sm">
      <p className="text-texto">
        Recuperamos o que você tinha preenchido antes de ir cadastrar o insumo.
        {observacao && <span className="block text-[13px] text-suave">{observacao}</span>}
      </p>
      <button type="button" onClick={aoDescartar} className="ff-transicao min-h-11 rounded-[7px] px-3 text-[13px] font-medium text-suave underline underline-offset-4 hover:text-texto sm:min-h-9">
        Descartar e começar de novo
      </button>
    </div>
  );
}
