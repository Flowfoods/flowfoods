'use client';

import { useState } from 'react';
import { CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';

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
          <button type="button" onClick={copiar} className={classeDeBotao('primario')}>
            {copiado ? 'Copiado' : '1. Copiar texto'}
          </button>
        )}

        {perfil ? (
          <a
            href={`https://instagram.com/${perfil}`}
            target="_blank"
            rel="noopener noreferrer"
            className={classeDeBotao('secundario')}
          >
            2. Abrir @{perfil}
          </a>
        ) : (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`${nome} instagram restaurante rio de janeiro`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={classeDeBotao('secundario')}
          >
            Procurar o @
          </a>
        )}

        {texto && (
          <button type="button" onClick={() => setAberto((v) => !v)} className={classeDeBotao('fantasma')}>
            {aberto ? 'Ocultar texto' : 'Ver texto'}
          </button>
        )}
      </div>

      {erroCopia && <p className="text-[13px] text-atencao">{erroCopia}</p>}

      {aberto && texto && (
        <textarea
          readOnly
          value={texto}
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
          className={`${CAMPO} py-2.5 text-[13px]`}
          aria-label="Texto para colar no Direct"
        />
      )}

      {!texto && (
        <p className="text-[13px] text-suave">
          Sem nota e avaliações no cadastro, o gancho não pode ser montado — e um gancho genérico não vale a pena.
          Complete o lead antes de abordar.
        </p>
      )}
    </div>
  );
}
