'use client';

/**
 * "Entrar com o rosto": o navegador pede ao aparelho (Face ID, reconhecimento
 * facial, digital) a chave guardada para este site. A imagem do rosto nunca
 * sai do aparelho; o servidor recebe só a assinatura do desafio.
 */

import { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { AREA_DO_ERP, destinoSeguro } from '@/lib/destino-seguro';
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
      const pedido = await acaoOpcoesDoRosto();
      if (!pedido.ok) {
        setErro(pedido.erro);
        setEsperando(false);
        return;
      }
      const resposta = await startAuthentication({ optionsJSON: pedido.opcoes });
      const r = await acaoEntrarComRosto(resposta);
      if (r.ok) {
        // Destino vem do servidor; mesmo assim, só dentro da área do ERP.
        window.location.assign(destinoSeguro(r.destino, window.location.origin, AREA_DO_ERP, '/erp'));
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
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-suave">
        <span className="h-px flex-1 bg-linha" />
        ou
        <span className="h-px flex-1 bg-linha" />
      </div>
      <button
        type="button"
        onClick={entrar}
        disabled={esperando}
        className="w-full rounded-[7px] border border-linha-forte px-4 py-3 text-[15px] font-semibold text-texto transition hover:border-texto/35 hover:bg-texto/5 disabled:cursor-wait disabled:opacity-60"
      >
        {esperando ? 'Olhe para o aparelho…' : 'Entrar com o rosto'}
      </button>
      {erro ? (
        <p role="alert" className="text-center text-[13px] text-erro">
          {erro}
        </p>
      ) : (
        <p className="text-center text-[12px] leading-relaxed text-suave">
          Funciona no aparelho em que você ativou a entrada pelo rosto.
        </p>
      )}
    </div>
  );
}
