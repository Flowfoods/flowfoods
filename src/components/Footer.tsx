import { CONTACT_INFO } from '@/lib/constants';

const NAV = [
  { label: 'Frentes', href: '#frentes' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Entregas', href: '#entregas' },
  { label: 'Rodolfo', href: '#sobre' },
  { label: 'Contato', href: '#contato' },
];

export default function Footer() {
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t border-ink/10 bg-surface px-5 md:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl font-bold leading-none text-ink">
            Flow<span className="text-primary">Foods</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-4">
            Consultoria para restaurantes. Estrutura, rentabilidade e crescimento, do diagnóstico à
            execução.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-5">Navegação</p>
          <nav className="mt-4 flex flex-col gap-2.5">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-ink-3 transition-colors hover:text-ink">
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-5">Contato</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <a
              href={CONTACT_INFO.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-3 transition-colors hover:text-ink"
            >
              WhatsApp {CONTACT_INFO.whatsappDisplay}
            </a>
            <a
              href={CONTACT_INFO.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-3 transition-colors hover:text-ink"
            >
              Instagram @{CONTACT_INFO.instagram}
            </a>
            <a
              href={CONTACT_INFO.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-3 transition-colors hover:text-ink"
            >
              LinkedIn
            </a>
            <span className="text-sm text-ink-3">Rio de Janeiro, RJ</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-ink/10 py-6 text-xs text-ink-5 sm:flex-row sm:items-center sm:justify-between">
        <p>© {ano} FlowFoods Consultoria.</p>
        <a href="/rodolfo/login" className="font-semibold uppercase tracking-[0.16em] transition-colors hover:text-ink">
          Entrar
        </a>
      </div>
    </footer>
  );
}
