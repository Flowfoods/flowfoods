'use client';

import { useState } from 'react';

/**
 * Copiar → abrir Direct.
 *
 * Dois botões, nessa ordem, porque é a ordem em que a coisa funciona: o
 * Instagram não aceita texto por link, então o texto tem que estar na área de
 * transferência ANTES de o app abrir.
 *
 * Quando o @ ainda não é conhecido, "Procurar" abre a busca do Google já
 * montada — o Google Places não devolve o perfil, então descobrir o @ é
 * trabalho manual mesmo.
 */
export function CartaoVisita({
  nome,
  instagram,
  texto,
}: {
  nome: string;
  instagram: string | null;
  texto: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const [erroCopia, setErroCopia] = useState('');
  const [aberto, setAberto] = useState(false);

  const perfil = instagram?.replace(/^@/, '').trim();

  async function copiar() {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setErroCopia('');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // `navigator.clipboard` exige contexto seguro e pode ser negado. Em vez de
      // falhar em silêncio, abre o texto para seleção manual.
      setErroCopia('Não consegui copiar. Selecione o texto abaixo e copie à mão.');
      setAberto(true);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {texto && (
          <button
            type="button"
            onClick={copiar}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-bright"
          >
            {copiado ? 'Copiado ✓' : '1. Copiar texto'}
          </button>
        )}

        {perfil ? (
          <a
            href={`https://instagram.com/${perfil}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-surface/80 transition hover:border-white/30 hover:text-surface"
          >
            2. Abrir @{perfil}
          </a>
        ) : (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`${nome} instagram restaurante rio de janeiro`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-surface/80 transition hover:border-white/30 hover:text-surface"
          >
            Procurar o @
          </a>
        )}

        {texto && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded-lg px-3 py-2 text-xs text-surface/55 transition hover:text-surface"
          >
            {aberto ? 'ocultar texto' : 'ver texto'}
          </button>
        )}
      </div>

      {erroCopia && <p className="text-xs text-warning">{erroCopia}</p>}

      {aberto && texto && (
        <textarea
          readOnly
          value={texto}
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs text-surface/85 outline-none focus:border-bright"
        />
      )}

      {!texto && (
        <p className="text-xs text-surface/45">
          Sem nota e avaliações no cadastro, o gancho não pode ser montado — e um gancho
          genérico não vale a pena. Complete o lead antes de abordar.
        </p>
      )}
    </div>
  );
}
