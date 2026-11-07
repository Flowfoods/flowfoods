'use client';

/**
 * F4 — escolher o insumo ou o pré-preparo da ficha digitando (nome ou categoria), com a lista agrupada por
 * categoria. Substitui a lista suspensa comprida. O valor vai num campo escondido com o mesmo nome de antes
 * (`item_insumo`): o servidor não muda. Padrão de "combobox" com lista: setas, Enter escolhe, Esc fecha.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filtrarOpcoes, type OpcaoDoSeletor } from '@/lib/erp/seletor-campos';
import { CAMPO } from '../../ui/campos';

export function SeletorDeItem({
  id,
  name,
  valor,
  opcoes,
  aoEscolher,
  rotulo,
  invalido,
  descritoPor,
  selecionada,
  placeholder = 'Digite o nome ou a categoria',
  vazio,
  desabilitado = false,
  buscaExterna,
}: {
  id: string;
  name: string;
  valor: string;
  opcoes: readonly OpcaoDoSeletor[];
  aoEscolher: (valor: string) => void;
  rotulo: string;
  invalido?: boolean;
  descritoPor?: string;
  /** A seleção pode estar fora da página da busca, inclusive um vínculo arquivado. */
  selecionada?: OpcaoDoSeletor | null;
  placeholder?: string;
  vazio?: string;
  desabilitado?: boolean;
  buscaExterna?: {
    aoBuscar: (texto: string) => void;
    carregando: boolean;
    temMais: boolean;
    aoCarregarMais: () => void;
  };
}) {
  const lista = useId();
  const escolhida = opcoes.find((o) => o.valor === valor) ?? (selecionada?.valor === valor ? selecionada : null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const externa = !!buscaExterna;
  const { grupos, cortadas, total } = useMemo(
    () => filtrarOpcoes(opcoes, externa ? '' : aberto ? texto : '', externa ? Number.MAX_SAFE_INTEGER : undefined),
    [opcoes, texto, aberto, externa],
  );
  const planas = useMemo(() => grupos.flatMap((g) => g.opcoes), [grupos]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    document.getElementById(`${lista}-op-${ativo}`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto, lista]);

  function abrir() {
    if (desabilitado) return;
    setTexto('');
    buscaExterna?.aoBuscar('');
    const i = escolhida ? planas.findIndex((o) => o.valor === escolhida.valor) : -1;
    setAtivo(Math.max(0, i));
    setAberto(true);
  }

  function escolher(o: OpcaoDoSeletor) {
    aoEscolher(o.valor);
    setAberto(false);
    setTexto('');
    campo.current?.focus();
  }

  function teclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) return abrir();
      setAtivo((a) => Math.min(planas.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (aberto) {
        e.preventDefault();
        const o = planas[ativo];
        if (o) escolher(o);
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
        setTexto('');
      }
    } else if (e.key === 'Tab' && !buscaExterna?.temMais) {
      setAberto(false);
      setTexto('');
    }
  }

  const mostrado = aberto ? texto : escolhida ? escolhida.nome + (escolhida.detalhe ? ` · ${escolhida.detalhe}` : '') : '';
  let n = -1;

  return (
    <div ref={caixa} className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setAberto(false); setTexto(''); } }} onKeyDown={(e) => { if (e.key === 'Escape') { setAberto(false); setTexto(''); } }}>
      <input type="hidden" name={name} value={valor} />
      <input
        ref={campo}
        id={id}
        type="text"
        role="combobox"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && planas[ativo] ? `${lista}-op-${ativo}` : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={descritoPor}
        disabled={desabilitado}
        aria-busy={buscaExterna?.carregando || undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={escolhida ? escolhida.nome : placeholder}
        value={mostrado}
        onFocus={() => !aberto && abrir()}
        onClick={() => !aberto && abrir()}
        onChange={(e) => {
          if (!aberto) setAberto(true);
          setTexto(e.target.value);
          buscaExterna?.aoBuscar(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={teclar}
        className={`${CAMPO} pr-8`}
      />
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-suave" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 6l4 4 4-4" />
      </svg>
      {aberto && (
        <div className={`absolute left-0 right-0 z-30 mt-1 max-h-[min(22rem,60vh)] overflow-y-auto rounded-[7px] border border-linha-forte bg-fundo py-1 shadow-lg ${buscaExterna ? '' : 'sm:right-auto sm:min-w-[22rem]'}`}>
        <div
          id={lista}
          role="listbox"
          aria-label={rotulo}
        >
          {grupos.length === 0 && !buscaExterna?.carregando && <p className="px-3 py-3 text-[13px] text-suave">{vazio ?? `Nada com “${texto.trim()}”. Confira a escrita ou cadastre o insumo.`}</p>}
          {grupos.map((g, gi) => (
            <div key={g.grupo} role="group" aria-labelledby={`${lista}-g-${gi}`}>
              <p id={`${lista}-g-${gi}`} role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-suave">
                {g.grupo}
              </p>
              {g.opcoes.map((o) => {
                n += 1;
                const i = n;
                const marcado = o.valor === valor;
                return (
                  <div
                    key={o.valor}
                    id={`${lista}-op-${i}`}
                    role="option"
                    aria-selected={marcado}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => escolher(o)}
                    onPointerMove={() => setAtivo(i)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm sm:min-h-9 ${i === ativo ? 'bg-forte' : ''} ${marcado ? 'font-semibold' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                    {o.detalhe && <span className="shrink-0 text-[12px] text-suave">{o.detalhe}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {cortadas > 0 && (
            <p className="px-3 py-2 text-[12px] text-suave">
              Mostrando {total - cortadas} de {total}. Digite mais para achar o resto.
            </p>
          )}
        </div>
        {buscaExterna?.carregando && <p role="status" className="px-3 py-2 text-[13px] text-suave">Buscando…</p>}
        {buscaExterna?.temMais && (
          <button type="button" disabled={buscaExterna.carregando} onClick={() => { buscaExterna.aoCarregarMais(); campo.current?.focus(); }} className="min-h-11 w-full px-3 py-2 text-left text-sm font-semibold text-texto underline underline-offset-4 disabled:opacity-50">
            Carregar mais
          </button>
        )}
        </div>
      )}
    </div>
  );
}
