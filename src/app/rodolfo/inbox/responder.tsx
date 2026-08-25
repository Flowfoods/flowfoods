'use client';

import { useState, useTransition } from 'react';
import { acaoResponder, type Resposta } from '../actions';
import { MensagemForm } from '../botoes';

/**
 * Campo de resposta com o rascunho da IA já dentro — editável.
 *
 * Não existe botão "enviar o rascunho como está" separado: o texto passa pelo
 * campo, e enviar é sempre um ato de quem leu.
 */
export function Responder({ leadId, rascunho }: { leadId: string; rascunho: string }) {
  const [texto, setTexto] = useState(rascunho);
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-surface/75 transition hover:border-white/30 hover:text-surface"
      >
        {rascunho ? 'Ver rascunho e responder' : 'Responder'}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {rascunho && (
        <p className="text-[11px] text-surface/45">
          Rascunho sugerido pela IA. Leia antes de enviar — o texto sai no seu nome.
        </p>
      )}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        placeholder="Escreva a resposta…"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-surface/25 focus:border-bright"
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendente || !texto.trim()}
          onClick={() =>
            iniciar(async () => {
              try {
                const r = await acaoResponder(leadId, texto);
                setResposta(r);
                if (r.ok) setAberto(false);
              } catch (e) {
                setResposta({ ok: false, mensagem: e instanceof Error ? e.message : 'Falhou.' });
              }
            })
          }
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-bright disabled:opacity-50"
        >
          {pendente ? 'Enviando…' : 'Enviar'}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-surface/70 transition hover:border-white/30"
        >
          Fechar
        </button>
      </div>

      <MensagemForm resposta={resposta} />
    </div>
  );
}
