'use client';

/**
 * I.1b — O que a pessoa já tinha preenchido numa nota, ficha ou embalagens de um prato NÃO se perde quando ela sai para
 * cadastrar o insumo que faltava ("Insumo que falta: cadastrar") e volta.
 *
 * Fica só no navegador desta aba (`sessionStorage`): nunca vai ao servidor, some quando a aba fecha e vale 20 minutos. É um
 * conforto por tela (a chave é DE QUEM é — parceiro e pessoa, vindos do servidor — mais o caminho da página; sair, entrar e trocar de pessoa
 * apagam tudo), não um dado do ERP: se o navegador não deixar guardar, a tela funciona do
 * mesmo jeito, só sem recuperar. Ao voltar, o formulário abre com o que estava e diz que recuperou, com a opção de descartar.
 * Uma foto escolhida na ficha não é guardada (arquivos não cabem aqui): a ficha avisa.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PARAMETRO_FORNECEDOR_CRIADO, PARAMETRO_INSUMO_CRIADO } from '@/lib/erp/volta';

const PREFIXO = 'ff-rascunho:';
const VALE_MS = 20 * 60 * 1000;

/**
 * DE QUEM é o rascunho: parceiro + pessoa (ou o nível 1), vindos do SERVIDOR pelo layout. A chave do armazenamento leva isso antes do
 * caminho da página: num tablet compartilhado, o que uma pessoa deixou na nota nunca aparece para outra (nem de outro parceiro, nem do
 * mesmo). Sem o escopo (fora do layout), a tela funciona e simplesmente não guarda nem recupera nada.
 */
const Escopo = createContext<string>('');
export function EscopoDoRascunho({ escopo, children }: { escopo: string; children: ReactNode }) {
  return <Escopo.Provider value={escopo}>{children}</Escopo.Provider>;
}

/** Apaga TODO rascunho deste navegador: ao sair, ao trocar de pessoa e ao abrir a tela de entrar. */
export function limparRascunhos(): void {
  try {
    const s = window.sessionStorage;
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIXO)) s.removeItem(k);
    }
  } catch {
    // Sem armazenamento: não há o que apagar.
  }
}

/** `versao` = a versão do que a tela leu (ficha, nota, impressão das embalagens): rascunho de versão velha não volta por cima. */
export function guardarRascunho(chave: string, valores: unknown, versao?: string): void {
  if (!chave) return;
  try {
    window.sessionStorage.setItem(PREFIXO + chave, JSON.stringify({ em: Date.now(), versao: versao ?? null, valores }));
  } catch {
    // Sem armazenamento (janela privada, bloqueio): a tela segue sem recuperar.
  }
}

export function descartarRascunho(chave: string): void {
  if (!chave) return;
  try {
    window.sessionStorage.removeItem(PREFIXO + chave);
  } catch {
    // idem
  }
}

function lerRascunho<T>(chave: string, versaoAtual?: string): { valores: T | null; versaoMudou: boolean } {
  const nada = { valores: null, versaoMudou: false };
  if (!chave) return nada;
  try {
    const bruto = window.sessionStorage.getItem(PREFIXO + chave);
    if (!bruto) return nada;
    const lido = JSON.parse(bruto) as { em?: unknown; versao?: unknown; valores?: unknown };
    if (typeof lido.em !== 'number' || Date.now() - lido.em > VALE_MS || lido.valores === null || typeof lido.valores !== 'object') {
      window.sessionStorage.removeItem(PREFIXO + chave);
      return nada;
    }
    if (versaoAtual !== undefined && (lido.versao ?? null) !== versaoAtual) return { valores: null, versaoMudou: true };
    return { valores: lido.valores as T, versaoMudou: false };
  } catch {
    return nada;
  }
}

export interface RascunhoDaTela<T> {
  /** Chave deste rascunho (escopo + caminho da página); vazia = sem escopo, nada é guardado. */
  chave: string;
  /** undefined = ainda não olhou (primeiro desenho); null = não há; senão, o que estava preenchido. */
  valores: T | null | undefined;
  /** O rascunho existia, mas a tela mudou desde então (outra pessoa salvou): foi descartado. */
  versaoMudou: boolean;
  /** O insumo que acabou de ser cadastrado e voltou na URL (`?insumoCriado=`), quando veio de lá. */
  insumoCriado: string | null;
  /** F.1a: o fornecedor que acabou de ser cadastrado e voltou na URL (`?fornecedorCriado=`), quando veio de lá. */
  fornecedorCriado: string | null;
  /** Esquece o rascunho (descartar, ou depois de gravar). */
  descartar: () => void;
}

/**
 * Lê (uma vez, depois do primeiro desenho) o rascunho desta pessoa nesta página e o insumo criado que voltou na URL. O rascunho é
 * consumido: ao recuperar, sai do armazenamento (se a pessoa sair de novo, o formulário guarda outro). `versaoAtual`: a versão que a
 * tela acabou de ler; se o rascunho foi guardado sobre outra, ele não volta.
 */
export function useRascunhoDaTela<T>(versaoAtual?: string): RascunhoDaTela<T> {
  const escopo = useContext(Escopo);
  // Sem o roteador montado (teste de renderização, pré-visualização) os dois vêm nulos: a tela funciona, só não recupera nada.
  const pathname = usePathname() ?? '';
  const chave = escopo && pathname ? `${escopo}:${pathname}` : '';
  const busca = useSearchParams();
  // Capturado no primeiro desenho: depois a barra de endereço é limpa e o parâmetro some, mas a tela já o aplicou.
  const [insumoCriado] = useState(() => busca?.get(PARAMETRO_INSUMO_CRIADO) ?? null);
  const [fornecedorCriado] = useState(() => busca?.get(PARAMETRO_FORNECEDOR_CRIADO) ?? null);
  const [valores, setValores] = useState<T | null | undefined>(undefined);
  const [versaoMudou, setVersaoMudou] = useState(false);
  useEffect(() => {
    const r = lerRascunho<T>(chave, versaoAtual);
    setValores(r.valores);
    setVersaoMudou(r.versaoMudou);
    descartarRascunho(chave);
    // Limpa o parâmetro da barra de endereço: recarregar a página não repete o aviso nem a escolha.
    if (pathname && [PARAMETRO_INSUMO_CRIADO, PARAMETRO_FORNECEDOR_CRIADO].some((k) => new URLSearchParams(window.location.search).has(k))) {
      const p = new URLSearchParams(window.location.search);
      p.delete(PARAMETRO_INSUMO_CRIADO);
      p.delete(PARAMETRO_FORNECEDOR_CRIADO);
      window.history.replaceState(window.history.state, '', p.toString() ? `${pathname}?${p}` : pathname);
    }
    // Só no primeiro desenho da página: o rascunho é desta visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { chave, valores, versaoMudou, insumoCriado, fornecedorCriado, descartar: () => descartarRascunho(chave) };
}

/** A tela mudou desde o rascunho: ele foi descartado. */
export function AvisoDeRascunhoVelho({ quando, oQue }: { quando: boolean; oQue: string }) {
  if (!quando) return null;
  return (
    <div role="status" className="rounded-[10px] border border-linha-forte px-4 py-3 text-sm text-texto">
      {oQue} mudou desde o seu rascunho (alguém salvou antes), então o rascunho foi descartado. Confira o que está na tela.
    </div>
  );
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
      <button type="button" onClick={aoDescartar} className="ff-transicao min-h-11 rounded-[7px] px-3 text-[13px] font-medium text-suave underline underline-offset-4 hover:text-texto sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
        Descartar e começar de novo
      </button>
    </div>
  );
}
