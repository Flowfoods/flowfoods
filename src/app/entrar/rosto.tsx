'use client';

/**
 * "Entrar com o rosto": o navegador pede ao aparelho (Face ID, reconhecimento
 * facial, digital) a chave guardada para este site. A imagem do rosto nunca
 * sai do aparelho; o servidor recebe só a assinatura do desafio.
 */

import { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { acaoEntrarComRosto, acaoOpcoesDoRosto } from './actions';

export function EntrarComRosto() {
  const [suporta, setSuporta] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setSuporta(browserSupportsWebAuthn() && window.isSecureContext);
  }, []);

  if (!suporta) return null;

  async function entrar() {
    setEsperando(true);
    setErro('');
    try {
      const opcoes = await acaoOpcoesDoRosto();
      const resposta = await startAuthentication({ optionsJSON: opcoes });
      const r = await acaoEntrarComRosto(resposta);
      if (r.ok) {
        window.location.assign(r.destino);
        return;
      }
      setErro(r.erro);
    } catch (e) {
      const nome = e instanceof Error ? e.name : '';
      setErro(
        nome === 'NotAllowedError' || nome === 'AbortError'
          ? 'Cancelado. Tente de novo ou entre com a senha.'
          : 'Não deu para entrar com o rosto. Use e-mail e senha.',
      );
    }
    setEsperando(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-surface/35">
        <span className="h-px flex-1 bg-white/[0.08]" />
        ou
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>
      <button
        type="button"
        onClick={entrar}
        disabled={esperando}
        className="w-full rounded-[7px] border border-white/[0.16] px-4 py-3 text-[15px] font-semibold text-surface transition hover:border-surface/45 hover:bg-white/[0.04] disabled:cursor-wait disabled:opacity-60"
      >
        {esperando ? 'Olhe para o aparelho…' : 'Entrar com o rosto'}
      </button>
      {erro ? (
        <p role="alert" className="text-center text-[13px] text-bright">
          {erro}
        </p>
      ) : (
        <p className="text-center text-[12px] leading-relaxed text-surface/40">
          Funciona no aparelho em que você ativou a entrada pelo rosto.
        </p>
      )}
    </div>
  );
}
