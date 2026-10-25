'use client';

import { CONTACT_INFO } from '@/lib/constants';

/** Falha ao abrir o Portal (decisão 471): em português, com "Tentar de novo" e o WhatsApp; nada do servidor aparece. */
export default function ErroDoPortal({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-realce">FlowFoods · Formulário inicial</p>
      <h1 className="mt-3 font-serifa text-3xl font-bold leading-tight">Não deu para abrir o formulário agora.</h1>
      <p className="mt-4 leading-relaxed text-footer/70">
        O que você já escreveu está guardado. Tente de novo em instantes; se continuar, fale com o Rodolfo.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[48px] items-center bg-primary px-5 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-primary-dark"
        >
          Tentar de novo
        </button>
        <a
          href={CONTACT_INFO.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center border border-footer/30 px-5 text-sm font-semibold uppercase tracking-wider text-footer transition hover:border-footer/60"
        >
          WhatsApp {CONTACT_INFO.whatsappDisplay}
        </a>
      </div>
    </main>
  );
}
