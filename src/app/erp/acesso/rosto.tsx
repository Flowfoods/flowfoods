'use client';

/**
 * Ativar e remover a entrada pelo rosto. Quem confere o rosto é o aparelho
 * (Face ID, reconhecimento facial ou digital); o site recebe e guarda só uma
 * chave pública. Nenhuma imagem é capturada nem enviada.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { acaoConfirmarRosto, acaoOpcoesDeAtivarRosto, acaoRemoverRosto } from '../actions';

export function AtivarRosto({ podeAtivar }: { podeAtivar: boolean }) {
  const router = useRouter();
  const [suporta, setSuporta] = useState<boolean | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setSuporta(browserSupportsWebAuthn() && window.isSecureContext);
  }, []);

  async function ativar() {
    setEsperando(true);
    setMsg(null);
    try {
      const r = await acaoOpcoesDeAtivarRosto();
      if (!r.ok) {
        setMsg({ ok: false, texto: r.erro });
      } else {
        const resposta = await startRegistration({ optionsJSON: r.opcoes });
        const fim = await acaoConfirmarRosto(resposta);
        setMsg(fim.ok ? { ok: true, texto: fim.mensagem } : { ok: false, texto: fim.erro });
        if (fim.ok) router.refresh();
      }
    } catch (e) {
      const nome = e instanceof Error ? e.name : '';
      setMsg({
        ok: false,
        texto:
          nome === 'InvalidStateError'
            ? 'Este aparelho já está ativado.'
            : nome === 'NotAllowedError' || nome === 'AbortError'
              ? 'Cancelado. Toque de novo quando quiser.'
              : 'O aparelho não conseguiu ativar. Tente de novo.',
      });
    }
    setEsperando(false);
  }

  if (suporta === false) {
    return <p className="text-[13px] text-surface/55">Este navegador não oferece entrada pelo rosto. No celular, use o Safari ou o Chrome.</p>;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={ativar}
        disabled={esperando || suporta === null || !podeAtivar}
        className="w-full rounded-[7px] bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {esperando ? 'Olhe para o aparelho…' : 'Ativar entrada por rosto neste aparelho'}
      </button>
      {!podeAtivar && (
        <p className="text-[12px] text-surface/50">
          Por segurança, só dá para ativar logo depois de entrar com a senha. Saia e entre de novo com a senha.
        </p>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-[13px] ${msg.ok ? 'text-success' : 'text-bright'}`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}

export function RemoverRosto({ id, aparelho }: { id: string; aparelho: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState('');
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        aria-label={`Remover ${aparelho}`}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoRemoverRosto(id);
            if (r.ok) router.refresh();
            else setErro(r.erro);
          })
        }
        className="whitespace-nowrap rounded-[7px] border border-white/[0.14] px-3 py-1.5 text-[12px] text-surface/75 transition hover:border-surface/40 hover:text-surface disabled:opacity-60"
      >
        {pendente ? 'Removendo…' : 'Remover'}
      </button>
      {erro && <span className="text-[12px] text-bright">{erro}</span>}
    </span>
  );
}
