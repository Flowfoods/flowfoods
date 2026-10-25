'use client';

/**
 * Busca ⌘K no Mac, Ctrl K nos outros (ou "/" fora de campo); no celular, sem dica de tecla. Escopo honesto: as telas que a
 * pessoa pode abrir (a mesma lista do menu), as ações das áreas que ela vê e
 * pode fazer ("Novo insumo", "Lançar nota"), os parceiros (nível 1) e os
 * insumos do parceiro atual por nome — estes pelo servidor, que confere
 * "ver insumos" antes de responder. Setas escolhem, Enter abre, Escape fecha.
 * Sem animação ao abrir: é atalho de uso diário.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Dialogo } from '../ui/Dialogo';
import type { ResultadoDaBusca } from './tipos';
import { BOTAO_ICONE } from './Popover';

const ROTULO_DO_TIPO: Record<ResultadoDaBusca['tipo'], string> = {
  tela: 'Tela',
  acao: 'Ação',
  parceiro: 'Parceiro',
  insumo: 'Insumo',
  ficha: 'Ficha',
};

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function BuscaGlobal({
  locais,
  buscarNoServidor,
}: {
  /** Telas e parceiros: filtrados aqui mesmo. */
  locais: ResultadoDaBusca[];
  /** Insumos: no servidor (com a permissão conferida lá). */
  buscarNoServidor?: (q: string) => Promise<ResultadoDaBusca[]>;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [q, setQ] = useState('');
  const [doServidor, setDoServidor] = useState<ResultadoDaBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const buscar = useRef(buscarNoServidor);
  buscar.current = buscarNoServidor;
  // Mac mostra ⌘K; os outros, Ctrl K. Lido depois de montar (o servidor não sabe o sistema).
  const [atalho, setAtalho] = useState('Ctrl K');
  useEffect(() => {
    const plataforma = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
    if (/mac|iphone|ipad/i.test(plataforma)) setAtalho('⌘K');
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberta(true);
      } else if (e.key === '/' && !digitando) {
        e.preventDefault();
        setAberta(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  useEffect(() => {
    if (aberta) requestAnimationFrame(() => campo.current?.focus());
    else {
      setQ('');
      setDoServidor([]);
    }
  }, [aberta]);

  // Insumos: espera a pessoa parar de digitar (200 ms) e descarta resposta velha.
  useEffect(() => {
    const termo = q.trim();
    if (!buscar.current || termo.length < 2) {
      setDoServidor([]);
      setBuscando(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      buscar.current!(termo)
        .then((r) => vivo && setDoServidor(r))
        .catch(() => vivo && setDoServidor([]))
        .finally(() => vivo && setBuscando(false));
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  const resultados = useMemo(() => {
    const termo = normalizar(q.trim());
    const daqui = termo
      ? locais.filter((r) => normalizar(`${r.rotulo} ${r.detalhe}`).includes(termo))
      : locais.filter((r) => r.tipo === 'tela');
    return [...daqui.slice(0, 12), ...doServidor];
  }, [q, locais, doServidor]);

  useEffect(() => setAtivo(0), [resultados.length, q]);

  function abrir(r: ResultadoDaBusca | undefined) {
    if (!r) return;
    setAberta(false);
    router.push(r.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Buscar (${atalho})`}
        aria-haspopup="dialog"
        className={`${BOTAO_ICONE} lg:inline-flex lg:w-auto lg:items-center lg:gap-2 lg:border lg:border-linha lg:px-3 lg:text-[13px]`}
      >
        <Search size={18} aria-hidden />
        <span className="hidden lg:inline">Buscar</span>
        <kbd className="ml-6 hidden rounded border border-linha px-1.5 font-sans text-[11px] text-suave xl:inline [@media(pointer:coarse)]:!hidden">
          {atalho}
        </kbd>
      </button>
      <Dialogo
        aberto={aberta}
        aoFechar={() => setAberta(false)}
        titulo="Buscar"
        esconderTitulo
        sheet
        className="mt-[12vh] w-[min(640px,calc(100vw-24px))] max-w-none"
      >
        <div className="flex items-center gap-2 border-b border-linha px-4">
          <Search size={18} aria-hidden className="shrink-0 text-suave" />
          <input
            ref={campo}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={resultados[ativo] ? `${idLista}-${ativo}` : undefined}
            aria-label="Buscar telas, ações, parceiros, insumos e fichas"
            placeholder="Telas, ações, insumos e fichas"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAtivo((a) => Math.min(a + 1, resultados.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAtivo((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                abrir(resultados[ativo]);
              }
            }}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-[15px] text-texto ff-sem-anel outline-none placeholder:text-suave/80"
          />
          <button
            type="button"
            onClick={() => setAberta(false)}
            aria-label="Fechar a busca"
            className="ff-transicao inline-flex min-h-11 shrink-0 items-center rounded-[7px] px-2 text-[12px] text-suave hover:bg-texto/5 hover:text-texto"
          >
            {/* Tecla só onde há teclado; no celular, a palavra. */}
            <span className="hidden sm:inline [@media(pointer:coarse)]:!hidden">Esc</span>
            <span className="sm:hidden [@media(pointer:coarse)]:!inline">Fechar</span>
          </button>
        </div>
        <ul
          id={idLista}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
        >
          {resultados.map((r, n) => (
            <li
              key={`${r.tipo}-${r.href}-${n}`}
              id={`${idLista}-${n}`}
              role="option"
              aria-selected={n === ativo}
              onMouseEnter={() => setAtivo(n)}
              onClick={() => abrir(r)}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-3 py-1.5 aria-selected:bg-forte"
            >
              <span className="w-16 shrink-0 text-[12px] text-suave">{ROTULO_DO_TIPO[r.tipo]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-texto">
                  {r.rotulo}
                  {r.desativado && <span className="ml-2 text-[12px] text-suave">desativado</span>}
                </span>
                <span className="block truncate text-[12px] text-suave">{r.detalhe}</span>
              </span>
              {n === ativo && <CornerDownLeft size={14} aria-hidden className="shrink-0 text-suave" />}
            </li>
          ))}
        </ul>
        <p aria-live="polite" className="border-t border-linha px-4 py-2.5 text-[12px] text-suave">
          {buscando
            ? 'Procurando insumos e fichas…'
            : resultados.length === 0
              ? `Nada encontrado para “${q.trim()}”.`
              : q.trim().length === 1 && buscarNoServidor
                ? 'Digite mais uma letra para procurar insumos.'
                : (
                  <>
                    {resultados.length} resultado{resultados.length === 1 ? '' : 's'}
                    <span className="hidden sm:inline [@media(pointer:coarse)]:!hidden"> · setas para escolher, Enter para abrir</span>
                  </>
                )}
        </p>
      </Dialogo>
    </>
  );
}
