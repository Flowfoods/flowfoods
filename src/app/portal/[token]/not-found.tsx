import { CONTACT_INFO } from '@/lib/constants';

/** Link do Portal errado ou antigo (decisão 471): antes caía no 404 padrão, em inglês e sem saída. */
export default function PortalNaoEncontrado() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-realce">FlowFoods · Formulário inicial</p>
      <h1 className="mt-3 font-serifa text-3xl font-bold leading-tight">Link não encontrado.</h1>
      <p className="mt-4 leading-relaxed text-footer/70">
        Confira se o link é o mesmo que o Rodolfo mandou, sem pedaço faltando. Se o problema continuar, fale com ele.
      </p>
      <a
        href={CONTACT_INFO.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex min-h-[48px] items-center bg-primary px-5 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-primary-dark"
      >
        WhatsApp {CONTACT_INFO.whatsappDisplay}
      </a>
    </main>
  );
}
