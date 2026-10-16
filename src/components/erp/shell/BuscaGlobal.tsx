'use client';

/**
 * Busca ⌘K (Ctrl+K, ou "/" fora de campo). Escopo honesto: as telas que a
 * pessoa pode abrir (a mesma lista do menu), os parceiros (nível 1) e os
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
  parceiro: 'Parceiro',
  insumo: 'Insumo',
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
        aria-label="Buscar (Ctrl+K)"
        aria-haspopup="dialog"
        className={`${BOTAO_ICONE} lg:inline-flex lg:w-auto lg:items-center lg:gap-2 lg:border lg:border-linha lg:px-3 lg:text-[13px]`}
      >
        <Search size={18} aria-hidden />
        <span className="hidden lg:inline">Buscar</span>
        <kbd className="ml-6 hidden rounded border border-linha px-1.5 font-sans text-[11px] text-suave lg:inline">
          Ctrl K
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
            aria-label="Buscar telas, parceiros e insumos"
            placeholder="Telas, parceiros e insumos"
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
            className="ff-transicao shrink-0 rounded-[7px] px-2 py-1 text-[12px] text-suave hover:bg-texto/5 hover:text-texto"
          >
            Esc
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
            ? 'Procurando insumos…'
            : resultados.length === 0
              ? `Nada encontrado para “${q.trim()}”.`
              : q.trim().length === 1 && buscarNoServidor
                ? 'Digite mais uma letra para procurar insumos.'
                : `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} · setas para escolher, Enter para abrir`}
        </p>
      </Dialogo>
    </>
  );
}
