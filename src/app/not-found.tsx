import { CONTACT_INFO } from '@/lib/constants';

/** Endereço que não existe (decisão 471): em português, com a identidade e uma saída (antes, o 404 padrão em inglês). */
export default function NaoEncontrado() {
  return (
    <div className="ff-site min-h-screen bg-surface text-ink">
      <div className="h-1 w-full bg-marca" aria-hidden />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-realce">FlowFoods</p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">Página não encontrada.</h1>
        <p className="mt-4 leading-relaxed text-ink-3">O endereço pode ter mudado ou estar com um pedaço faltando.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/"
            className="inline-flex min-h-[48px] items-center bg-ink px-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:bg-primary hover:text-white"
          >
            Ir para o site
          </a>
          <a
            href={CONTACT_INFO.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center border border-ink/30 px-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink"
          >
            WhatsApp {CONTACT_INFO.whatsappDisplay}
          </a>
        </div>
      </main>
    </div>
  );
}
