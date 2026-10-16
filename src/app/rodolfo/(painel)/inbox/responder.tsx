'use client';

import { useState, useTransition } from 'react';
import { MensagemDeResposta } from '@/components/erp/ui/botoes';
import { CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { acaoResponder, type Resposta } from '../actions';

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
      <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('secundario', 'mt-3')}>
        {rascunho ? 'Ver rascunho e responder' : 'Responder'}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {rascunho && (
        <p className="text-[12px] text-suave">
          Rascunho sugerido pela IA. Leia antes de enviar — o texto sai no seu nome.
        </p>
      )}

      <label htmlFor={`resposta-${leadId}`} className="sr-only">
        Resposta
      </label>
      <textarea
        id={`resposta-${leadId}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        placeholder="Escreva a resposta…"
        className={`${CAMPO} py-2.5`}
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
          className={classeDeBotao('primario')}
        >
          {pendente ? 'Enviando…' : 'Enviar resposta'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Fechar
        </button>
      </div>

      <MensagemDeResposta resposta={resposta} />
    </div>
  );
}
